import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import type { ProviderCredential } from '../src/credentials/contracts.js';
import type { Category, Channel, ProviderRecord } from '../src/domain/models.js';
import { ProviderCoreService } from '../src/providers/provider-core-service.js';
import { ProviderUserStateCleanup } from '../src/providers/provider-user-state-cleanup.js';
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

function noOpUserStateCleanup(): ProviderUserStateCleanup {
  return new ProviderUserStateCleanup(
    { async deleteProvider() {} },
    { async deleteProvider() {} },
  );
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

  const service = new ProviderCoreService(
    providers,
    catalog,
    credentials,
    sync,
    null,
    null,
    noOpUserStateCleanup(),
  );
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

void test('delete fails closed before destructive work when user-state cleanup is unavailable', async () => {
  const { providers, catalog, credentials, sync } = await setup();
  const events: string[] = [];
  const originalCredentialRemove = credentials.remove.bind(credentials);
  const originalCatalogRemove = catalog.removeProviderCatalog.bind(catalog);
  const originalProviderRemove = providers.removeProvider.bind(providers);

  credentials.remove = async (providerId) => {
    events.push('credentials');
    await originalCredentialRemove(providerId);
  };
  catalog.removeProviderCatalog = async (providerId) => {
    events.push('catalog');
    await originalCatalogRemove(providerId);
  };
  providers.removeProvider = async (providerId) => {
    events.push('provider');
    await originalProviderRemove(providerId);
  };

  const service = new ProviderCoreService(
    providers,
    catalog,
    credentials,
    sync,
    null,
    { async deleteProvider() { events.push('epg'); } },
  );

  await assert.rejects(service.deleteProvider('provider-a'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'UNAVAILABLE');
    assert.equal(error.message, 'Provider data is unavailable.');
    return true;
  });

  assert.deepEqual(events, []);
  assert.ok(await providers.getProvider('provider-a'));
  assert.ok(await credentials.load('provider-a'));
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.id), ['a-channel']);
});

void test('delete runs credentials catalog EPG watch favorites and provider metadata in exact order', async () => {
  const { providers, catalog, credentials, sync } = await setup();
  const events: string[] = [];
  const originalCredentialRemove = credentials.remove.bind(credentials);
  const originalCatalogRemove = catalog.removeProviderCatalog.bind(catalog);
  const originalProviderRemove = providers.removeProvider.bind(providers);

  credentials.remove = async (providerId) => {
    events.push('credentials');
    await originalCredentialRemove(providerId);
  };
  catalog.removeProviderCatalog = async (providerId) => {
    events.push('catalog');
    await originalCatalogRemove(providerId);
  };
  providers.removeProvider = async (providerId) => {
    events.push('provider');
    await originalProviderRemove(providerId);
  };

  const cleanup = new ProviderUserStateCleanup(
    { async deleteProvider(providerId) { events.push(`watch:${providerId}`); } },
    { async deleteProvider(providerId) { events.push(`favorites:${providerId}`); } },
  );
  const service = new ProviderCoreService(
    providers,
    catalog,
    credentials,
    sync,
    null,
    { async deleteProvider(providerId) { events.push(`epg:${providerId}`); } },
    cleanup,
  );

  await service.deleteProvider('provider-a');

  assert.deepEqual(events, [
    'credentials',
    'catalog',
    'epg:provider-a',
    'watch:provider-a',
    'favorites:provider-a',
    'provider',
  ]);
});

void test('EPG cleanup failure remains best-effort and strict user-state cleanup still completes', async () => {
  const { providers, catalog, credentials, sync } = await setup();
  const events: string[] = [];
  const cleanup = new ProviderUserStateCleanup(
    { async deleteProvider(providerId) { events.push(`watch:${providerId}`); } },
    { async deleteProvider(providerId) { events.push(`favorites:${providerId}`); } },
  );
  const service = new ProviderCoreService(
    providers,
    catalog,
    credentials,
    sync,
    null,
    {
      async deleteProvider(providerId) {
        events.push(`epg:${providerId}`);
        throw new Error('synthetic EPG failure');
      },
    },
    cleanup,
  );

  await service.deleteProvider('provider-a');

  assert.deepEqual(events, ['epg:provider-a', 'watch:provider-a', 'favorites:provider-a']);
  assert.equal(await providers.getProvider('provider-a'), null);
});

void test('watch cleanup failure is sanitized and blocks favorites and provider metadata removal', async () => {
  const { providers, catalog, credentials, sync } = await setup();
  const events: string[] = [];
  const cleanup = new ProviderUserStateCleanup(
    {
      async deleteProvider(providerId) {
        events.push(`watch:${providerId}`);
        throw new Error('raw watch storage detail');
      },
    },
    { async deleteProvider(providerId) { events.push(`favorites:${providerId}`); } },
  );
  const service = new ProviderCoreService(providers, catalog, credentials, sync, null, null, cleanup);

  await assert.rejects(service.deleteProvider('provider-a'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'UNAVAILABLE');
    assert.equal(error.message, 'Provider data is unavailable.');
    assert.equal(error.message.includes('raw watch'), false);
    return true;
  });

  assert.deepEqual(events, ['watch:provider-a']);
  assert.ok(await providers.getProvider('provider-a'));
});

void test('favorites cleanup failure is sanitized after watch and blocks provider metadata removal', async () => {
  const { providers, catalog, credentials, sync } = await setup();
  const events: string[] = [];
  const cleanup = new ProviderUserStateCleanup(
    { async deleteProvider(providerId) { events.push(`watch:${providerId}`); } },
    {
      async deleteProvider(providerId) {
        events.push(`favorites:${providerId}`);
        throw new Error('raw favorites storage detail');
      },
    },
  );
  const service = new ProviderCoreService(providers, catalog, credentials, sync, null, null, cleanup);

  await assert.rejects(service.deleteProvider('provider-a'), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'UNAVAILABLE');
    assert.equal(error.message, 'Provider data is unavailable.');
    assert.equal(error.message.includes('raw favorites'), false);
    return true;
  });

  assert.deepEqual(events, ['watch:provider-a', 'favorites:provider-a']);
  assert.ok(await providers.getProvider('provider-a'));
});

void test('retry after strict cleanup failure converges without touching another provider partition', async () => {
  const { providers, catalog, credentials, sync } = await setup();
  const events: string[] = [];
  let watchAttempts = 0;
  const cleanup = new ProviderUserStateCleanup(
    {
      async deleteProvider(providerId) {
        events.push(`watch:${providerId}`);
        watchAttempts += 1;
        if (watchAttempts === 1) throw new Error('first attempt unavailable');
      },
    },
    { async deleteProvider(providerId) { events.push(`favorites:${providerId}`); } },
  );
  const service = new ProviderCoreService(providers, catalog, credentials, sync, null, null, cleanup);

  await assert.rejects(
    service.deleteProvider('provider-a'),
    (error: unknown) => error instanceof ProviderError && error.code === 'UNAVAILABLE',
  );
  assert.ok(await providers.getProvider('provider-a'));
  assert.ok(await providers.getProvider('provider-b'));
  assert.ok(await credentials.load('provider-b'));
  assert.deepEqual((await catalog.listChannels('provider-b')).map((item) => item.id), ['b-channel']);

  await service.deleteProvider('provider-a');

  assert.equal(await providers.getProvider('provider-a'), null);
  assert.ok(await providers.getProvider('provider-b'));
  assert.ok(await credentials.load('provider-b'));
  assert.deepEqual((await catalog.listChannels('provider-b')).map((item) => item.id), ['b-channel']);
  assert.deepEqual(events, ['watch:provider-a', 'watch:provider-a', 'favorites:provider-a']);
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
