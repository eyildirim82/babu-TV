import type { ProviderId, ProviderRecord } from '../domain/models.js';
import type { ProviderRepository } from './provider-repository.js';

export class UnknownProviderError extends Error {
  constructor(public readonly providerId: ProviderId) {
    super('Unknown provider.');
    this.name = 'UnknownProviderError';
  }
}

export class MemoryProviderRepository implements ProviderRepository {
  async listProviders(): Promise<readonly ProviderRecord[]> {
    return [];
  }

  async getProvider(_providerId: ProviderId): Promise<ProviderRecord | null> {
    return null;
  }

  async saveProvider(_provider: ProviderRecord): Promise<void> {}

  async removeProvider(_providerId: ProviderId): Promise<void> {}

  async getActiveProviderId(): Promise<ProviderId | null> {
    return null;
  }

  async setActiveProviderId(_providerId: ProviderId | null): Promise<void> {}
}
