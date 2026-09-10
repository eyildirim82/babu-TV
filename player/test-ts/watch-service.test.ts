import test from 'node:test';
import assert from 'node:assert/strict';
import { WatchStateService } from '../src/watch/service.js';
import { MemoryWatchStateRepository } from './support/v1-rc-memory-repositories.js';

test('WATCH-R records Last Watched by provider and stable channel id', async () => {
  const repo = new MemoryWatchStateRepository();
  const service = new WatchStateService(repo, { minimumSessionMs: 30_000 });

  await service.recordPlaybackStarted('p1', 'c1', 1000);

  assert.deepEqual(await service.getLastWatched('p1'), {
    providerId: 'p1',
    channelId: 'c1',
    lastPlayedAtMs: 1000,
  });
  assert.equal(await service.getLastWatched('p2'), null);
});

test('WATCH-R ignores short zaps and aggregates meaningful sessions', async () => {
  const repo = new MemoryWatchStateRepository();
  const service = new WatchStateService(repo, { minimumSessionMs: 30_000 });

  assert.equal(await service.recordCompletedSession({
    providerId: 'p1',
    channelId: 'c1',
    durationMs: 5_000,
    endedAtMs: 10_000,
  }), null);

  assert.deepEqual(await service.recordCompletedSession({
    providerId: 'p1',
    channelId: 'c1',
    durationMs: 60_000,
    endedAtMs: 70_000,
  }), {
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 70_000,
  });
});

test('WATCH-R accumulates meaningful sessions and keeps provider state isolated', async () => {
  const repo = new MemoryWatchStateRepository();
  const service = new WatchStateService(repo, { minimumSessionMs: 30_000 });

  await service.recordCompletedSession({
    providerId: 'p1',
    channelId: 'shared',
    durationMs: 30_000,
    endedAtMs: 40_000,
  });
  await service.recordCompletedSession({
    providerId: 'p1',
    channelId: 'shared',
    durationMs: 45_000,
    endedAtMs: 100_000,
  });
  const beforeShortZap = await service.getAggregate('p1', 'shared');
  const afterShortZap = await service.recordCompletedSession({
    providerId: 'p1',
    channelId: 'shared',
    durationMs: 1_000,
    endedAtMs: 101_000,
  });
  await service.recordCompletedSession({
    providerId: 'p2',
    channelId: 'shared',
    durationMs: 60_000,
    endedAtMs: 80_000,
  });

  assert.deepEqual(beforeShortZap, {
    providerId: 'p1',
    channelId: 'shared',
    meaningfulWatchMs: 75_000,
    meaningfulOpenCount: 2,
    lastMeaningfulWatchAtMs: 100_000,
  });
  assert.deepEqual(afterShortZap, beforeShortZap);
  assert.deepEqual(await service.getAggregate('p2', 'shared'), {
    providerId: 'p2',
    channelId: 'shared',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 80_000,
  });
  assert.deepEqual(await service.listAggregates('p1'), [beforeShortZap]);
});

test('WATCH-R cleanup delegates preserve unrelated Last Watched state', async () => {
  const repo = new MemoryWatchStateRepository();
  const service = new WatchStateService(repo, { minimumSessionMs: 30_000 });

  await service.recordPlaybackStarted('p1', 'c2', 1_000);
  await service.recordCompletedSession({
    providerId: 'p1',
    channelId: 'c1',
    durationMs: 30_000,
    endedAtMs: 31_000,
  });
  await service.recordCompletedSession({
    providerId: 'p1',
    channelId: 'c2',
    durationMs: 30_000,
    endedAtMs: 32_000,
  });
  await service.recordPlaybackStarted('p2', 'c1', 2_000);
  await service.recordCompletedSession({
    providerId: 'p2',
    channelId: 'c1',
    durationMs: 30_000,
    endedAtMs: 33_000,
  });

  await service.deleteChannel('p1', 'c1');
  assert.equal(await service.getAggregate('p1', 'c1'), null);
  assert.deepEqual(await service.getLastWatched('p1'), {
    providerId: 'p1',
    channelId: 'c2',
    lastPlayedAtMs: 1_000,
  });

  await service.deleteChannel('p1', 'c2');
  assert.equal(await service.getLastWatched('p1'), null);

  await service.deleteProvider('p2');
  assert.equal(await service.getLastWatched('p2'), null);
  assert.equal(await service.getAggregate('p2', 'c1'), null);
});

test('WATCH-R rejects invalid timing inputs', async () => {
  const repo = new MemoryWatchStateRepository();
  assert.throws(
    () => new WatchStateService(repo, { minimumSessionMs: Number.NaN }),
    RangeError,
  );
  assert.throws(
    () => new WatchStateService(repo, { minimumSessionMs: -1 }),
    RangeError,
  );

  const service = new WatchStateService(repo, { minimumSessionMs: 30_000 });
  await assert.rejects(
    service.recordPlaybackStarted('p1', 'c1', Number.POSITIVE_INFINITY),
    RangeError,
  );
  await assert.rejects(
    service.recordCompletedSession({
      providerId: 'p1',
      channelId: 'c1',
      durationMs: -1,
      endedAtMs: 10_000,
    }),
    RangeError,
  );
  await assert.rejects(
    service.recordCompletedSession({
      providerId: 'p1',
      channelId: 'c1',
      durationMs: 30_000,
      endedAtMs: Number.NaN,
    }),
    RangeError,
  );
});
