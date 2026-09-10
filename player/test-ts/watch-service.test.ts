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
