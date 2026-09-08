import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Channel } from '../src/domain/models.js';
import type { Platform, PlatformCapabilities } from '../src/platform/contracts.js';
import type { NumericZapTimers } from '../src/live-tv/numeric-zap-buffer.js';
import type { ChannelIntentEvent } from '../src/live-tv/contracts.js';
import type { ProviderSnapshot } from '../src/providers/provider-core-service.js';
import {
  LiveTvController,
  type ChannelIntentPort,
  type LiveTvView,
  type LiveTvViewModel,
} from '../src/live-tv/live-tv-controller.js';

function category(id: string): Category {
  return { providerId: 'provider-1', id, name: id };
}

function channel(
  id: string,
  categoryId: string | null,
  number: number | null = null,
): Channel {
  return {
    providerId: 'provider-1',
    id,
    name: `Channel ${id}`,
    categoryId,
    logoUrl: null,
    number,
  };
}

function snapshot(channels: readonly Channel[] = [
  channel('news-1', 'news', 1),
  channel('news-2', 'news', 42),
  channel('sports-1', 'sports', 7),
]): ProviderSnapshot {
  return {
    provider: {
      id: 'provider-1',
      kind: 'xtream',
      name: 'Provider 1',
      createdAtMs: 1,
      lastSuccessfulSyncAtMs: null,
    },
    categories: [category('news'), category('sports')],
    channels,
  };
}

class FakeIntent implements ChannelIntentPort {
  readonly requests: Array<{
    providerId: string;
    channelId: string;
    previousChannelId: string | null;
  }> = [];

  async requestChannel(input: {
    providerId: string;
    channelId: string;
    previousChannelId: string | null;
  }): Promise<'playing' | 'failed' | 'stale'> {
    this.requests.push(input);
    return 'playing';
  }
}

class FakePlatform implements Platform {
  exits = 0;
  registered: string[][] = [];

  constructor(private readonly numericKeys: boolean) {}

  capabilities(): PlatformCapabilities {
    return {
      tizen: true,
      optionsKey: true,
      channelKeys: true,
      numericKeys: this.numericKeys,
    };
  }

  registerOptionalKeys(keys: readonly string[]): void {
    this.registered.push([...keys]);
  }

  exitApp(): void {
    this.exits += 1;
  }
}

class FakeView implements LiveTvView {
  readonly renders: Array<{ state: ReturnType<LiveTvController['state']>; model: LiveTvViewModel }> = [];

  render(state: ReturnType<LiveTvController['state']>, model: LiveTvViewModel): void {
    this.renders.push({ state: { ...state }, model });
  }
}

class FakeTimers implements NumericZapTimers {
  private nextId = 0;
  private callbacks = new Map<number, () => void>();
  latestId: number | null = null;
  readonly delays: number[] = [];
  readonly cleared: number[] = [];

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    this.latestId = id;
    this.delays.push(delayMs);
    return id;
  }

  clearTimeout(handle: unknown): void {
    const id = Number(handle);
    this.cleared.push(id);
    this.callbacks.delete(id);
  }

  fireLatest(): void {
    if (this.latestId === null) return;
    const id = this.latestId;
    const callback = this.callbacks.get(id);
    this.callbacks.delete(id);
    this.latestId = null;
    callback?.();
  }
}

function makeController(numericKeys = true, snap = snapshot()) {
  const intent = new FakeIntent();
  const platform = new FakePlatform(numericKeys);
  const view = new FakeView();
  const timers = new FakeTimers();
  const controller = new LiveTvController({
    intent,
    platform,
    view,
    numericTimers: timers,
  });
  controller.enter(snap);
  return { controller, intent, platform, view, timers };
}

function event(
  type: ChannelIntentEvent['type'],
  channelId: string,
  previousChannelId: string | null,
  id = 1,
): ChannelIntentEvent {
  const intent = { id, channelId, previousChannelId };
  if (type === 'PLAYING') return { type, intent, engine: 'shaka' };
  if (type === 'FAILED') {
    return { type, intent, error: 'ENGINE_FAILURE', rollback: 'restored' };
  }
  return { type, intent } as ChannelIntentEvent;
}

void test('first entry opens overlay and highlights the first channel without requesting playback', () => {
  const { controller, intent } = makeController();

  assert.equal(controller.state().overlayOpen, true);
  assert.equal(controller.state().highlightedChannelId, 'news-1');
  assert.equal(controller.state().playingChannelId, null);
  assert.deepEqual(intent.requests, []);
});

void test('category movement changes scope and highlight but never requests playback', async () => {
  const { controller, intent } = makeController();

  await controller.handleInput({ type: 'ACTION', action: 'LEFT' });
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });

  assert.deepEqual(controller.state().activeScope, { kind: 'category', categoryId: 'news' });
  assert.equal(controller.state().highlightedChannelId, 'news-1');
  assert.equal(controller.state().overlayZone, 'CATEGORY');
  assert.equal(intent.requests.length, 0);
});

void test('select plays highlighted channel and PLAYING closes overlay', async () => {
  const { controller, intent } = makeController();

  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.deepEqual(intent.requests.at(-1), {
    providerId: 'provider-1',
    channelId: 'news-1',
    previousChannelId: null,
  });

  controller.handleIntentEvent(event('RESOLVING', 'news-1', null));
  controller.handleIntentEvent(event('PREPARING', 'news-1', null));
  controller.handleIntentEvent(event('PLAYING', 'news-1', null));

  assert.equal(controller.state().playingChannelId, 'news-1');
  assert.equal(controller.state().playbackStatus, 'PLAYING');
  assert.equal(controller.state().overlayOpen, false);
  assert.equal(controller.state().playbackError, null);
});

void test('failed selected channel stays highlighted and overlay stays open after rollback restores previous playback', async () => {
  const { controller, intent } = makeController();
  controller.handleIntentEvent(event('PLAYING', 'news-1', null));

  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });

  assert.deepEqual(intent.requests.at(-1), {
    providerId: 'provider-1',
    channelId: 'news-2',
    previousChannelId: 'news-1',
  });

  controller.handleIntentEvent(event('RESOLVING', 'news-2', 'news-1', 2));
  controller.handleIntentEvent({
    type: 'FAILED',
    intent: { id: 2, channelId: 'news-2', previousChannelId: 'news-1' },
    error: 'ENGINE_FAILURE',
    rollback: 'restored',
  });

  assert.equal(controller.state().playingChannelId, 'news-1');
  assert.equal(controller.state().highlightedChannelId, 'news-2');
  assert.equal(controller.state().overlayOpen, true);
  assert.equal(controller.state().playbackStatus, 'FAILED');
  assert.equal(controller.state().playbackError, 'ENGINE_FAILURE');
});

void test('CHANNEL_UP and CHANNEL_DOWN use active scope and clamp without wrapping', async () => {
  const { controller, intent } = makeController();
  controller.handleIntentEvent(event('PLAYING', 'news-1', null));
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  await controller.handleInput({ type: 'ACTION', action: 'LEFT' });
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  await controller.handleInput({ type: 'ACTION', action: 'RIGHT' });

  intent.requests.length = 0;
  await controller.handleInput({ type: 'ACTION', action: 'CHANNEL_UP' });
  assert.equal(intent.requests.length, 0);

  await controller.handleInput({ type: 'ACTION', action: 'CHANNEL_DOWN' });
  assert.equal(intent.requests.at(-1)?.channelId, 'news-2');

  controller.handleIntentEvent(event('PLAYING', 'news-2', 'news-1', 3));
  intent.requests.length = 0;
  await controller.handleInput({ type: 'ACTION', action: 'CHANNEL_DOWN' });
  assert.equal(intent.requests.length, 0);
});

void test('numeric commit requires capability and exactly one matching provider channel number', () => {
  const withoutCapability = makeController(false);
  withoutCapability.controller.handleInput({ type: 'DIGIT', digit: 4 });
  withoutCapability.controller.handleInput({ type: 'DIGIT', digit: 2 });
  withoutCapability.timers.fireLatest();
  assert.equal(withoutCapability.intent.requests.length, 0);
  assert.equal(withoutCapability.controller.state().numericInput, '');

  const withCapability = makeController(true);
  withCapability.controller.handleInput({ type: 'DIGIT', digit: 4 });
  withCapability.controller.handleInput({ type: 'DIGIT', digit: 2 });
  assert.equal(withCapability.controller.state().numericInput, '42');
  assert.deepEqual(withCapability.timers.delays, [500, 500]);
  assert.equal(withCapability.timers.cleared.length, 1);
  withCapability.timers.fireLatest();
  assert.equal(withCapability.intent.requests.at(-1)?.channelId, 'news-2');
  assert.equal(withCapability.controller.state().numericInput, '');

  const ambiguous = makeController(true, snapshot([
    channel('a', 'news', 42),
    channel('b', 'sports', 42),
  ]));
  ambiguous.controller.handleInput({ type: 'DIGIT', digit: 4 });
  ambiguous.controller.handleInput({ type: 'DIGIT', digit: 2 });
  ambiguous.timers.fireLatest();
  assert.equal(ambiguous.intent.requests.length, 0);
  assert.equal(ambiguous.controller.state().numericInput, '');
});

void test('Back closes option layer, then overlay, then exits through platform with no modal', async () => {
  const { controller, platform } = makeController();

  await controller.handleInput({ type: 'ACTION', action: 'OPTIONS' });
  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(controller.state().overlayOpen, true);
  assert.equal(platform.exits, 0);

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(controller.state().overlayOpen, false);
  assert.equal(platform.exits, 0);

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(platform.exits, 1);
});

void test('catalog refresh keeps a still-playing removed channel while restoring a valid highlighted channel', () => {
  const { controller } = makeController();
  controller.handleIntentEvent(event('PLAYING', 'news-1', null));
  controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  controller.syncCatalog(snapshot([
    channel('news-2', 'news', 42),
    channel('sports-1', 'sports', 7),
  ]));

  assert.equal(controller.state().playingChannelId, 'news-1');
  assert.equal(controller.state().highlightedChannelId, 'news-2');
});
