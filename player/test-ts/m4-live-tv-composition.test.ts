import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Channel, EpgProgram } from '../src/domain/models.js';
import type { Platform, PlatformCapabilities } from '../src/platform/contracts.js';
import type { ProviderSnapshot } from '../src/providers/provider-core-service.js';
import {
  LiveTvController,
  type ChannelIntentPort,
  type LiveTvView,
  type LiveTvViewModel,
} from '../src/live-tv/live-tv-controller.js';
import {
  createLiveTvFeatureComposition,
  type LiveTvFeaturePorts,
} from '../src/live-tv/live-tv-feature-composition.js';

function channel(id: string, providerId = 'provider-1', name = `Channel ${id}`): Channel {
  return {
    providerId,
    id,
    name,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

function program(channelId: string, title = `Program ${channelId}`): EpgProgram {
  return {
    channelId,
    startMs: 1_000,
    endMs: 2_000,
    title,
    description: `${title} detail`,
  };
}

const categories: readonly Category[] = [];

function refreshInput(channels: readonly Channel[] = [channel('a')]) {
  return {
    providerId: 'provider-1',
    channels,
    visibleChannels: channels,
    categories,
    highlightedChannelId: channels[0]?.id ?? null,
  };
}

function snapshot(channels: readonly Channel[] = [channel('a'), channel('b')]): ProviderSnapshot {
  return {
    provider: {
      id: 'provider-1',
      kind: 'xtream',
      name: 'Provider 1',
      createdAtMs: 1,
      lastSuccessfulSyncAtMs: null,
    },
    categories: [],
    channels,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class FakePlatform implements Platform {
  exits = 0;

  capabilities(): PlatformCapabilities {
    return { tizen: false, optionsKey: true, channelKeys: true, numericKeys: false };
  }

  registerOptionalKeys(): void {}

  exitApp(): void {
    this.exits += 1;
  }
}

class RecordingIntent implements ChannelIntentPort {
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

class RecordingView implements LiveTvView {
  readonly models: LiveTvViewModel[] = [];

  render(_state: ReturnType<LiveTvController['state']>, model: LiveTvViewModel): void {
    this.models.push(model);
  }
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function featurePorts(input: { favorite?: boolean; epg?: boolean } = {}): LiveTvFeaturePorts {
  let favorite = input.favorite ?? false;
  return {
    epg: {
      async getCurrent(_providerId, channelId) {
        return input.epg === false ? null : program(channelId);
      },
      async getNext(_providerId, channelId) {
        return input.epg === false ? null : program(channelId, `Next ${channelId}`);
      },
    },
    favorites: {
      async isFavorite() { return favorite; },
      async toggle() {
        favorite = !favorite;
        return favorite;
      },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 1_500,
  };
}

function controllerWithFeatures(
  ports: LiveTvFeaturePorts = featurePorts(),
  channels: readonly Channel[] = [channel('a'), channel('b')],
) {
  const intent = new RecordingIntent();
  const platform = new FakePlatform();
  const view = new RecordingView();
  const features = createLiveTvFeatureComposition(ports);
  const controller = new LiveTvController({
    intent,
    platform,
    view,
    features,
  });
  controller.enter(snapshot(channels));
  return { controller, intent, platform, view, features };
}

void test('M4-COMP exposes injected feature composition without playback ownership', async () => {
  const calls: string[] = [];
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent(providerId, channelId) {
        calls.push(`epg-current:${providerId}:${channelId}`);
        return null;
      },
      async getNext(providerId, channelId) {
        calls.push(`epg-next:${providerId}:${channelId}`);
        return null;
      },
    },
    favorites: {
      async isFavorite(providerId, channelId) {
        calls.push(`favorite-read:${providerId}:${channelId}`);
        return false;
      },
      async toggle(providerId, channelId) {
        calls.push(`favorite-toggle:${providerId}:${channelId}`);
        return true;
      },
      async reconcile(providerId) {
        calls.push(`favorite-reconcile:${providerId}`);
        return { available: [], missing: [] };
      },
    },
    nowMs: () => 1_000,
  };

  const composition = createLiveTvFeatureComposition(ports);
  const state = await composition.refresh(refreshInput());

  assert.equal(state.layer, 'none');
  assert.equal(state.selectedFavorite, false);
  assert.equal(state.epg.selected?.channelId, 'a');
  assert.deepEqual(state.favorites.channels, []);
  assert.deepEqual(calls, [
    'epg-current:provider-1:a',
    'epg-next:provider-1:a',
    'favorite-reconcile:provider-1',
    'favorite-read:provider-1:a',
  ]);
});

void test('M4-COMP degrades EPG and Favorites failures without leaking raw errors', async () => {
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent() {
        throw new Error('credential-bearing epg failure');
      },
      async getNext() {
        throw new Error('next failure');
      },
    },
    favorites: {
      async isFavorite() {
        throw new Error('favorite read failure');
      },
      async toggle() {
        throw new Error('favorite toggle failure');
      },
      async reconcile() {
        throw new Error('favorite reconciliation failure');
      },
    },
    nowMs: () => 1_000,
  };

  const composition = createLiveTvFeatureComposition(ports);
  const state = await composition.refresh(refreshInput());

  assert.equal(state.epg.channelContext[0]?.current.status, 'unavailable');
  assert.equal(state.epg.selected?.current.status, 'unavailable');
  assert.equal(state.epg.selected?.next.status, 'unavailable');
  assert.equal(state.selectedFavorite, false);
  assert.equal(state.favorites.status, 'empty');
  assert.equal(JSON.stringify(state).includes('credential-bearing'), false);
  assert.equal(JSON.stringify(state).includes('failure'), false);
});

void test('M4-COMP rejects stale async feature refresh completion', async () => {
  const currentA = deferred<EpgProgram | null>();
  const currentB = deferred<EpgProgram | null>();
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent(_providerId, channelId) {
        return channelId === 'a' ? currentA.promise : currentB.promise;
      },
      async getNext() { return null; },
    },
    favorites: {
      async isFavorite() { return false; },
      async toggle() { return false; },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 1_500,
  };
  const composition = createLiveTvFeatureComposition(ports);
  const first = composition.refresh(refreshInput([channel('a')]));
  const second = composition.refresh(refreshInput([channel('b')]));

  currentB.resolve(program('b'));
  await second;
  currentA.resolve(program('a'));
  await first;

  assert.equal(composition.current().epg.selected?.channelId, 'b');
});

void test('M4-COMP Search preserves provider-scoped stable keys and activation is highlight-only data', async () => {
  const ports: LiveTvFeaturePorts = featurePorts({ epg: false });
  const composition = createLiveTvFeatureComposition(ports);
  const channels = [
    channel('same', 'provider-1', 'Haber Bir'),
    channel('same', 'provider-2', 'Haber İki'),
    channel('other', 'provider-1', 'Spor'),
  ];
  const input = refreshInput(channels);
  await composition.refresh(input);

  let state = composition.openSearch(input, 'haber');
  assert.equal(state.layer, 'search');
  assert.deepEqual(state.search.items.map((item) => item.key), ['provider-1:same']);

  const down = composition.handleSearchKeyboard({ key: 'ArrowDown', keyCode: 40 });
  assert.equal(down.handled, true);
  assert.equal(down.activation, null);
  assert.equal(down.state.search.focusedResultKey, 'provider-1:same');

  const activate = composition.handleSearchKeyboard({ key: 'Enter', keyCode: 13 });
  assert.deepEqual(activate.activation, { providerId: 'provider-1', channelId: 'same' });
  assert.equal(activate.state.layer, 'none');
});

void test('M4-COMP Channel Actions map WATCH only to PLAY and keep Program Info as a dismissible nested layer', async () => {
  let favorite = false;
  const calls: string[] = [];
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent(_providerId, channelId) { return program(channelId); },
      async getNext(_providerId, channelId) { return program(channelId, 'Next'); },
    },
    favorites: {
      async isFavorite() { return favorite; },
      async toggle(providerId, channelId) {
        calls.push(`toggle:${providerId}:${channelId}`);
        favorite = !favorite;
        return favorite;
      },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 1_500,
  };
  const composition = createLiveTvFeatureComposition(ports);
  const input = refreshInput();
  await composition.refresh(input);

  let state = composition.openActions(input);
  assert.equal(state.layer, 'actions');
  assert.deepEqual(state.actions?.items.map((item) => [item.id, item.label]), [
    ['WATCH', 'İzle'],
    ['FAVORITE', 'Favoriye Ekle'],
    ['PROGRAM_INFO', 'Program Bilgisi'],
  ]);
  assert.deepEqual(composition.activateFocusedAction(), {
    type: 'PLAY_CHANNEL',
    providerId: 'provider-1',
    channelId: 'a',
  });

  state = composition.moveAction('NEXT');
  assert.equal(state.actions?.state.focusedActionId, 'FAVORITE');
  const favoriteIntent = composition.activateFocusedAction();
  assert.deepEqual(favoriteIntent, {
    type: 'TOGGLE_FAVORITE',
    providerId: 'provider-1',
    channelId: 'a',
  });
  state = await composition.toggleFavorite(input);
  assert.deepEqual(calls, ['toggle:provider-1:a']);
  assert.equal(state.selectedFavorite, true);
  assert.equal(state.actions?.items.find((item) => item.id === 'FAVORITE')?.label, 'Favorilerden Çıkar');

  state = composition.moveAction('NEXT');
  assert.equal(state.actions?.state.focusedActionId, 'PROGRAM_INFO');
  assert.deepEqual(composition.activateFocusedAction(), {
    type: 'SHOW_PROGRAM_INFO',
    providerId: 'provider-1',
    channelId: 'a',
  });
  state = composition.openProgramInfo();
  assert.equal(state.layer, 'program-info');
  assert.equal(state.programInfo?.title, 'Program a');
  assert.equal(composition.closeTopLayer(), true);
  assert.equal(composition.current().layer, 'actions');
  assert.equal(composition.closeTopLayer(), true);
  assert.equal(composition.current().layer, 'none');
});

void test('M4-COMP failed favorite toggle preserves the prior displayed state', async () => {
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent() { return null; },
      async getNext() { return null; },
    },
    favorites: {
      async isFavorite() { return true; },
      async toggle() { throw new Error('toggle failed'); },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 1_000,
  };
  const composition = createLiveTvFeatureComposition(ports);
  const input = refreshInput();
  await composition.refresh(input);
  composition.openActions(input);

  const state = await composition.toggleFavorite(input);
  assert.equal(state.selectedFavorite, true);
  assert.equal(state.actions?.items.find((item) => item.id === 'FAVORITE')?.label, 'Favorilerden Çıkar');
});

void test('M4-COMP controller refreshes presentation on highlight without requesting playback', async () => {
  const { controller, intent, view } = controllerWithFeatures();
  await nextTurn();
  await nextTurn();

  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  await nextTurn();
  await nextTurn();

  assert.equal(controller.state().highlightedChannelId, 'b');
  assert.equal(controller.state().playbackStatus, 'IDLE');
  assert.equal(controller.state().pendingIntent, null);
  assert.deepEqual(intent.requests, []);
  assert.equal(view.models.at(-1)?.features?.epg.selected?.channelId, 'b');
});

void test('M4-COMP Search result activation restores normal highlight without playback', async () => {
  const { controller, intent } = controllerWithFeatures();
  await nextTurn();
  await nextTurn();

  controller.openSearch('Channel b');
  controller.handleSearchKeyboard({ key: 'ArrowDown', keyCode: 40 });
  controller.handleSearchKeyboard({ key: 'Enter', keyCode: 13 });
  await nextTurn();

  assert.equal(controller.state().highlightedChannelId, 'b');
  assert.equal(controller.state().overlayZone, 'CHANNEL');
  assert.equal(controller.state().playbackStatus, 'IDLE');
  assert.deepEqual(intent.requests, []);
});

void test('M4-COMP controller maps only WATCH to requestPlayback and Back closes one feature layer at a time', async () => {
  const { controller, intent, view } = controllerWithFeatures();
  await nextTurn();
  await nextTurn();

  await controller.handleInput({ type: 'ACTION', action: 'RIGHT' });
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.equal(view.models.at(-1)?.features?.layer, 'actions');
  assert.deepEqual(intent.requests, []);

  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.equal(view.models.at(-1)?.features?.selectedFavorite, true);
  assert.deepEqual(intent.requests, []);

  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.equal(view.models.at(-1)?.features?.layer, 'program-info');
  assert.deepEqual(intent.requests, []);

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(view.models.at(-1)?.features?.layer, 'actions');
  assert.equal(controller.state().overlayOpen, true);

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(view.models.at(-1)?.features?.layer, 'none');
  assert.equal(controller.state().overlayOpen, true);

  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.equal(view.models.at(-1)?.features?.layer, 'actions');
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.deepEqual(intent.requests, [{
    providerId: 'provider-1',
    channelId: 'a',
    previousChannelId: null,
  }]);
});
