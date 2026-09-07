import type { ProviderId } from '../domain/models.js';
import type { CredentialStore, ProviderCredential } from './contracts.js';

export interface WidgetDataLike {
  read(
    successCallback: (data: string) => void,
    errorCallback?: (error: unknown) => void,
  ): void;
  write(
    data: string,
    successCallback?: () => void,
    errorCallback?: (error: unknown) => void,
  ): void;
  remove(
    successCallback?: () => void,
    errorCallback?: (error: unknown) => void,
  ): void;
}

export class CredentialStoreUnavailableError extends Error {
  constructor() {
    super('Secure credential storage is unavailable.');
    this.name = 'CredentialStoreUnavailableError';
  }
}

export class CredentialStoreOperationError extends Error {
  constructor(operation: 'save' | 'load' | 'remove') {
    super(`Secure credential ${operation} failed.`);
    this.name = 'CredentialStoreOperationError';
  }
}

export class CredentialStoreCapacityError extends Error {
  constructor() {
    super('Secure credential storage capacity was exceeded.');
    this.name = 'CredentialStoreCapacityError';
  }
}

export class SamsungWidgetDataCredentialStore implements CredentialStore {
  constructor(private readonly widgetData: WidgetDataLike | null) {}

  isAvailable(): boolean {
    return this.widgetData !== null;
  }

  async save(_providerId: ProviderId, _credential: ProviderCredential): Promise<void> {
    if (!this.widgetData) throw new CredentialStoreUnavailableError();
  }

  async load(_providerId: ProviderId): Promise<ProviderCredential | null> {
    if (!this.widgetData) throw new CredentialStoreUnavailableError();
    return null;
  }

  async remove(_providerId: ProviderId): Promise<void> {
    if (!this.widgetData) throw new CredentialStoreUnavailableError();
  }
}
