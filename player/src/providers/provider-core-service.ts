import type { CredentialStore, ProviderCredential } from '../credentials/contracts.js';
import type {
  Category,
  Channel,
  ProviderId,
  ProviderRecord,
} from '../domain/models.js';
import type { CatalogRepository } from '../repository/catalog-repository.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import type { ProviderAdapterFactory, ProviderProfile } from './contracts.js';
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

function duplicateProvider(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Provider configuration already exists.');
}

function invalidProviderConfiguration(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Provider configuration is invalid.');
}

function registrationUnavailable(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider registration is unavailable.');
}

function persistenceUnavailable(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider configuration could not be saved.');
}

export class ProviderCoreService {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly catalog: CatalogRepository,
    private readonly credentials: CredentialStore,
    private readonly sync: ProviderSyncPort,
    private readonly adapters: ProviderAdapterFactory | null = null,
  ) {}

  async registerProvider(
    provider: ProviderRecord,
    credential: ProviderCredential,
  ): Promise<ProviderProfile> {
    if (await this.providers.getProvider(provider.id) !== null) throw duplicateProvider();
    if (provider.kind !== credential.kind) throw invalidProviderConfiguration();
    if (this.adapters === null) throw registrationUnavailable();

    const adapter = this.adapters.create(provider, credential);
    const profile = await adapter.getProfile();

    try {
      await this.credentials.save(provider.id, credential);
    } catch {
      try {
        await this.credentials.remove(provider.id);
      } catch {
        // Best-effort cleanup only; never expose underlying credential-store errors.
      }
      throw persistenceUnavailable();
    }

    try {
      await this.providers.saveProvider(provider);
    } catch {
      try {
        await this.credentials.remove(provider.id);
      } catch {
        // Best-effort cleanup only; the public error remains sanitized.
      }
      throw persistenceUnavailable();
    }

    return profile;
  }

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
