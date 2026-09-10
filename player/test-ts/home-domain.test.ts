import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, ProviderRecord } from '../src/domain/models.js';
import {
  createHomeViewModel,
  type HomeProjectionInput,
} from '../src/home/home-domain.js';

const scorePolicy = {
  durationWeightPerMinute: 1,
  openWeight: 5,
  recencyHalfLifeMs: 1_000,
};

function provider(id: string, createdAtMs: number): ProviderRecord {
  return {
    id,
    kind: 'xtream',
    name: `Provider ${id}`,
    createdAtMs,
    lastSuccessfulSyncAtMs: null,
  };
}

function channel(providerId: string, id: string, name = id): Channel {
  return {
    providerId,
    id,
    name,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

function input(overrides: Partial<HomeProjectionInput> = {}): HomeProjectionInput {
  return {
    providers: [provider('p1', 10), provider('p2', 20)],
    activeProviderId: 'p1',
    channels: [channel('p1', 'c1', 'One'), channel('p1', 'c2', 'Two')],
    lastWatched: null,
    favorites: [],
    watchAggregates: [],
    nowMs: 10_000,
    watchScorePolicy: scorePolicy,
    currentPrograms: new Map(),
    ...overrides,
  };
}

test('HOME-D projects providers deterministically and exposes switch intents without switching', () => {
  const model = createHomeViewModel(input({
    providers: [provider('p2', 20), provider('p3', 10), provider('p1', 10)],
    activeProviderId: 'p3',
  }));

  assert.deepEqual(model.providerSelector.options.map((item) => ({
    providerId: item.providerId,
    isActive: item.isActive,
    intent: item.intent,
  })), [
    { providerId: 'p1', isActive: false, intent: { type: 'SELECT_PROVIDER', providerId: 'p1' } },
    { providerId: 'p3', isActive: true, intent: { type: 'SELECT_PROVIDER', providerId: 'p3' } },
    { providerId: 'p2', isActive: false, intent: { type: 'SELECT_PROVIDER', providerId: 'p2' } },
  ]);
  assert.equal(model.providerSelector.activeProviderId, 'p3');
});

test('HOME-D selects a valid provider-scoped Last Watched card and focuses it by stable channel ID', () => {
  const model = createHomeViewModel(input({
    channels: [channel('p2', 'foreign'), channel('p1', 'c1', 'One'), channel('p1', 'c2', 'Two')],
    lastWatched: { providerId: 'p1', channelId: 'c2', lastPlayedAtMs: 9_000 },
  }));

  assert.deepEqual(model.lastWatched, {
    providerId: 'p1',
    channelId: 'c2',
    name: 'Two',
    logoUrl: null,
    number: null,
    lastPlayedAtMs: 9_000,
    currentProgram: null,
    intent: { type: 'PLAY_CHANNEL', providerId: 'p1', channelId: 'c2' },
  });
  assert.deepEqual(model.defaultFocus, { kind: 'last-watched', channelId: 'c2' });
});

test('HOME-D degrades stale or cross-provider Last Watched state to Live TV focus', () => {
  for (const lastWatched of [
    { providerId: 'p1', channelId: 'missing', lastPlayedAtMs: 9_000 },
    { providerId: 'p2', channelId: 'c1', lastPlayedAtMs: 9_000 },
  ]) {
    const model = createHomeViewModel(input({ lastWatched }));
    assert.equal(model.lastWatched, null);
    assert.deepEqual(model.defaultFocus, { kind: 'live-tv' });
  }
});

test('HOME-D projects Favorites for the active provider only, drops missing channels, and orders deterministically', () => {
  const model = createHomeViewModel(input({
    favorites: [
      { providerId: 'p1', channelId: 'missing', addedAtMs: 999 },
      { providerId: 'p2', channelId: 'c1', addedAtMs: 500 },
      { providerId: 'p1', channelId: 'c2', addedAtMs: 100 },
      { providerId: 'p1', channelId: 'c1', addedAtMs: 100 },
    ],
  }));

  assert.deepEqual(model.favorites.items.map((item) => item.channelId), ['c1', 'c2']);
  assert.deepEqual(model.favorites.viewAllIntent, {
    type: 'OPEN_LIVE_TV',
    providerId: 'p1',
    scope: 'favorites',
  });
});

test('HOME-D preserves WATCH-S ranking semantics while excluding foreign, stale, and zero-score records', () => {
  const model = createHomeViewModel(input({
    channels: [channel('p1', 'older'), channel('p1', 'recent'), channel('p1', 'zero')],
    watchAggregates: [
      { providerId: 'p2', channelId: 'foreign', meaningfulWatchMs: 99_000_000, meaningfulOpenCount: 99, lastMeaningfulWatchAtMs: 10_000 },
      { providerId: 'p1', channelId: 'missing', meaningfulWatchMs: 99_000_000, meaningfulOpenCount: 99, lastMeaningfulWatchAtMs: 10_000 },
      { providerId: 'p1', channelId: 'older', meaningfulWatchMs: 120_000, meaningfulOpenCount: 0, lastMeaningfulWatchAtMs: 9_000 },
      { providerId: 'p1', channelId: 'recent', meaningfulWatchMs: 60_000, meaningfulOpenCount: 0, lastMeaningfulWatchAtMs: 10_000 },
      { providerId: 'p1', channelId: 'zero', meaningfulWatchMs: 0, meaningfulOpenCount: 0, lastMeaningfulWatchAtMs: null },
    ],
  }));

  assert.deepEqual(model.frequentlyWatched.items.map((item) => item.channelId), ['recent', 'older']);
  assert.equal('score' in model.frequentlyWatched.items[0]!, false);
});

test('HOME-D attaches optional current EPG only when it matches the projected channel', () => {
  const matching = { channelId: 'c1', startMs: 1, endMs: 2, title: 'Now', description: null };
  const mismatched = { channelId: 'other', startMs: 1, endMs: 2, title: 'Wrong', description: null };

  const withMatching = createHomeViewModel(input({
    favorites: [{ providerId: 'p1', channelId: 'c1', addedAtMs: 1 }],
    currentPrograms: new Map([['c1', matching]]),
  }));
  assert.deepEqual(withMatching.favorites.items[0]?.currentProgram, matching);

  const withMismatch = createHomeViewModel(input({
    favorites: [{ providerId: 'p1', channelId: 'c1', addedAtMs: 1 }],
    currentPrograms: new Map([['c1', mismatched]]),
  }));
  assert.equal(withMismatch.favorites.items[0]?.currentProgram, null);
});

test('HOME-D emits side-effect-free navigation intents for Live TV, channel context, Favorites, and Settings', () => {
  const model = createHomeViewModel(input({
    favorites: [{ providerId: 'p1', channelId: 'c1', addedAtMs: 1 }],
    watchAggregates: [
      { providerId: 'p1', channelId: 'c2', meaningfulWatchMs: 60_000, meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: 10_000 },
    ],
  }));

  assert.deepEqual(model.liveTv, {
    available: true,
    intent: { type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'all' },
  });
  assert.deepEqual(model.favorites.items[0]?.intent, {
    type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'p1', channelId: 'c1',
  });
  assert.deepEqual(model.frequentlyWatched.items[0]?.intent, {
    type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'p1', channelId: 'c2',
  });
  assert.deepEqual(model.settings.intent, { type: 'OPEN_SETTINGS' });
});

test('HOME-D safely degrades an absent or stale active provider without leaking provider-scoped rows', () => {
  for (const activeProviderId of [null, 'missing']) {
    const model = createHomeViewModel(input({
      activeProviderId,
      favorites: [{ providerId: 'p1', channelId: 'c1', addedAtMs: 1 }],
      watchAggregates: [
        { providerId: 'p1', channelId: 'c1', meaningfulWatchMs: 60_000, meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: 10_000 },
      ],
      lastWatched: { providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 9_000 },
    }));

    assert.equal(model.providerSelector.activeProviderId, null);
    assert.equal(model.lastWatched, null);
    assert.deepEqual(model.favorites.items, []);
    assert.deepEqual(model.frequentlyWatched.items, []);
    assert.deepEqual(model.liveTv, { available: false, intent: null });
    assert.deepEqual(model.defaultFocus, { kind: 'provider-selector' });
  }
});
