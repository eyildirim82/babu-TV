import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel } from '../src/domain/models.js';
import { makeChannelKey } from '../src/domain/models.js';
import { MemoryChannelRepository } from '../src/repository/memory-channel-repository.js';
import { reconcileChannels } from '../src/repository/reconcile.js';

function channel(providerId: string, id: string, name: string, number: number | null = null): Channel {
  return {
    providerId,
    id,
    name,
    categoryId: 'live',
    logoUrl: null,
    number,
  };
}

function keys(channels: readonly Channel[]): string[] {
  return channels.map((item) => makeChannelKey(item.providerId, item.id));
}

void test('memory repository scopes duplicate external channel IDs by provider', async () => {
  const repository = new MemoryChannelRepository();
  const providerA = channel('provider-a', '42', 'A News', 1);
  const providerB = channel('provider-b', '42', 'B News', 1);

  await repository.replaceProviderChannels('provider-a', [providerA]);
  await repository.replaceProviderChannels('provider-b', [providerB]);

  assert.deepEqual(await repository.getChannel('provider-a', '42'), providerA);
  assert.deepEqual(await repository.getChannel('provider-b', '42'), providerB);
  assert.deepEqual(keys(await repository.listChannels('provider-a')), ['provider-a:42']);
  assert.deepEqual(keys(await repository.listChannels('provider-b')), ['provider-b:42']);
});

void test('reconciliation classifies add update remove and retain by stable provider-scoped ID', () => {
  const previous = [
    channel('provider-a', '1', 'One', 1),
    channel('provider-a', '2', 'Two', 2),
    channel('provider-a', '3', 'Three', 3),
  ];
  const next = [
    channel('provider-a', '2', 'Two HD', 2),
    channel('provider-a', '4', 'Four', 4),
    channel('provider-a', '1', 'One', 1),
  ];

  const result = reconcileChannels(previous, next);

  assert.deepEqual(keys(result.added), ['provider-a:4']);
  assert.deepEqual(keys(result.updated), ['provider-a:2']);
  assert.deepEqual(keys(result.removed), ['provider-a:3']);
  assert.deepEqual(keys(result.retained), ['provider-a:1']);
});

void test('reconciliation treats pure order changes as retained identities', () => {
  const one = channel('provider-a', '1', 'One', 1);
  const two = channel('provider-a', '2', 'Two', 2);

  const result = reconcileChannels([one, two], [two, one]);

  assert.deepEqual(result.added, []);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(keys(result.retained), ['provider-a:2', 'provider-a:1']);
});
