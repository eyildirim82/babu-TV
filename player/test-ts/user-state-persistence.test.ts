import test from 'node:test';
import assert from 'node:assert/strict';
import type { FavoriteRepository } from '../src/favorites/contracts.js';
import type { WatchStateRepository } from '../src/watch/contracts.js';
import { StructuredFavoriteRepository } from '../src/repository/structured-favorite-repository.js';
import { StructuredWatchStateRepository } from '../src/repository/structured-watch-state-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';
import {
  MemoryFavoriteRepository,
  MemoryWatchStateRepository,
} from './support/v1-rc-memory-repositories.js';

async function exerciseFavorites(repository: FavoriteRepository) {
  await repository.put({ providerId: 'p1', channelId: 'c2', addedAtMs: 20 });
  await repository.put({ providerId: 'p1', channelId: 'c1', addedAtMs: 10 });
  await repository.put({ providerId: 'p2', channelId: 'c1', addedAtMs: 5 });
  await repository.put({ providerId: 'p1', channelId: 'c1', addedAtMs: 10 });

  const beforeDelete = {
    p1: await repository.list('p1'),
    p2: await repository.list('p2'),
    hasP1C1: await repository.has('p1', 'c1'),
    hasP1Missing: await repository.has('p1', 'missing'),
  };

  await repository.delete('p1', 'c2');
  const afterChannelDelete = await repository.list('p1');
  await repository.deleteProvider('p1');

  return {
    beforeDelete,
    afterChannelDelete,
    p1AfterProviderDelete: await repository.list('p1'),
    p2AfterProviderDelete: await repository.list('p2'),
  };
}

async function exerciseWatch(repository: WatchStateRepository) {
  await repository.setLastWatched({ providerId: 'p1', channelId: 'c2', lastPlayedAtMs: 100 });
  await repository.setLastWatched({ providerId: 'p2', channelId: 'c1', lastPlayedAtMs: 200 });
  await repository.putAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 30_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 130,
  });
  await repository.putAggregate({
    providerId: 'p1',
    channelId: 'c2',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 2,
    lastMeaningfulWatchAtMs: 160,
  });
  await repository.putAggregate({
    providerId: 'p2',
    channelId: 'c1',
    meaningfulWatchMs: 90_000,
    meaningfulOpenCount: 3,
    lastMeaningfulWatchAtMs: 260,
  });

  const beforeDelete = {
    p1Last: await repository.getLastWatched('p1'),
    p2Last: await repository.getLastWatched('p2'),
    p1Aggregates: await repository.listAggregates('p1'),
    p2Aggregate: await repository.getAggregate('p2', 'c1'),
  };

  await repository.deleteChannel('p1', 'c1');
  const afterNonLastDelete = {
    last: await repository.getLastWatched('p1'),
    aggregate: await repository.getAggregate('p1', 'c1'),
  };

  await repository.deleteChannel('p1', 'c2');
  const afterLastDelete = await repository.getLastWatched('p1');
  await repository.deleteProvider('p2');

  return {
    beforeDelete,
    afterNonLastDelete,
    afterLastDelete,
    p2LastAfterProviderDelete: await repository.getLastWatched('p2'),
    p2AggregatesAfterProviderDelete: await repository.listAggregates('p2'),
  };
}

test('USER-P structured Favorites match the frozen memory repository semantics', async () => {
  const memoryResult = await exerciseFavorites(new MemoryFavoriteRepository());
  const structuredResult = await exerciseFavorites(
    new StructuredFavoriteRepository(new MemoryStructuredStore()),
  );
  assert.deepEqual(structuredResult, memoryResult);
});

test('USER-P structured Watch State matches the frozen memory repository semantics', async () => {
  const memoryResult = await exerciseWatch(new MemoryWatchStateRepository());
  const structuredResult = await exerciseWatch(
    new StructuredWatchStateRepository(new MemoryStructuredStore()),
  );
  assert.deepEqual(structuredResult, memoryResult);
});

test('USER-P repositories survive repository recreation on the same structured store', async () => {
  const store = new MemoryStructuredStore();
  const favorites = new StructuredFavoriteRepository(store);
  const watch = new StructuredWatchStateRepository(store);

  await favorites.put({ providerId: 'p1', channelId: 'c1', addedAtMs: 10 });
  await watch.setLastWatched({ providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 20 });
  await watch.putAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 30_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 30,
  });

  const favoritesAfterRelaunch = new StructuredFavoriteRepository(store);
  const watchAfterRelaunch = new StructuredWatchStateRepository(store);

  assert.equal(await favoritesAfterRelaunch.has('p1', 'c1'), true);
  assert.deepEqual(await watchAfterRelaunch.getLastWatched('p1'), {
    providerId: 'p1',
    channelId: 'c1',
    lastPlayedAtMs: 20,
  });
  assert.deepEqual(await watchAfterRelaunch.getAggregate('p1', 'c1'), {
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 30_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 30,
  });
});

test('USER-P provider cleanup preserves unrelated provider and application state', async () => {
  const store = new MemoryStructuredStore();
  await store.put('app_state', { key: 'activeProviderId', value: 'p2' });
  await store.put('app_state', { key: 'legacy-setting', value: { keep: true } });

  const favorites = new StructuredFavoriteRepository(store);
  const watch = new StructuredWatchStateRepository(store);
  await favorites.put({ providerId: 'p1', channelId: 'c1', addedAtMs: 10 });
  await favorites.put({ providerId: 'p2', channelId: 'c1', addedAtMs: 20 });
  await watch.setLastWatched({ providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 30 });
  await watch.setLastWatched({ providerId: 'p2', channelId: 'c1', lastPlayedAtMs: 40 });
  await watch.putAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 30_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 50,
  });
  await watch.putAggregate({
    providerId: 'p2',
    channelId: 'c1',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 2,
    lastMeaningfulWatchAtMs: 60,
  });

  await favorites.deleteProvider('p1');
  await watch.deleteProvider('p1');

  assert.deepEqual(await store.get('app_state', 'activeProviderId'), {
    key: 'activeProviderId',
    value: 'p2',
  });
  assert.deepEqual(await store.get('app_state', 'legacy-setting'), {
    key: 'legacy-setting',
    value: { keep: true },
  });
  assert.deepEqual(await favorites.list('p2'), [
    { providerId: 'p2', channelId: 'c1', addedAtMs: 20 },
  ]);
  assert.deepEqual(await watch.getLastWatched('p2'), {
    providerId: 'p2',
    channelId: 'c1',
    lastPlayedAtMs: 40,
  });
  assert.deepEqual(await watch.listAggregates('p2'), [
    {
      providerId: 'p2',
      channelId: 'c1',
      meaningfulWatchMs: 60_000,
      meaningfulOpenCount: 2,
      lastMeaningfulWatchAtMs: 60,
    },
  ]);
});
