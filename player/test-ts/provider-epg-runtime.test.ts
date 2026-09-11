import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import type { ProviderRecord } from '../src/domain/models.js';
import { StructuredEpgProgramRepository } from '../src/epg/structured-epg-program-repository.js';
import { createBrowserProviderRuntime } from '../src/providers/create-browser-provider-runtime.js';
import { ProviderAdapterFactoryImpl } from '../src/providers/provider-adapter-factory.js';
import { ProviderCoreService } from '../src/providers/provider-core-service.js';
import { ProviderUserStateCleanup } from '../src/providers/provider-user-state-cleanup.js';
import type { ProviderSyncReport } from '../src/providers/provider-sync-service.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';

function provider(id: string): ProviderRecord {
  return { id, kind: 'xtream', name: id, createdAtMs: 1, lastSuccessfulSyncAtMs: null };
}

function report(providerId: string): ProviderSyncReport {
  return {
    providerId,
    profile: 'success',
    categories: { status: 'success', count: 0 },
    channels: { status: 'success', count: 0 },
    completedAtMs: 1,
  };
}

function noOpUserStateCleanup(): ProviderUserStateCleanup {
  return new ProviderUserStateCleanup(
    { async deleteProvider() {} },
    { async deleteProvider() {} },
  );
}

test('EPG-PI browser provider runtime composes structured EPG persistence and refresh orchestration', () => {
  const runtime = createBrowserProviderRuntime({
    indexedDb: null,
    widgetData: null,
    fetchImpl: (async () => { throw new Error('not called'); }) as typeof fetch,
  });

  assert.ok(runtime.epgRepository instanceof StructuredEpgProgramRepository);
  assert.equal(typeof runtime.epg.refresh, 'function');
  assert.equal(typeof runtime.epg.refreshInBackground, 'function');
});

test('EPG-PI Provider Core deletion cleans only the target EPG partition', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();
  const epgRepository = new StructuredEpgProgramRepository(store);
  const sync = { async refresh(providerId: string) { return report(providerId); } };

  await providers.saveProvider(provider('p1'));
  await providers.saveProvider(provider('p2'));
  await credentials.save('p1', {
    kind: 'xtream', serverUrl: 'https://synthetic.invalid', username: 'u1', password: 'p1',
  });
  await credentials.save('p2', {
    kind: 'xtream', serverUrl: 'https://synthetic.invalid', username: 'u2', password: 'p2',
  });
  await epgRepository.replaceWindow('p1', { startMs: 0, endMs: 100 }, [
    { channelId: 'c', startMs: 0, endMs: 50, title: 'P1', description: null },
  ]);
  await epgRepository.replaceWindow('p2', { startMs: 0, endMs: 100 }, [
    { channelId: 'c', startMs: 0, endMs: 50, title: 'P2', description: null },
  ]);

  const core = new ProviderCoreService(
    providers,
    catalog,
    credentials,
    sync,
    null,
    { deleteProvider: (providerId) => epgRepository.deleteProvider(providerId) },
    noOpUserStateCleanup(),
  );

  await core.deleteProvider('p1');

  assert.deepEqual(await epgRepository.listPrograms('p1', 'c', { startMs: 0, endMs: 100 }), []);
  assert.equal((await epgRepository.listPrograms('p2', 'c', { startMs: 0, endMs: 100 }))[0]?.title, 'P2');
  assert.equal(await providers.getProvider('p1'), null);
  assert.ok(await providers.getProvider('p2'));
});

test('EPG-PI EPG cleanup failure never blocks normal Provider Core removal', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();
  const sync = { async refresh(providerId: string) { return report(providerId); } };

  await providers.saveProvider(provider('p1'));
  await credentials.save('p1', {
    kind: 'xtream', serverUrl: 'https://synthetic.invalid', username: 'u1', password: 'p1',
  });

  const core = new ProviderCoreService(
    providers,
    catalog,
    credentials,
    sync,
    null,
    { async deleteProvider() { throw new Error('EPG storage unavailable'); } },
    noOpUserStateCleanup(),
  );

  await core.deleteProvider('p1');
  assert.equal(await providers.getProvider('p1'), null);
  assert.equal(await credentials.load('p1'), null);
});

test('EPG-PI does not invent XMLTV capability for M3U without an explicit provider source contract', () => {
  const http = {
    async getJson<T>(): Promise<T> { throw new Error('not called'); },
    async getText(): Promise<string> { return '#EXTM3U\n'; },
  };
  const adapters = new ProviderAdapterFactoryImpl(http);
  const adapter = adapters.create(
    { id: 'm3u', kind: 'm3u', name: 'M3U', createdAtMs: 1, lastSuccessfulSyncAtMs: null },
    { kind: 'm3u', playlistUrl: 'https://synthetic.invalid/list.m3u' },
  );

  assert.equal(adapter.epg, undefined);
});
