import type { ProviderId } from '../domain/models.js';
import type { CredentialStore, ProviderCredential } from './contracts.js';

export class MemoryCredentialStore implements CredentialStore {
  isAvailable(): boolean {
    return true;
  }

  async save(_providerId: ProviderId, _credential: ProviderCredential): Promise<void> {}

  async load(_providerId: ProviderId): Promise<ProviderCredential | null> {
    return null;
  }

  async remove(_providerId: ProviderId): Promise<void> {}
}
