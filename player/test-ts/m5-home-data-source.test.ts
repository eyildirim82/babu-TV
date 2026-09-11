import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOME_WATCH_SCORE_POLICY,
  createHomeDataSource,
} from '../src/app/home-data-source.js';

test('M5 Home data source reads only the active provider partition', async () => {
  const calls: string[] = [];
  const source = createHomeDataSource({
    providers: {
      async listProviders() {
        return [
          { id: 'p1', kind: 'xtream' as const, name: 'One', createdAtMs: 1, lastSuccessfulSyncAtMs: null },
          { id: 'p2', kind: 'm3u' as const, name: 'Two', createdAtMs: 2, lastSuccessfulSyncAtMs: null },
        ];
      },
      async getActiveProviderId() { return 'p1'; },
    },
    catalog: {
      async listChannels(providerId: string) {
        calls.push(`channels:${providerId}`);
        return [{ providerId: 'p1', id: 'c1', name: 'News', categoryId: null, logoUrl: null, number: 1 }];
      },
    },
    favorites: {
      async list(providerId: string) {
        calls.push(`favorites:${providerId}`);
        return [{ providerId: 'p1', channelId: 'c1', addedAtMs: 10 }];
      },
    },
    watchState: {
      async getLastWatched(providerId: string) {
        calls.push(`last:${providerId}`);
        return { providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 20 };
      },
      async listAggregates(providerId: string) {
        calls.push(`aggregates:${providerId}`);
        return [{ providerId: 'p1', channelId: 'c1', meaningfulWatchMs: 60_000, meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: 20 }];
      },
    },
    nowMs: () => 30,
    watchScorePolicy: DEFAULT_HOME_WATCH_SCORE_POLICY,
  });

  const model = await source.load();
  assert.equal(model.providerSelector.activeProviderId, 'p1');
  assert.equal(model.lastWatched?.channelId, 'c1');
  assert.deepEqual(calls.sort(), ['aggregates:p1', 'channels:p1', 'favorites:p1', 'last:p1']);
});
