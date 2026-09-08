import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Channel, ProviderRecord } from '../src/domain/models.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import {
  IndexedDbStructuredStore,
  StorageUnavailableError,
} from '../src/storage/indexeddb-structured-store.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';

function provider(
  id: string,
  kind: 'xtream' | 'm3u' = 'xtream',
  name = id,
): ProviderRecord {
  return {
    id,
    kind,
    name,
    createdAtMs: 1_788_806_400_000,
    lastSuccessfulSyncAtMs: null,
  };
}

function category(providerId: string, id: string, name = id): Category {
  return { providerId, id, name };
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

void test('structured repository persists providers and one active provider across repository instances', async () => {
  const store = new MemoryStructuredStore();
  const first = new StructuredProviderRepository(store);
  await first.saveProvider(provider('provider-a', 'xtream', 'Main'));
  await first.saveProvider(provider('provider-b', 'm3u', 'Backup'));
  await first.setActiveProviderId('provider-b');

  const reopened = new StructuredProviderRepository(store);

  assert.deepEqual(await reopened.listProviders(), [
    provider('provider-a', 'xtream', 'Main'),
    provider('provider-b', 'm3u', 'Backup'),
  ]);
  assert.equal(await reopened.getActiveProviderId(), 'provider-b');
});

void test('structured provider repository rejects unknown active provider without corrupting persisted state', async () => {
  const store = new MemoryStructuredStore();
  const repository = new StructuredProviderRepository(store);
  await repository.saveProvider(provider('provider-a'));
  await repository.setActiveProviderId('provider-a');

  await assert.rejects(repository.setActiveProviderId('provider-missing'));

  assert.equal(await repository.getActiveProviderId(), 'provider-a');
});

void test('structured catalog scopes duplicate channel IDs and replaces only the selected provider rows', async () => {
  const store = new MemoryStructuredStore();
  const catalog = new StructuredCatalogRepository(store);

  await catalog.replaceChannels('provider-a', [channel('provider-a', 'shared', 'A old')]);
  await catalog.replaceChannels('provider-b', [channel('provider-b', 'shared', 'B')]);

  assert.equal((await catalog.getChannel('provider-a', 'shared'))?.name, 'A old');
  assert.equal((await catalog.getChannel('provider-b', 'shared'))?.name, 'B');

  await catalog.replaceChannels('provider-a', [
    channel('provider-a', 'shared', 'A new'),
    channel('provider-a', 'a-only', 'A only'),
  ]);

  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.name), ['A new', 'A only']);
  assert.deepEqual((await catalog.listChannels('provider-b')).map((item) => item.name), ['B']);
});

void test('structured catalog replaces categories and removes only one provider catalog', async () => {
  const store = new MemoryStructuredStore();
  const catalog = new StructuredCatalogRepository(store);

  await catalog.replaceCategories('provider-a', [category('provider-a', 'news', 'News')]);
  await catalog.replaceCategories('provider-b', [category('provider-b', 'news', 'Other News')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', '1')]);
  await catalog.replaceChannels('provider-b', [channel('provider-b', '1')]);

  await catalog.replaceCategories('provider-a', [category('provider-a', 'sports', 'Sports')]);
  assert.deepEqual((await catalog.listCategories('provider-a')).map((item) => item.id), ['sports']);
  assert.deepEqual((await catalog.listCategories('provider-b')).map((item) => item.id), ['news']);

  await catalog.removeProviderCatalog('provider-a');

  assert.deepEqual(await catalog.listCategories('provider-a'), []);
  assert.deepEqual(await catalog.listChannels('provider-a'), []);
  assert.equal((await catalog.listCategories('provider-b')).length, 1);
  assert.equal((await catalog.listChannels('provider-b')).length, 1);
});

void test('structured persistence strips credential and raw-stream shaped fields from ordinary stores', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);

  await providers.saveProvider({
    ...provider('provider-a'),
    serverUrl: 'https://example.com',
    playlistUrl: 'https://example.com/list.m3u?password=demo-pass',
    username: 'demo-user',
    password: 'demo-pass',
  } as ProviderRecord);

  await catalog.replaceCategories('provider-a', [{
    ...category('provider-a', 'news'),
    password: 'demo-pass',
  } as Category]);
  await catalog.replaceChannels('provider-a', [{
    ...channel('provider-a', '1'),
    streamUrl: 'https://demo-user:demo-pass@example.com/live/1.ts',
    password: 'demo-pass',
  } as Channel]);

  const storedRecords = [
    ...(await store.getAll<Record<string, unknown>>('providers')),
    ...(await store.getAll<Record<string, unknown>>('categories')),
    ...(await store.getAll<Record<string, unknown>>('channels')),
    ...(await store.getAll<Record<string, unknown>>('app_state')),
  ];
  const serialized = JSON.stringify(storedRecords);

  assert.equal(serialized.includes('demo-user'), false);
  assert.equal(serialized.includes('demo-pass'), false);
  assert.equal(serialized.includes('streamUrl'), false);
  assert.equal(serialized.includes('playlistUrl'), false);
  assert.equal(serialized.includes('serverUrl'), false);
});

void test('unavailable IndexedDB fails closed with deterministic storage error', async () => {
  const store = new IndexedDbStructuredStore(null);

  await assert.rejects(
    store.get('providers', 'provider-a'),
    (error: unknown) => error instanceof StorageUnavailableError
      && error.message === 'Structured storage is unavailable.',
  );
});
