import test from 'node:test';
import assert from 'node:assert/strict';
import { FavoriteService } from '../src/favorites/service.js';
import { MemoryFavoriteRepository } from './support/v1-rc-memory-repositories.js';

test('FAV-D toggles one provider-scoped favorite deterministically', async () => {
  const repo = new MemoryFavoriteRepository();
  const service = new FavoriteService(repo, () => 1234);

  assert.equal(await service.toggle('p1', 'c1'), true);
  assert.deepEqual(await service.list('p1'), [
    { providerId: 'p1', channelId: 'c1', addedAtMs: 1234 },
  ]);
  assert.equal(await service.toggle('p1', 'c1'), false);
  assert.deepEqual(await service.list('p1'), []);
});
