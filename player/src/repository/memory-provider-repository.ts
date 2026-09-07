import type { ProviderId, ProviderRecord } from '../domain/models.js';
import type { ProviderRepository } from './provider-repository.js';

export class UnknownProviderError extends Error {
  constructor(public readonly providerId: ProviderId) {
    super('Unknown provider.');
    this.name = 'UnknownProviderError';
  }
}

function copyProvider(provider: ProviderRecord): ProviderRecord {
  return {
    id: provider.id,
    kind: provider.kind,
    name: provider.name,
    createdAtMs: provider.createdAtMs,
    lastSuccessfulSyncAtMs: provider.lastSuccessfulSyncAtMs,
  };
}

export class MemoryProviderRepository implements ProviderRepository {
  private readonly providers = new Map<ProviderId, ProviderRecord>();
  private activeProviderId: ProviderId | null = null;

  async listProviders(): Promise<readonly ProviderRecord[]> {
    return Array.from(this.providers.values(), copyProvider);
  }

  async getProvider(providerId: ProviderId): Promise<ProviderRecord | null> {
    const provider = this.providers.get(providerId);
    return provider ? copyProvider(provider) : null;
  }

  async saveProvider(provider: ProviderRecord): Promise<void> {
    this.providers.set(provider.id, copyProvider(provider));
  }

  async removeProvider(providerId: ProviderId): Promise<void> {
    this.providers.delete(providerId);
    if (this.activeProviderId === providerId) this.activeProviderId = null;
  }

  async getActiveProviderId(): Promise<ProviderId | null> {
    return this.activeProviderId;
  }

  async setActiveProviderId(providerId: ProviderId | null): Promise<void> {
    if (providerId !== null && !this.providers.has(providerId)) {
      throw new UnknownProviderError(providerId);
    }
    this.activeProviderId = providerId;
  }
}
