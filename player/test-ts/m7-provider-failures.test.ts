import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import type { Category, Channel, ProviderRecord } from '../src/domain/models.js';
import type { ProviderAdapter, ProviderAdapterFactory, ProviderProfile } from '../src/providers/contracts.js';
import { ProviderSyncService } from '../src/providers/provider-sync-service.js';
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

function profile(providerId: string): ProviderProfile {
  return {
    providerId,
    kind: 'xtream',
    accountName: null,
    expiresAtMs: null,
    maxConnections: null,
  };
}

class EmptyCatalogAdapter implements ProviderAdapter {
  readonly providerId = 'provider-a';
  readonly kind = 'xtream' as const;

  async getProfile(): Promise<ProviderProfile> {
    return profile(this.providerId);
  }

  async listCategories(): Promise<readonly Category[]> {
    return [category(this.providerId, 'new-category')];
  }

  async listChannels(): Promise<readonly Channel[]> {
    return [];
  }

  async resolveStream(): Promise<{ url: string }> {
    return { url: 'https://stream.example.invalid/channel.ts' };
  }
}

const factory: ProviderAdapterFactory = {
  create() {
    return new EmptyCatalogAdapter();
  },
};

test('M7 FAIL empty provider catalog preserves usable channel cache and does not advance sync', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();

  await providers.saveProvider(provider('provider-a'));
  await providers.setActiveProviderId('provider-a');
  await catalog.replaceCategories('provider-a', [category('provider-a', 'old-category')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'cached-channel')]);
  await credentials.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.invalid',
    username: 'm7-user',
    password: 'm7-secret',
  });

  const service = new ProviderSyncService(
    providers,
    catalog,
    credentials,
    factory,
    () => 123_456,
  );

  const report = await service.refresh('provider-a');

  assert.deepEqual(report.channels, { status: 'failed', code: 'MALFORMED' });
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.id), [
    'cached-channel',
  ]);
  assert.equal((await providers.getProvider('provider-a'))?.lastSuccessfulSyncAtMs, null);
  assert.equal(await providers.getActiveProviderId(), 'provider-a');
});
