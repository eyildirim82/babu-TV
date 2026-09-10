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
