import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import type { ProviderCredential } from '../src/credentials/contracts.js';
import type { Category, Channel, ProviderRecord } from '../src/domain/models.js';
import type { ProviderAdapter, ProviderAdapterFactory, ProviderProfile } from '../src/providers/contracts.js';
import { ProviderError } from '../src/providers/errors.js';
import { ProviderSyncService } from '../src/providers/provider-sync-service.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';

function provider(id: string): ProviderRecord {
  return { id, kind: 'xtream', name: id, createdAtMs: 1, lastSuccessfulSyncAtMs: null };
}

function category(providerId: string, id: string, name = id): Category {
  return { providerId, id, name };
}

function channel(providerId: string, id: string, name = id): Channel {
  return { providerId, id, name, categoryId: null, logoUrl: null, number: null };
}

const credential: ProviderCredential = {
  kind: 'xtream',
  serverUrl: 'https://example.com',
  username: 'demo-user',
  password: 'demo-pass',
};

class StubAdapter implements ProviderAdapter {
  readonly providerId = 'provider-a';
  readonly kind = 'xtream' as const;

  constructor(
    private readonly profileResult: ProviderProfile | Error,
    private readonly categoriesResult: readonly Category[] | Error,
    private readonly channelsResult: readonly Channel[] | Error,
  ) {}

  async getProfile(): Promise<ProviderProfile> {
    if (this.profileResult instanceof Error) throw this.profileResult;
    return this.profileResult;
  }

  async listCategories(): Promise<readonly Category[]> {
    if (this.categoriesResult instanceof Error) throw this.categoriesResult;
    return this.categoriesResult;
  }

  async listChannels(): Promise<readonly Channel[]> {
    if (this.channelsResult instanceof Error) throw this.channelsResult;
    return this.channelsResult;
  }

  async resolveStream(): Promise<{ url: string }> {
    return { url: 'https://stream.example.com/test.ts' };
  }
}

class StubFactory implements ProviderAdapterFactory {
  readonly calls: Array<{ provider: ProviderRecord; credential: ProviderCredential }> = [];
  constructor(private readonly adapter: ProviderAdapter) {}
  create(record: ProviderRecord, providerCredential: ProviderCredential): ProviderAdapter {
    this.calls.push({ provider: record, credential: providerCredential });
    return this.adapter;
  }
}

function goodProfile(): ProviderProfile {
  return {
    providerId: 'provider-a',
    kind: 'xtream',
    accountName: null,
    expiresAtMs: null,
    maxConnections: null,
  };
}

async function setup(adapter: ProviderAdapter) {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();
  const factory = new StubFactory(adapter);
  await providers.saveProvider(provider('provider-a'));
  await providers.saveProvider(provider('provider-b'));
  await credentials.save('provider-a', credential);
  const service = new ProviderSyncService(providers, catalog, credentials, factory, () => 123456);
  return { service, providers, catalog, credentials, factory };
}

void test('provider sync replaces successful stages and updates last successful sync on channel success', async () => {
  const adapter = new StubAdapter(
    goodProfile(),
    [category('provider-a', 'new-cat')],
    [channel('provider-a', '1', 'New One'), channel('provider-a', '2', 'Two')],
  );
  const { service, providers, catalog, factory } = await setup(adapter);
  await catalog.replaceCategories('provider-a', [category('provider-a', 'old-cat')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', '1', 'Old One')]);

  const report = await service.refresh('provider-a');

  assert.deepEqual(report, {
    providerId: 'provider-a',
    profile: 'success',
    categories: { status: 'success', count: 1 },
    channels: { status: 'success', count: 2 },
    completedAtMs: 123456,
  });
  assert.deepEqual((await catalog.listCategories('provider-a')).map((item) => item.id), ['new-cat']);
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.name), ['New One', 'Two']);
  assert.equal((await providers.getProvider('provider-a'))?.lastSuccessfulSyncAtMs, 123456);
  assert.equal(factory.calls.length, 1);
});

void test('provider sync preserves old channels when channel stage fails but keeps successful categories', async () => {
  const adapter = new StubAdapter(
    goodProfile(),
    [category('provider-a', 'new-cat')],
    new ProviderError('NETWORK', null, 'Provider network request failed.'),
  );
  const { service, providers, catalog } = await setup(adapter);
  await catalog.replaceCategories('provider-a', [category('provider-a', 'old-cat')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'old', 'Old Channel')]);

  const report = await service.refresh('provider-a');

  assert.deepEqual(report.categories, { status: 'success', count: 1 });
  assert.deepEqual(report.channels, { status: 'failed', code: 'NETWORK' });
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.id), ['old']);
  assert.equal((await providers.getProvider('provider-a'))?.lastSuccessfulSyncAtMs, null);
});

void test('provider sync keeps channel success when profile fails', async () => {
  const adapter = new StubAdapter(
    new ProviderError('AUTH', null, 'Provider authentication failed.'),
    [category('provider-a', 'cat')],
    [channel('provider-a', 'fresh')],
  );
  const { service, providers, catalog } = await setup(adapter);

  const report = await service.refresh('provider-a');

  assert.equal(report.profile, 'failed');
  assert.deepEqual(report.channels, { status: 'success', count: 1 });
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.id), ['fresh']);
  assert.equal((await providers.getProvider('provider-a'))?.lastSuccessfulSyncAtMs, 123456);
});

void test('provider sync reports AUTH per failing catalog stage and preserves both old caches', async () => {
  const auth = new ProviderError('AUTH', null, 'Provider authentication failed.');
  const adapter = new StubAdapter(auth, auth, auth);
  const { service, catalog } = await setup(adapter);
  await catalog.replaceCategories('provider-a', [category('provider-a', 'old-cat')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'old')]);

  const report = await service.refresh('provider-a');

  assert.equal(report.profile, 'failed');
  assert.deepEqual(report.categories, { status: 'failed', code: 'AUTH' });
  assert.deepEqual(report.channels, { status: 'failed', code: 'AUTH' });
  assert.deepEqual((await catalog.listCategories('provider-a')).map((item) => item.id), ['old-cat']);
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.id), ['old']);
});

void test('provider sync never changes another provider catalog', async () => {
  const adapter = new StubAdapter(goodProfile(), [], [channel('provider-a', 'shared', 'A')]);
  const { service, catalog } = await setup(adapter);
  await catalog.replaceCategories('provider-b', [category('provider-b', 'keep')]);
  await catalog.replaceChannels('provider-b', [channel('provider-b', 'shared', 'B')]);

  await service.refresh('provider-a');

  assert.deepEqual((await catalog.listCategories('provider-b')).map((item) => item.id), ['keep']);
  assert.deepEqual((await catalog.listChannels('provider-b')).map((item) => item.name), ['B']);
});

void test('provider sync reconciles rename update remove by stable ID and handles 1000 channels', async () => {
  const fresh = Array.from({ length: 1000 }, (_, index) => channel(
    'provider-a',
    String(index),
    index === 1 ? 'Renamed' : `Channel ${index}`,
  ));
  const adapter = new StubAdapter(goodProfile(), [], fresh);
  const { service, catalog } = await setup(adapter);
  await catalog.replaceChannels('provider-a', [
    channel('provider-a', '1', 'Old Name'),
    channel('provider-a', 'removed', 'Removed'),
  ]);

  const report = await service.refresh('provider-a');
  const stored = await catalog.listChannels('provider-a');

  assert.deepEqual(report.channels, { status: 'success', count: 1000 });
  assert.equal(stored.length, 1000);
  assert.equal(stored.find((item) => item.id === '1')?.name, 'Renamed');
  assert.equal(stored.some((item) => item.id === 'removed'), false);
});

void test('provider sync rejects missing provider before creating an adapter', async () => {
  const adapter = new StubAdapter(goodProfile(), [], []);
  const { service, factory } = await setup(adapter);

  await assert.rejects(service.refresh('missing'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'NOT_FOUND');
    assert.equal(error.message, 'Provider configuration was not found.');
    return true;
  });
  assert.equal(factory.calls.length, 0);
});

void test('provider sync rejects missing credential without leaking configuration', async () => {
  const adapter = new StubAdapter(goodProfile(), [], []);
  const { service, credentials, factory } = await setup(adapter);
  await credentials.remove('provider-a');

  await assert.rejects(service.refresh('provider-a'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'UNAVAILABLE');
    assert.equal(error.message, 'Provider credential is unavailable.');
    assert.equal(String(error).includes('demo-pass'), false);
    return true;
  });
  assert.equal(factory.calls.length, 0);
});
