import test from 'node:test';
import assert from 'node:assert/strict';
import type { CredentialStore, ProviderCredential } from '../src/credentials/contracts.js';
import type { Channel, ProviderId, ProviderRecord } from '../src/domain/models.js';
import { ChannelIntentCoordinator } from '../src/live-tv/channel-intent-coordinator.js';
import type {
  ChannelIntentEvent,
  ChannelStreamResolver,
  PlayerSessionPort,
  SessionSwitchRequest,
  SessionSwitchResult,
} from '../src/live-tv/contracts.js';
import {
  LiveTvController,
  type ChannelIntentPort,
} from '../src/live-tv/live-tv-controller.js';
import type { NumericZapTimers } from '../src/live-tv/numeric-zap-buffer.js';
import { ProviderStreamResolver } from '../src/live-tv/provider-stream-resolver.js';
import type {
  PlaybackEngineName,
  PlaybackEnginePort,
  PlaybackResult,
  StreamRequest,
} from '../src/playback/contracts.js';
import { PlayerSessionCoordinator } from '../src/playback/player-session-coordinator.js';
import type { ProviderAdapter, ProviderAdapterFactory } from '../src/providers/contracts.js';
import { ProviderError } from '../src/providers/errors.js';
import type { ProviderRepository } from '../src/repository/provider-repository.js';
import { StructuredWatchStateRepository } from '../src/repository/structured-watch-state-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';
import {
  PlaybackWatchObserver,
  WatchObservingPlayerSession,
  type WatchClock,
} from '../src/watch/playback-session-observer.js';
import { WatchStateService } from '../src/watch/service.js';

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function stream(id: string): StreamRequest {
  return { url: `https://stream.example.test/${id}` };
}

class DeferredResolver implements ChannelStreamResolver {
  readonly calls: Array<{ providerId: string; channelId: string }> = [];
  readonly pending = new Map<string, ReturnType<typeof deferred<StreamRequest>>>();

  add(channelId: string): ReturnType<typeof deferred<StreamRequest>> {
    const item = deferred<StreamRequest>();
    this.pending.set(channelId, item);
    return item;
  }

  resolve(providerId: string, channelId: string): Promise<StreamRequest> {
    this.calls.push({ providerId, channelId });
    const item = this.pending.get(channelId);
    if (item === undefined) throw new Error(`missing deferred stream for ${channelId}`);
    return item.promise;
  }
}

class RecordingSession implements PlayerSessionPort {
  readonly requests: SessionSwitchRequest[] = [];

  constructor(
    private readonly handler: (request: SessionSwitchRequest) => Promise<SessionSwitchResult>,
  ) {}

  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult> {
    this.requests.push(request);
    return this.handler(request);
  }

  stop(): void {}
}

class QueueEngine implements PlaybackEnginePort {
  readonly opened: string[] = [];
  stops = 0;

  constructor(
    readonly name: PlaybackEngineName,
    private readonly results: Array<PlaybackResult | Promise<PlaybackResult>>,
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async open(request: StreamRequest): Promise<PlaybackResult> {
    this.opened.push(request.url);
    const next = this.results.shift();
    if (next === undefined) throw new Error(`missing ${this.name} result`);
    return next;
  }

  stop(): void {
    this.stops += 1;
  }
}

function sessionRequest(input: {
  intentId: number;
  providerId?: string;
  target: string;
  previous?: string | null;
  initial?: StreamRequest;
  resolvePrevious?: (() => Promise<StreamRequest>) | null;
  isCurrent?: () => boolean;
  onRecovering?: () => void;
}): SessionSwitchRequest {
  const previous = input.previous ?? null;
  return {
    intentId: input.intentId,
    providerId: input.providerId,
    targetChannelId: input.target,
    previousChannelId: previous,
    initialRequest: input.initial ?? stream(input.target),
    reResolveTarget: async () => stream(`${input.target}-refresh`),
    resolvePrevious: input.resolvePrevious === undefined
      ? previous === null
        ? null
        : async () => stream(previous)
      : input.resolvePrevious,
    isCurrent: input.isCurrent ?? (() => true),
    onRecovering: input.onRecovering ?? (() => {}),
  };
}

class FakeClock implements WatchClock {
  constructor(public value: number) {}

  now(): number {
    return this.value;
  }

  advance(deltaMs: number): void {
    this.value += deltaMs;
  }
}

function watchHarness(clock: FakeClock) {
  const repository = new StructuredWatchStateRepository(new MemoryStructuredStore());
  const service = new WatchStateService(repository, { minimumSessionMs: 30_000 });
  const observer = new PlaybackWatchObserver(service, clock);
  return { service, observer };
}

class PlannedSession implements PlayerSessionPort {
  calls = 0;

  constructor(
    private readonly plan: (request: SessionSwitchRequest) => Promise<SessionSwitchResult>,
  ) {}

  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult> {
    this.calls += 1;
    return this.plan(request);
  }

  stop(): void {}
}

void test('M7 PLAY rapid zap latest intent wins when A B C resolve or reject out of order', async () => {
  const resolver = new DeferredResolver();
  const a = resolver.add('a');
  const b = resolver.add('b');
  const c = resolver.add('c');
  const events: ChannelIntentEvent[] = [];
  const session = new RecordingSession(async () => ({ status: 'playing', engine: 'shaka' }));
  const coordinator = new ChannelIntentCoordinator(resolver, session, (event) => events.push(event));

  const pA = coordinator.requestChannel({ providerId: 'p1', channelId: 'a', previousChannelId: null });
  const pB = coordinator.requestChannel({ providerId: 'p1', channelId: 'b', previousChannelId: null });
  const pC = coordinator.requestChannel({ providerId: 'p1', channelId: 'c', previousChannelId: null });

  b.resolve(stream('b'));
  assert.equal(await pB, 'stale');
  a.reject(new ProviderError('NETWORK', null, 'synthetic stale failure'));
  assert.equal(await pA, 'stale');
  c.resolve(stream('c'));
  assert.equal(await pC, 'playing');

  assert.deepEqual(session.requests.map((request) => request.targetChannelId), ['c']);
  assert.deepEqual(
    events.filter((event) => event.type === 'PLAYING').map((event) => event.intent.channelId),
    ['c'],
  );
  assert.equal(events.some((event) => event.type === 'FAILED'), false);
});

void test('M7 PLAY repeated same provider and channel still obeys last-intent-wins', async () => {
  const first = deferred<StreamRequest>();
  const second = deferred<StreamRequest>();
  let resolution = 0;
  const resolver: ChannelStreamResolver = {
    resolve() {
      resolution += 1;
      return resolution === 1 ? first.promise : second.promise;
    },
  };
  const session = new RecordingSession(async () => ({ status: 'playing', engine: 'shaka' }));
  const coordinator = new ChannelIntentCoordinator(resolver, session);

  const older = coordinator.requestChannel({
    providerId: 'p1',
    channelId: 'shared',
    previousChannelId: null,
  });
  const newer = coordinator.requestChannel({
    providerId: 'p1',
    channelId: 'shared',
    previousChannelId: null,
  });

  second.resolve(stream('shared-newer'));
  assert.equal(await newer, 'playing');
  first.resolve(stream('shared-older'));
  assert.equal(await older, 'stale');

  assert.equal(session.requests.length, 1);
  assert.equal(session.requests[0]?.targetChannelId, 'shared');
  assert.equal(session.requests[0]?.initialRequest.url, 'https://stream.example.test/shared-newer');
});

void test('M7 PLAY stale playback completion and stale error cannot replace newer valid state', async () => {
  const firstEntered = deferred<void>();
  const firstResult = deferred<SessionSwitchResult>();
  const events: ChannelIntentEvent[] = [];
  const resolver: ChannelStreamResolver = {
    async resolve(providerId, channelId) {
      return stream(`${providerId}-${channelId}`);
    },
  };
  const session = new RecordingSession(async (request) => {
    if (request.targetChannelId === 'a') {
      firstEntered.resolve();
      return firstResult.promise;
    }
    return { status: 'playing', engine: 'avplay' };
  });
  const coordinator = new ChannelIntentCoordinator(resolver, session, (event) => events.push(event));

  const pA = coordinator.requestChannel({ providerId: 'p1', channelId: 'a', previousChannelId: null });
  await firstEntered.promise;
  const pB = coordinator.requestChannel({ providerId: 'p1', channelId: 'b', previousChannelId: 'a' });
  assert.equal(await pB, 'playing');

  firstResult.resolve({ status: 'failed', error: 'NETWORK', rollback: 'failed' });
  assert.equal(await pA, 'stale');
  assert.deepEqual(
    events.filter((event) => event.type === 'PLAYING').map((event) => event.intent.channelId),
    ['b'],
  );
  assert.equal(
    events.some((event) => event.type === 'FAILED' && event.intent.channelId === 'a'),
    false,
  );
});

void test('M7 PLAY target failure performs one bounded rollback and restores previous playback', async () => {
  const shaka = new QueueEngine('shaka', [
    { ok: true, engine: 'shaka', error: null },
    { ok: false, engine: null, error: 'ENGINE_FAILURE' },
    { ok: true, engine: 'shaka', error: null },
  ]);
  const avplay = new QueueEngine('avplay', [
    { ok: false, engine: null, error: 'ENGINE_FAILURE' },
  ]);
  const session = new PlayerSessionCoordinator(shaka, avplay, { sleep: async () => {} });

  assert.deepEqual(await session.switchTo(sessionRequest({
    intentId: 1,
    providerId: 'p1',
    target: 'a',
  })), { status: 'playing', engine: 'shaka' });

  assert.deepEqual(await session.switchTo(sessionRequest({
    intentId: 2,
    providerId: 'p1',
    target: 'b',
    previous: 'a',
  })), {
    status: 'failed',
    error: 'ENGINE_FAILURE',
    rollback: 'restored',
  });

  assert.deepEqual(shaka.opened, [
    'https://stream.example.test/a',
    'https://stream.example.test/b',
    'https://stream.example.test/a',
  ]);
  assert.deepEqual(avplay.opened, ['https://stream.example.test/b']);
});

void test('M7 PLAY rollback failure is bounded and reports failed without oscillation', async () => {
  const shaka = new QueueEngine('shaka', [
    { ok: true, engine: 'shaka', error: null },
    { ok: false, engine: null, error: 'ENGINE_FAILURE' },
    { ok: false, engine: null, error: 'ENGINE_FAILURE' },
  ]);
  const avplay = new QueueEngine('avplay', [
    { ok: false, engine: null, error: 'ENGINE_FAILURE' },
    { ok: false, engine: null, error: 'ENGINE_FAILURE' },
  ]);
  const session = new PlayerSessionCoordinator(shaka, avplay, { sleep: async () => {} });

  await session.switchTo(sessionRequest({ intentId: 1, providerId: 'p1', target: 'a' }));
  assert.deepEqual(await session.switchTo(sessionRequest({
    intentId: 2,
    providerId: 'p1',
    target: 'b',
    previous: 'a',
  })), {
    status: 'failed',
    error: 'ENGINE_FAILURE',
    rollback: 'failed',
  });

  assert.deepEqual(shaka.opened, [
    'https://stream.example.test/a',
    'https://stream.example.test/b',
    'https://stream.example.test/a',
  ]);
  assert.deepEqual(avplay.opened, [
    'https://stream.example.test/b',
    'https://stream.example.test/a',
  ]);
});

void test('M7 PLAY stale rollback is inert after a newer C intent owns the session', async () => {
  const previous = deferred<StreamRequest>();
  const recovering = deferred<void>();
  const shaka = new QueueEngine('shaka', [
    { ok: true, engine: 'shaka', error: null },
    { ok: false, engine: null, error: 'ENGINE_FAILURE' },
    { ok: true, engine: 'shaka', error: null },
  ]);
  const avplay = new QueueEngine('avplay', [
    { ok: false, engine: null, error: 'ENGINE_FAILURE' },
  ]);
  const session = new PlayerSessionCoordinator(shaka, avplay, { sleep: async () => {} });

  await session.switchTo(sessionRequest({ intentId: 1, providerId: 'p1', target: 'a' }));
  const pB = session.switchTo(sessionRequest({
    intentId: 2,
    providerId: 'p1',
    target: 'b',
    previous: 'a',
    resolvePrevious: () => previous.promise,
    onRecovering: () => recovering.resolve(),
  }));
  await recovering.promise;

  const pC = session.switchTo(sessionRequest({ intentId: 3, providerId: 'p1', target: 'c' }));
  previous.resolve(stream('a'));

  assert.deepEqual(await pB, {
    status: 'failed',
    error: 'ENGINE_FAILURE',
    rollback: 'not-needed',
  });
  assert.deepEqual(await pC, { status: 'playing', engine: 'shaka' });
  assert.deepEqual(shaka.opened, [
    'https://stream.example.test/a',
    'https://stream.example.test/b',
    'https://stream.example.test/c',
  ]);
});

void test('M7 PLAY cross-provider resolution failure preserves active A watch ownership and sanitizes error', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);
  const inner = new PlannedSession(async (request) => {
    request.onHandoffStarted?.();
    return { status: 'playing', engine: 'shaka' };
  });
  const watched = new WatchObservingPlayerSession(inner, observer);
  const events: ChannelIntentEvent[] = [];

  await watched.switchTo(sessionRequest({ intentId: 1, providerId: 'provider-a', target: 'shared' }));
  inner.calls = 0;
  clock.advance(20_000);

  const coordinator = new ChannelIntentCoordinator({
    async resolve(providerId, channelId) {
      if (providerId === 'provider-b') {
        throw new ProviderError(
          'NOT_FOUND',
          404,
          'synthetic missing target https://user:secret@example.invalid/private',
        );
      }
      return stream(`${providerId}-${channelId}`);
    },
  }, watched, (event) => events.push(event));

  assert.equal(await coordinator.requestChannel({
    providerId: 'provider-b',
    channelId: 'shared',
    previousChannelId: null,
  }), 'failed');
  assert.equal(inner.calls, 0);

  const failure = events.find((event) => event.type === 'FAILED');
  assert.deepEqual(failure, {
    type: 'FAILED',
    intent: { id: 1, channelId: 'shared', previousChannelId: null },
    error: 'STREAM_NOT_FOUND',
    rollback: 'not-needed',
  });
  assert.equal(JSON.stringify(events).includes('secret'), false);

  clock.advance(20_000);
  await watched.stop();
  await observer.flush();

  assert.deepEqual(await service.getAggregate('provider-a', 'shared'), {
    providerId: 'provider-a',
    channelId: 'shared',
    meaningfulWatchMs: 40_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 41_000,
  });
  assert.equal(await service.getAggregate('provider-b', 'shared'), null);
});

void test('M7 PLAY successful cross-provider A to B switch partitions same channelId watch sessions', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);
  const inner = new PlannedSession(async (request) => {
    request.onHandoffStarted?.();
    return { status: 'playing', engine: 'shaka' };
  });
  const watched = new WatchObservingPlayerSession(inner, observer);

  await watched.switchTo(sessionRequest({ intentId: 1, providerId: 'provider-a', target: 'shared' }));
  clock.advance(35_000);
  await watched.switchTo(sessionRequest({
    intentId: 2,
    providerId: 'provider-b',
    target: 'shared',
    previous: 'shared',
  }));
  clock.advance(40_000);
  await watched.stop();
  await observer.flush();

  assert.deepEqual(await service.getAggregate('provider-a', 'shared'), {
    providerId: 'provider-a',
    channelId: 'shared',
    meaningfulWatchMs: 35_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 36_000,
  });
  assert.deepEqual(await service.getAggregate('provider-b', 'shared'), {
    providerId: 'provider-b',
    channelId: 'shared',
    meaningfulWatchMs: 40_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 76_000,
  });
});

void test('M7 PLAY failed target with rollback never credits target watch and restores previous ownership', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);
  let call = 0;
  const inner = new PlannedSession(async (request) => {
    request.onHandoffStarted?.();
    call += 1;
    if (call === 1) return { status: 'playing', engine: 'shaka' };
    clock.advance(5_000);
    request.onRollbackRestored?.('shaka');
    return { status: 'failed', error: 'ENGINE_FAILURE', rollback: 'restored' };
  });
  const watched = new WatchObservingPlayerSession(inner, observer);

  await watched.switchTo(sessionRequest({ intentId: 1, providerId: 'p1', target: 'a' }));
  clock.advance(35_000);
  await watched.switchTo(sessionRequest({ intentId: 2, providerId: 'p1', target: 'b', previous: 'a' }));
  clock.advance(40_000);
  await watched.stop();
  await observer.flush();

  assert.deepEqual(await service.getAggregate('p1', 'a'), {
    providerId: 'p1',
    channelId: 'a',
    meaningfulWatchMs: 75_000,
    meaningfulOpenCount: 2,
    lastMeaningfulWatchAtMs: 81_000,
  });
  assert.equal(await service.getAggregate('p1', 'b'), null);
});

void test('M7 PLAY watch ignores short zap and stale completion while crediting current meaningful session', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);

  observer.playbackStarted({ sessionId: 1, providerId: 'p1', channelId: 'short' });
  clock.advance(5_000);
  observer.playbackStarted({ sessionId: 2, providerId: 'p1', channelId: 'current' });
  clock.advance(35_000);

  observer.playbackFinalized({ sessionId: 1, reason: 'ended' });
  clock.advance(5_000);
  observer.finalizeCurrent('stop');
  await observer.flush();

  assert.equal(await service.getAggregate('p1', 'short'), null);
  assert.deepEqual(await service.getAggregate('p1', 'current'), {
    providerId: 'p1',
    channelId: 'current',
    meaningfulWatchMs: 40_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 46_000,
  });
});

function provider(id: ProviderId): ProviderRecord {
  return {
    id,
    kind: 'xtream',
    name: id,
    createdAtMs: 1,
    lastSuccessfulSyncAtMs: null,
  };
}

void test('M7 PLAY provider resolver uses target provider record credential and adapter for colliding channel ids', async () => {
  const selected: Array<{ providerId: string; username: string }> = [];
  const records = new Map<ProviderId, ProviderRecord>([
    ['provider-a', provider('provider-a')],
    ['provider-b', provider('provider-b')],
  ]);
  const credentials = new Map<ProviderId, ProviderCredential>([
    ['provider-a', {
      kind: 'xtream',
      serverUrl: 'https://a.invalid',
      username: 'user-a',
      password: 'secret-a',
    }],
    ['provider-b', {
      kind: 'xtream',
      serverUrl: 'https://b.invalid',
      username: 'user-b',
      password: 'secret-b',
    }],
  ]);
  const repository: ProviderRepository = {
    async listProviders() { return [...records.values()]; },
    async getProvider(providerId) { return records.get(providerId) ?? null; },
    async saveProvider() {},
    async removeProvider() {},
    async getActiveProviderId() { return null; },
    async setActiveProviderId() {},
  };
  const credentialStore: CredentialStore = {
    isAvailable: () => true,
    async save() {},
    async load(providerId) { return credentials.get(providerId) ?? null; },
    async remove() {},
  };
  const factory: ProviderAdapterFactory = {
    create(record, credential): ProviderAdapter {
      assert.equal(credential.kind, 'xtream');
      selected.push({ providerId: record.id, username: credential.username });
      return {
        providerId: record.id,
        kind: record.kind,
        async getProfile() {
          return {
            providerId: record.id,
            kind: record.kind,
            accountName: null,
            expiresAtMs: null,
            maxConnections: null,
          };
        },
        async listCategories() { return []; },
        async listChannels() { return []; },
        async resolveStream(channelId) {
          return stream(`${record.id}-${channelId}`);
        },
      };
    },
  };
  const resolver = new ProviderStreamResolver(repository, credentialStore, factory);

  assert.deepEqual(await resolver.resolve('provider-b', 'shared'), stream('provider-b-shared'));
  assert.deepEqual(selected, [{ providerId: 'provider-b', username: 'user-b' }]);
});

class M7NumericTimers implements NumericZapTimers {
  private nextId = 0;
  private callbacks = new Map<number, () => void>();
  private latest: number | null = null;

  setTimeout(callback: () => void, _delayMs: number): unknown {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    this.latest = id;
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.callbacks.delete(Number(handle));
  }

  fire(): void {
    if (this.latest === null) return;
    const callback = this.callbacks.get(this.latest);
    this.callbacks.delete(this.latest);
    this.latest = null;
    callback?.();
  }
}

class M7Intent implements ChannelIntentPort {
  readonly requests: Array<{
    providerId: string;
    channelId: string;
    previousChannelId: string | null;
  }> = [];

  async requestChannel(input: {
    providerId: string;
    channelId: string;
    previousChannelId: string | null;
  }): Promise<'playing'> {
    this.requests.push(input);
    return 'playing';
  }
}

function channel(id: string, number: number): Channel {
  return {
    providerId: 'p1',
    id,
    name: id,
    categoryId: null,
    logoUrl: null,
    number,
  };
}

void test('M7 PLAY highlight is inert while explicit Play numeric zap and both CH directions create logical intents', async () => {
  const intent = new M7Intent();
  const timers = new M7NumericTimers();
  const controller = new LiveTvController({
    intent,
    platform: {
      capabilities: () => ({
        tizen: true,
        optionsKey: true,
        channelKeys: true,
        numericKeys: true,
      }),
      registerOptionalKeys() {},
      exitApp() {},
    },
    view: { render() {} },
    numericTimers: timers,
  });
  controller.enter({
    provider: provider('p1'),
    categories: [],
    channels: [channel('c1', 1), channel('c2', 2), channel('c3', 3)],
  });

  controller.openChannel('c2');
  assert.equal(intent.requests.length, 0, 'highlight alone must not start playback');

  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.equal(intent.requests.at(-1)?.channelId, 'c2');
  controller.handleIntentEvent({
    type: 'PLAYING',
    intent: { id: 1, channelId: 'c2', previousChannelId: null },
    engine: 'shaka',
  });

  await controller.handleInput({ type: 'ACTION', action: 'CHANNEL_DOWN' });
  assert.equal(intent.requests.at(-1)?.channelId, 'c3', 'CH- must move to next logical channel');
  controller.handleIntentEvent({
    type: 'PLAYING',
    intent: { id: 2, channelId: 'c3', previousChannelId: 'c2' },
    engine: 'shaka',
  });

  await controller.handleInput({ type: 'ACTION', action: 'CHANNEL_UP' });
  assert.equal(intent.requests.at(-1)?.channelId, 'c2', 'CH+ must move to previous logical channel');
  controller.handleIntentEvent({
    type: 'PLAYING',
    intent: { id: 3, channelId: 'c2', previousChannelId: 'c3' },
    engine: 'shaka',
  });

  await controller.handleInput({ type: 'DIGIT', digit: 1 });
  timers.fire();
  assert.equal(intent.requests.at(-1)?.channelId, 'c1', 'numeric zap must emit logical channel intent');
});
