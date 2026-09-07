import type { ProviderId } from '../domain/models.js';
import type { CredentialStore, ProviderCredential } from './contracts.js';

export interface KeyManagerLike {
  saveData(
    name: string,
    data: string,
    password: string | null,
    successCallback?: () => void,
    errorCallback?: (error: unknown) => void,
  ): void;
  getData(alias: string, password?: string | null): { rawData?: string } | null;
  removeData(alias: string): void;
}

export class CredentialStoreUnavailableError extends Error {
  constructor() {
    super('Secure credential storage is unavailable.');
    this.name = 'CredentialStoreUnavailableError';
  }
}

export class TizenKeyManagerCredentialStore implements CredentialStore {
  constructor(private readonly keyManager: KeyManagerLike | null) {}

  isAvailable(): boolean {
    return this.keyManager !== null;
  }

  async save(_providerId: ProviderId, _credential: ProviderCredential): Promise<void> {
    if (!this.keyManager) throw new CredentialStoreUnavailableError();
  }

  async load(_providerId: ProviderId): Promise<ProviderCredential | null> {
    if (!this.keyManager) throw new CredentialStoreUnavailableError();
    return null;
  }

  async remove(_providerId: ProviderId): Promise<void> {
    if (!this.keyManager) throw new CredentialStoreUnavailableError();
  }
}
