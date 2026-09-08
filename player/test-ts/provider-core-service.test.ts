import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import type { ProviderCredential } from '../src/credentials/contracts.js';
import type { Category, Channel, ProviderRecord } from '../src/domain/models.js';
import { ProviderCoreService } from '../src/providers/provider-core-service.js';
import type { ProviderSyncReport } from '../src/providers/provider-sync-service.js';
import { ProviderError } from '../src/providers/errors.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';

function provider(id: string): ProviderRecord {
  return { id, kind: 'xtream', name: id, createdAtMs: 1, lastSuccessfulSyncAtMs: null };
}

function category(providerId: string, id: string): Category {
  return { providerId, id, name: id };
}

function channel(providerId: string, id: string): Channel {
  return { providerId, id, name: id, categoryId: null, logoUrl: null, number: null };
}

function credential(id: string): ProviderCredential {
  return {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: `user-${id}`,
    password: `pass-${id}`,
  };
}

function report(providerId: string): ProviderSyncReport {
  return {
    providerId,
    profile: 'success',
    categories: { status: 'success', count: 1 },
    channels: { status: 'success', count: 1 },
    completedAtMs: 123,
  };
}

class DeferredSync {
  readonly calls: string[] = [];
  private resolvePending: ((value: ProviderSyncReport) => void) | null = null;
  private rejectPending: ((reason: Error) => void) | null = null;

  refresh(providerId: string): Promise<ProviderSyncReport> {
    this.calls.push(providerId);
    return new Promise((resolve, reject) => {
      this.resolvePending = resolve;
      this.rejectPending = reject;
    });
  }

  resolve(providerId: string): void {
    this.resolvePending?.(report(providerId));
  }

  reject(): void {
    this.rejectPending?.(new ProviderError('NETWORK', null, 'Provider network request failed.'));
  }
}

async function setup(sync = new DeferredSync()) {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();

  await providers.saveProvider(provider('provider-a'));
  await providers.saveProvider(provider('provider-b'));
  await providers.setActiveProviderId('provider-a');
  await credentials.save('provider-a', credential('a'));
  await credentials.save('provider-b', credential('b'));
  await catalog.replaceCategories('provider-a', [category('provider-a', 'a-cat')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'a-channel')]);
  await catalog.replaceCategories('provider-b', [category('provider-b', 'b-cat')]);
  await catalog.replaceChannels('provider-b', [channel('provider-b', 'b-channel')]);

  const service = new ProviderCoreService(providers, catalog, credentials, sync);
  return { service, providers, catalog, credentials, sync };
}

void test('cache-first load resolves cached snapshot while background refresh remains pending', async () => {
  const { service, sync } = await setup();

  const load = await service.loadCacheFirst('provider-a');

  assert.equal(load.cached.provider.id, 'provider-a');
  assert.deepEqual(load.cached.categories.map((item) => item.id), ['a-cat']);
  assert.deepEqual(load.cached.channels.map((item) => item.id), ['a-channel']);
  assert.deepEqual(sync.calls, ['provider-a']);

  let refreshSettled = false;
  void load.refresh.finally(() => { refreshSettled = true; });
  await Promise.resolve();
  assert.equal(refreshSettled, false);

  sync.resolve('provider-a');
  assert.equal((await load.refresh).providerId, 'provider-a');
});

void test('failed background refresh does not erase the cache-first snapshot or repository cache', async () => {
  const { service, catalog, sync } = await setup();

  const load = await service.loadCacheFirst('provider-a');
  sync.reject();

  await assert.rejects(load.refresh, (error: unknown) => error instanceof ProviderError && error.code === 'NETWORK');
  assert.deepEqual(load.cached.channels.map((item) => item.id), ['a-channel']);
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.id), ['a-channel']);
});

void test('switch active provider changes only after the target provider is confirmed', async () => {
  const { service, providers } = await setup();

  await service.switchActiveProvider('provider-b');
  assert.equal(await providers.getActiveProviderId(), 'provider-b');

  await assert.rejects(service.switchActiveProvider('missing'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'NOT_FOUND');
    assert.equal(error.message, 'Provider configuration was not found.');
    return true;
  });
  assert.equal(await providers.getActiveProviderId(), 'provider-b');
});

void test('delete active provider removes credential catalog metadata and clears active state only for target', async () => {
  const { service, providers, catalog, credentials } = await setup();

  await service.deleteProvider('provider-a');

  assert.equal(await providers.getProvider('provider-a'), null);
  assert.equal(await credentials.load('provider-a'), null);
  assert.deepEqual(await catalog.listCategories('provider-a'), []);
  assert.deepEqual(await catalog.listChannels('provider-a'), []);
  assert.equal(await providers.getActiveProviderId(), null);

  assert.ok(await providers.getProvider('provider-b'));
  assert.ok(await credentials.load('provider-b'));
  assert.deepEqual((await catalog.listChannels('provider-b')).map((item) => item.id), ['b-channel']);
});

void test('delete inactive provider preserves active provider and its local state', async () => {
  const { service, providers, catalog, credentials } = await setup();

  await service.deleteProvider('provider-b');

  assert.equal(await providers.getActiveProviderId(), 'provider-a');
  assert.ok(await providers.getProvider('provider-a'));
  assert.ok(await credentials.load('provider-a'));
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.id), ['a-channel']);
  assert.equal(await providers.getProvider('provider-b'), null);
});

void test('cache-first load rejects missing provider without starting refresh', async () => {
  const { service, sync } = await setup();

  await assert.rejects(service.loadCacheFirst('missing'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'NOT_FOUND');
    return true;
  });
  assert.deepEqual(sync.calls, []);
});
