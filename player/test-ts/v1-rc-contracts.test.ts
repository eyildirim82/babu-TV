import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  EpgProgramRepository,
  EpgQuery,
  EpgSource,
  EpgSourceProgram,
  EpgWindow,
} from '../src/epg/contracts.js';
import type { FavoriteRepository } from '../src/favorites/contracts.js';
import type { WatchStateRepository } from '../src/watch/contracts.js';
import {
  MemoryEpgProgramRepository,
  MemoryFavoriteRepository,
  MemoryWatchStateRepository,
} from './support/v1-rc-memory-repositories.js';

void (null as unknown as EpgProgramRepository);
void (null as unknown as EpgQuery);
void (null as unknown as EpgSource);
void (null as unknown as EpgSourceProgram);
void (null as unknown as EpgWindow);
void (null as unknown as FavoriteRepository);
void (null as unknown as WatchStateRepository);

test('RC-F0 contract suite loads without runtime side effects', () => {
  assert.equal(true, true);
});

test('RC-F0 memory seams isolate providers', async () => {
  const favorites = new MemoryFavoriteRepository();
  await favorites.put({ providerId: 'p1', channelId: 'shared', addedAtMs: 10 });
  await favorites.put({ providerId: 'p2', channelId: 'shared', addedAtMs: 20 });
  assert.deepEqual(await favorites.list('p1'), [
    { providerId: 'p1', channelId: 'shared', addedAtMs: 10 },
  ]);

  const watch = new MemoryWatchStateRepository();
  await watch.setLastWatched({ providerId: 'p1', channelId: 'shared', lastPlayedAtMs: 30 });
  assert.equal(await watch.getLastWatched('p2'), null);

  const epg = new MemoryEpgProgramRepository();
  await epg.replaceWindow(
    'p1',
    { startMs: 0, endMs: 100 },
    [{ channelId: 'shared', startMs: 0, endMs: 50, title: 'Program', description: null }],
  );
  assert.deepEqual(await epg.listPrograms('p2', 'shared', { startMs: 0, endMs: 100 }), []);
});

test('RC-F0 cleanup stays provider scoped and returned records are copies', async () => {
  const favorites = new MemoryFavoriteRepository();
  await favorites.put({ providerId: 'p1', channelId: 'c1', addedAtMs: 1 });
  await favorites.put({ providerId: 'p2', channelId: 'c1', addedAtMs: 2 });
  await favorites.deleteProvider('p1');
  assert.equal(await favorites.has('p1', 'c1'), false);
  assert.equal(await favorites.has('p2', 'c1'), true);

  const first = (await favorites.list('p2'))[0];
  if (!first) throw new Error('favorite fixture missing');
  (first as { addedAtMs: number }).addedAtMs = 999;
  assert.equal((await favorites.list('p2'))[0]?.addedAtMs, 2);

  const watch = new MemoryWatchStateRepository();
  await watch.setLastWatched({ providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 1 });
  await watch.putAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 1000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 1,
  });
  await watch.deleteChannel('p1', 'c1');
  assert.equal(await watch.getLastWatched('p1'), null);
  assert.equal(await watch.getAggregate('p1', 'c1'), null);
});

test('RC-F0 EPG memory seam treats windows as half-open intersections', async () => {
  const epg = new MemoryEpgProgramRepository();
  await epg.replaceWindow('p1', { startMs: 0, endMs: 100 }, [
    { channelId: 'c1', startMs: 0, endMs: 50, title: 'A', description: null },
    { channelId: 'c1', startMs: 50, endMs: 100, title: 'B', description: null },
  ]);

  assert.deepEqual(
    (await epg.listPrograms('p1', 'c1', { startMs: 50, endMs: 100 })).map((p) => p.title),
    ['B'],
  );
});
