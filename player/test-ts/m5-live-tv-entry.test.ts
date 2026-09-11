import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelIntentCoordinator } from '../src/live-tv/channel-intent-coordinator.js';
import type {
  PlayerSessionPort,
  SessionSwitchRequest,
  SessionSwitchResult,
} from '../src/live-tv/contracts.js';
import { LiveTvController } from '../src/live-tv/live-tv-controller.js';
import { createLiveTvProviderEntry } from '../src/live-tv/create-live-tv-runtime.js';
import { ProviderError } from '../src/providers/errors.js';
import { StructuredWatchStateRepository } from '../src/repository/structured-watch-state-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';
import {
  PlaybackWatchObserver,
  WatchObservingPlayerSession,
  type WatchClock,
} from '../src/watch/playback-session-observer.js';
import { WatchStateService } from '../src/watch/service.js';

const snapshot = {
  provider: {
    id: 'p1',
    kind: 'xtream' as const,
    name: 'One',
    createdAtMs: 1,
    lastSuccessfulSyncAtMs: null,
  },
  categories: [],
  channels: [
    { providerId: 'p1', id: 'c1', name: 'One', categoryId: null, logoUrl: null, number: 1 },
    { providerId: 'p1', id: 'c2', name: 'Two', categoryId: null, logoUrl: null, number: 2 },
  ],
};

const p2Snapshot = {
  provider: {
    id: 'p2',
    kind: 'xtream' as const,
    name: 'Two',
    createdAtMs: 2,
    lastSuccessfulSyncAtMs: null,
  },
  categories: [],
  channels: [
    { providerId: 'p2', id: 'b1', name: 'B One', categoryId: null, logoUrl: null, number: 1 },
  ],
};

class M5Clock implements WatchClock {
  constructor(public value: number) {}

  now(): number {
    return this.value;
  }

  advance(deltaMs: number): void {
    this.value += deltaMs;
  }
}

class M5PlannedSession implements PlayerSessionPort {
  constructor(
    private readonly plan: (request: SessionSwitchRequest) => Promise<SessionSwitchResult>,
  ) {}

  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult> {
    return this.plan(request);
  }

  stop(): void {}
}

function makeController(playRequests: { count: number }): LiveTvController {
  return new LiveTvController({
    intent: {
      async requestChannel() {
        playRequests.count += 1;
        return 'playing';
      },
    },
    platform: {
      capabilities: () => ({
        tizen: false,
        optionsKey: false,
        channelKeys: false,
        numericKeys: false,
      }),
      registerOptionalKeys() {},
      exitApp() {},
    },
    view: { render() {} },
  });
}

function makeWatchRequest(input: {
  intentId: number;
  providerId: string;
  channelId: string;
  previousChannelId?: string | null;
}): SessionSwitchRequest {
  const previousChannelId = input.previousChannelId ?? null;
  return {
    intentId: input.intentId,
    providerId: input.providerId,
    targetChannelId: input.channelId,
    previousChannelId,
    initialRequest: { url: `https://stream.invalid/${input.providerId}/${input.channelId}` },
    reResolveTarget: async () => ({
      url: `https://stream.invalid/${input.providerId}/${input.channelId}`,
    }),
    resolvePrevious: previousChannelId === null
      ? null
      : async () => ({
          url: `https://stream.invalid/${input.providerId}/${previousChannelId}`,
        }),
    isCurrent: () => true,
    onRecovering: () => {},
  };
}

test('M5 Live TV application entry separates focus from explicit playback', async () => {
  const requests: Array<{ providerId: string; channelId: string; previousChannelId: string | null }> = [];
  const controller = new LiveTvController({
    intent: {
      async requestChannel(request) {
        requests.push(request);
        return 'playing';
      },
    },
    platform: {
      capabilities: () => ({
        tizen: false,
        optionsKey: false,
        channelKeys: false,
        numericKeys: false,
      }),
      registerOptionalKeys() {},
      exitApp() {},
    },
    view: { render() {} },
  });

  controller.enter(snapshot);

  controller.openScope({ kind: 'favorites' });
  assert.equal(controller.state().activeScope.kind, 'favorites');
  assert.equal(requests.length, 0);

  controller.openChannel('c2');
  assert.equal(controller.state().activeScope.kind, 'all');
  assert.equal(controller.state().highlightedChannelId, 'c2');
  assert.equal(requests.length, 0);

  await controller.playChannel('c2');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    providerId: 'p1',
    channelId: 'c2',
    previousChannelId: null,
  });

  controller.openChannel('missing');
  await controller.playChannel('missing');
  assert.equal(requests.length, 1);
});

test('M5 reusable provider entry swaps only provider presentation context', async () => {
  const playRequests = { count: 0 };
  const controller = makeController(playRequests);
  controller.enter(snapshot);

  const enteredProviderIds: string[] = [];
  const syncedProviderIds: string[] = [];
  const originalEnter = controller.enter.bind(controller);
  const originalSyncCatalog = controller.syncCatalog.bind(controller);
  controller.enter = (nextSnapshot) => {
    enteredProviderIds.push(nextSnapshot.provider.id);
    originalEnter(nextSnapshot);
  };
  let resolveSync!: () => void;
  const syncDone = new Promise<void>((resolve) => { resolveSync = resolve; });
  controller.syncCatalog = (nextSnapshot) => {
    syncedProviderIds.push(nextSnapshot.provider.id);
    originalSyncCatalog(nextSnapshot);
    resolveSync();
  };

  let resolveRefresh!: () => void;
  const refresh = new Promise<never>((resolve) => {
    resolveRefresh = () => resolve({} as never);
  });
  const enterProvider = createLiveTvProviderEntry({
    providers: {
      async getProvider(providerId) {
        return providerId === 'p2' ? p2Snapshot.provider : null;
      },
    },
    credentials: {
      isAvailable: () => true,
      async load(providerId) {
        return providerId === 'p2'
          ? { kind: 'xtream', serverUrl: 'https://provider.invalid', username: 'u', password: 'p' }
          : null;
      },
    },
    core: {
      async loadCacheFirst(providerId) {
        assert.equal(providerId, 'p2');
        return { cached: p2Snapshot, refresh };
      },
      async loadCached(providerId) {
        assert.equal(providerId, 'p2');
        return p2Snapshot;
      },
    },
    controller,
  });

  await enterProvider('p2');
  assert.deepEqual(enteredProviderIds, ['p2']);
  assert.deepEqual(syncedProviderIds, []);
  assert.equal(playRequests.count, 0);

  resolveRefresh();
  await syncDone;
  assert.deepEqual(syncedProviderIds, ['p2']);
  assert.equal(playRequests.count, 0);
});

test('M5 reusable provider entry fails closed without entering or playing', async () => {
  for (const failure of ['provider', 'credential', 'cache'] as const) {
    const playRequests = { count: 0 };
    const controller = makeController(playRequests);
    controller.enter(snapshot);
    const enteredProviderIds: string[] = [];
    const originalEnter = controller.enter.bind(controller);
    controller.enter = (nextSnapshot) => {
      enteredProviderIds.push(nextSnapshot.provider.id);
      originalEnter(nextSnapshot);
    };

    const enterProvider = createLiveTvProviderEntry({
      providers: {
        async getProvider(providerId) {
          if (failure === 'provider') return null;
          return providerId === 'p2' ? p2Snapshot.provider : null;
        },
      },
      credentials: {
        isAvailable: () => true,
        async load() {
          if (failure === 'credential') return null;
          return { kind: 'xtream', serverUrl: 'https://provider.invalid', username: 'u', password: 'p' };
        },
      },
      core: {
        async loadCacheFirst() {
          if (failure === 'cache') throw new Error('synthetic cache failure');
          return { cached: p2Snapshot, refresh: Promise.resolve({} as never) };
        },
        async loadCached() {
          return p2Snapshot;
        },
      },
      controller,
    });

    await assert.rejects(() => enterProvider('p2'));
    assert.deepEqual(enteredProviderIds, []);
    assert.equal(playRequests.count, 0);
  }
});

test('M5 one observing playback session attributes same channel id to each provider exactly once', async () => {
  const clock = new M5Clock(1_000);
  const repository = new StructuredWatchStateRepository(new MemoryStructuredStore());
  const service = new WatchStateService(repository, { minimumSessionMs: 30_000 });
  const observer = new PlaybackWatchObserver(service, clock);
  const inner = new M5PlannedSession(async (request) => {
    request.onHandoffStarted?.();
    request.onHandoffStarted?.();
    return { status: 'playing', engine: 'shaka' };
  });
  const shared = new WatchObservingPlayerSession(inner, observer);

  await shared.switchTo(makeWatchRequest({
    intentId: 1,
    providerId: 'p1',
    channelId: 'shared',
  }));
  clock.advance(40_000);
  await shared.switchTo(makeWatchRequest({
    intentId: 2,
    providerId: 'p2',
    channelId: 'shared',
    previousChannelId: 'shared',
  }));
  clock.advance(35_000);
  await shared.stop();
  await observer.flush();

  assert.deepEqual(await service.getAggregate('p1', 'shared'), {
    providerId: 'p1',
    channelId: 'shared',
    meaningfulWatchMs: 40_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 41_000,
  });
  assert.deepEqual(await service.getAggregate('p2', 'shared'), {
    providerId: 'p2',
    channelId: 'shared',
    meaningfulWatchMs: 35_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 76_000,
  });
});

test('M5 cross-provider stream resolution failure preserves active watch session before handoff', async () => {
  const clock = new M5Clock(1_000);
  const repository = new StructuredWatchStateRepository(new MemoryStructuredStore());
  const service = new WatchStateService(repository, { minimumSessionMs: 30_000 });
  const observer = new PlaybackWatchObserver(service, clock);
  let sessionSwitchCalls = 0;
  const inner = new M5PlannedSession(async (request) => {
    sessionSwitchCalls += 1;
    request.onHandoffStarted?.();
    return { status: 'playing', engine: 'shaka' };
  });
  const shared = new WatchObservingPlayerSession(inner, observer);

  await shared.switchTo(makeWatchRequest({
    intentId: 1,
    providerId: 'p1',
    channelId: 'shared',
  }));
  sessionSwitchCalls = 0;
  clock.advance(20_000);

  const coordinator = new ChannelIntentCoordinator({
    async resolve(providerId, channelId) {
      if (providerId === 'p2' && channelId === 'missing') {
        throw new ProviderError('NOT_FOUND', 404, 'Stream not found.');
      }
      return { url: `https://stream.invalid/${providerId}/${channelId}` };
    },
  }, shared);

  assert.equal(await coordinator.requestChannel({
    providerId: 'p2',
    channelId: 'missing',
    previousChannelId: null,
  }), 'failed');
  assert.equal(sessionSwitchCalls, 0);

  clock.advance(30_000);
  await shared.stop();
  await observer.flush();

  assert.deepEqual(await service.getAggregate('p1', 'shared'), {
    providerId: 'p1',
    channelId: 'shared',
    meaningfulWatchMs: 50_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 51_000,
  });
  assert.equal(await service.getAggregate('p2', 'missing'), null);
});
