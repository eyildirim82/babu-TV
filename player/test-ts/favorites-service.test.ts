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

test('FAV-D keeps providers isolated and add idempotent', async () => {
  const repo = new MemoryFavoriteRepository();
  let now = 100;
  const service = new FavoriteService(repo, () => now);

  await service.add('p1', 'c1');
  now = 200;
  await service.add('p1', 'c1');
  await service.add('p2', 'c1');

  assert.deepEqual(await service.list('p1'), [
    { providerId: 'p1', channelId: 'c1', addedAtMs: 100 },
  ]);
  assert.deepEqual(await service.list('p2'), [
    { providerId: 'p2', channelId: 'c1', addedAtMs: 200 },
  ]);
  assert.equal(await service.isFavorite('p1', 'c1'), true);
  assert.equal(await service.isFavorite('p1', 'missing'), false);
});

test('FAV-D remove of a missing favorite is harmless', async () => {
  const repo = new MemoryFavoriteRepository();
  const service = new FavoriteService(repo);

  await service.add('p1', 'c1');
  await service.remove('p1', 'missing');

  assert.equal(await service.isFavorite('p1', 'c1'), true);
});

test('FAV-D reconciliation reports missing favorites without deleting them', async () => {
  const repo = new MemoryFavoriteRepository();
  const service = new FavoriteService(repo, () => 10);
  await service.add('p1', 'present');
  await service.add('p1', 'missing');

  const result = await service.reconcile('p1', new Set(['present']));
  assert.deepEqual(result.available.map((item) => item.channelId), ['present']);
  assert.deepEqual(result.missing.map((item) => item.channelId), ['missing']);
  assert.equal(await service.isFavorite('p1', 'missing'), true);
});

test('FAV-D reconciliation uses stable channel IDs rather than catalog order', async () => {
  const repo = new MemoryFavoriteRepository();
  let now = 10;
  const service = new FavoriteService(repo, () => now++);
  await service.add('p1', 'first-added');
  await service.add('p1', 'second-added');

  const result = await service.reconcile(
    'p1',
    new Set(['second-added', 'first-added']),
  );

  assert.deepEqual(
    result.available.map((item) => item.channelId),
    ['first-added', 'second-added'],
  );
  assert.deepEqual(result.missing, []);
});

test('FAV-D deleteProvider removes only the selected provider favorites', async () => {
  const repo = new MemoryFavoriteRepository();
  const service = new FavoriteService(repo, () => 10);
  await service.add('p1', 'c1');
  await service.add('p2', 'c1');

  await service.deleteProvider('p1');

  assert.deepEqual(await service.list('p1'), []);
  assert.deepEqual(await service.list('p2'), [
    { providerId: 'p2', channelId: 'c1', addedAtMs: 10 },
  ]);
});
