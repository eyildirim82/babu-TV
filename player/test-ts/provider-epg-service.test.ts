import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import type { Channel, ProviderRecord } from '../src/domain/models.js';
import { StructuredEpgProgramRepository } from '../src/epg/structured-epg-program-repository.js';
import type { ProviderAdapter, ProviderAdapterFactory, ProviderProfile } from '../src/providers/contracts.js';
import { ProviderEpgService } from '../src/providers/provider-epg-service.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';

const window = { startMs: 100_000, endMs: 300_000 };

function provider(id: string): ProviderRecord {
  return { id, kind: 'xtream', name: id, createdAtMs: 1, lastSuccessfulSyncAtMs: null };
}

function channel(providerId: string, id: string, name = id): Channel {
  return { providerId, id, name, categoryId: null, logoUrl: null, number: null };
}

function profile(providerId: string): ProviderProfile {
  return {
    providerId,
    kind: 'xtream',
    accountName: null,
    expiresAtMs: null,
    maxConnections: null,
  };
}

function fakeAdapterFactory(rowsByProvider: Readonly<Record<string, readonly any[]>>): ProviderAdapterFactory {
  return {
    create(record): ProviderAdapter {
      return {
        providerId: record.id,
        kind: record.kind,
        async getProfile() { return profile(record.id); },
        async listCategories() { return []; },
        async listChannels() { return []; },
        async resolveStream() { return { url: 'https://synthetic.invalid/stream' }; },
        epg: {
          describeChannels(channels: readonly Channel[]) {
            return channels.map((item) => ({
              providerId: item.providerId,
              channelId: item.id,
              name: item.name,
              epgIds: [item.id],
            }));
          },
          createSource() {
            return {
              providerId: record.id,
              async listPrograms() { return rowsByProvider[record.id] ?? []; },
            };
          },
        },
      } as ProviderAdapter;
    },
  };
}

async function createHarness(rowsByProvider: Readonly<Record<string, readonly any[]>>) {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();
  const repository = new StructuredEpgProgramRepository(store);
  const adapters = fakeAdapterFactory(rowsByProvider);

  await providers.saveProvider(provider('p1'));
  await providers.saveProvider(provider('p2'));
  await catalog.replaceChannels('p1', [channel('p1', 'c1', 'News')]);
  await catalog.replaceChannels('p2', [channel('p2', 'c1', 'Other News')]);
  await credentials.save('p1', {
    kind: 'xtream',
    serverUrl: 'https://synthetic.invalid',
    username: 'user-one',
    password: 'secret-one',
  });
  await credentials.save('p2', {
    kind: 'xtream',
    serverUrl: 'https://synthetic.invalid',
    username: 'user-two',
    password: 'secret-two',
  });

  const service = new ProviderEpgService({ providers, catalog, credentials, adapters, repository });
  return { service, repository };
}

test('EPG-PI refresh maps normalizes and persists only the requested provider partition', async () => {
  const { service, repository } = await createHarness({
    p1: [{
      sourceChannel: { providerChannelId: 'c1', tvgId: null, name: null },
      startMs: 120_000,
      endMs: 180_000,
      title: '  Bulletin  ',
      description: '  Summary  ',
    }],
  });

  const result = await service.refresh('p1', window);

  assert.deepEqual(result, { providerId: 'p1', status: 'success', programCount: 1 });
  assert.deepEqual(await repository.listPrograms('p1', 'c1', window), [{
    channelId: 'c1',
    startMs: 120_000,
    endMs: 180_000,
    title: 'Bulletin',
    description: 'Summary',
  }]);
  assert.deepEqual(await repository.listPrograms('p2', 'c1', window), []);
});
