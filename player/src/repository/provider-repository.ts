import type { ProviderId, ProviderRecord } from '../domain/models.js';

export interface ProviderRepository {
  listProviders(): Promise<readonly ProviderRecord[]>;
  getProvider(providerId: ProviderId): Promise<ProviderRecord | null>;
  saveProvider(provider: ProviderRecord): Promise<void>;
  removeProvider(providerId: ProviderId): Promise<void>;
  getActiveProviderId(): Promise<ProviderId | null>;
  setActiveProviderId(providerId: ProviderId | null): Promise<void>;
}
