import type { CredentialStore } from '../credentials/contracts.js';
import type {
  Category,
  Channel,
  ProviderId,
  ProviderRecord,
} from '../domain/models.js';
import type { CatalogRepository } from '../repository/catalog-repository.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import { ProviderError } from './errors.js';
import type { ProviderSyncReport } from './provider-sync-service.js';

export interface ProviderSnapshot {
  provider: ProviderRecord;
  categories: readonly Category[];
  channels: readonly Channel[];
}

export interface CacheFirstLoad {
  cached: ProviderSnapshot;
  refresh: Promise<ProviderSyncReport>;
}

export interface ProviderSyncPort {
  refresh(providerId: ProviderId): Promise<ProviderSyncReport>;
}

function missingProvider(): ProviderError {
  return new ProviderError('NOT_FOUND', null, 'Provider configuration was not found.');
}

export class ProviderCoreService {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly catalog: CatalogRepository,
    private readonly credentials: CredentialStore,
    private readonly sync: ProviderSyncPort,
  ) {}

  async loadCached(providerId: ProviderId): Promise<ProviderSnapshot> {
    const provider = await this.providers.getProvider(providerId);
    if (provider === null) throw missingProvider();

    const [categories, channels] = await Promise.all([
      this.catalog.listCategories(providerId),
      this.catalog.listChannels(providerId),
    ]);

    return { provider, categories, channels };
  }

  async loadCacheFirst(providerId: ProviderId): Promise<CacheFirstLoad> {
    const cached = await this.loadCached(providerId);
    const refresh = this.sync.refresh(providerId);
    return { cached, refresh };
  }

  async switchActiveProvider(providerId: ProviderId): Promise<void> {
    if (await this.providers.getProvider(providerId) === null) throw missingProvider();
    await this.providers.setActiveProviderId(providerId);
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    if (await this.providers.getProvider(providerId) === null) throw missingProvider();

    await this.credentials.remove(providerId);
    await this.catalog.removeProviderCatalog(providerId);
    await this.providers.removeProvider(providerId);
  }
}
