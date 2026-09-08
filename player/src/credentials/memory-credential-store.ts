import type { ProviderId } from '../domain/models.js';
import type { CredentialStore, ProviderCredential } from './contracts.js';

export class MemoryCredentialStore implements CredentialStore {
  private readonly credentials = new Map<ProviderId, ProviderCredential>();

  isAvailable(): boolean {
    return true;
  }

  async save(providerId: ProviderId, credential: ProviderCredential): Promise<void> {
    this.credentials.set(providerId, credential);
  }

  async load(providerId: ProviderId): Promise<ProviderCredential | null> {
    return this.credentials.get(providerId) ?? null;
  }

  async remove(providerId: ProviderId): Promise<void> {
    this.credentials.delete(providerId);
  }
}
