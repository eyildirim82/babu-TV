import type { ProviderId } from '../domain/models.js';
import type { CredentialStore, ProviderCredential } from './contracts.js';

const ALIAS_PREFIX = 'babustv.provider.';

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

export class CredentialStoreOperationError extends Error {
  constructor(operation: 'save' | 'load' | 'remove') {
    super(`Secure credential ${operation} failed.`);
    this.name = 'CredentialStoreOperationError';
  }
}

function aliasFor(providerId: ProviderId): string {
  return `${ALIAS_PREFIX}${providerId}`;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return candidate.name === 'NotFoundError' || candidate.message === 'NotFoundError';
}

function parseCredential(rawData: string): ProviderCredential {
  let value: unknown;
  try {
    value = JSON.parse(rawData);
  } catch {
    throw new CredentialStoreOperationError('load');
  }

  if (!value || typeof value !== 'object') {
    throw new CredentialStoreOperationError('load');
  }

  const record = value as Record<string, unknown>;
  if (
    record.kind === 'xtream'
    && typeof record.serverUrl === 'string'
    && typeof record.username === 'string'
    && typeof record.password === 'string'
  ) {
    return {
      kind: 'xtream',
      serverUrl: record.serverUrl,
      username: record.username,
      password: record.password,
    };
  }

  if (record.kind === 'm3u' && typeof record.playlistUrl === 'string') {
    return {
      kind: 'm3u',
      playlistUrl: record.playlistUrl,
    };
  }

  throw new CredentialStoreOperationError('load');
}

export class TizenKeyManagerCredentialStore implements CredentialStore {
  constructor(private readonly keyManager: KeyManagerLike | null) {}

  isAvailable(): boolean {
    return this.keyManager !== null;
  }

  private requireKeyManager(): KeyManagerLike {
    if (!this.keyManager) throw new CredentialStoreUnavailableError();
    return this.keyManager;
  }

  async save(providerId: ProviderId, credential: ProviderCredential): Promise<void> {
    const keyManager = this.requireKeyManager();
    const alias = aliasFor(providerId);

    try {
      keyManager.removeData(alias);
    } catch (error) {
      if (!isNotFoundError(error)) throw new CredentialStoreOperationError('save');
    }

    const serialized = JSON.stringify(credential);
    await new Promise<void>((resolve, reject) => {
      try {
        keyManager.saveData(
          alias,
          serialized,
          null,
          resolve,
          () => reject(new CredentialStoreOperationError('save')),
        );
      } catch {
        reject(new CredentialStoreOperationError('save'));
      }
    });
  }

  async load(providerId: ProviderId): Promise<ProviderCredential | null> {
    const keyManager = this.requireKeyManager();
    let data: { rawData?: string } | null;

    try {
      data = keyManager.getData(aliasFor(providerId), null);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw new CredentialStoreOperationError('load');
    }

    if (!data) return null;
    if (typeof data.rawData !== 'string') throw new CredentialStoreOperationError('load');
    return parseCredential(data.rawData);
  }

  async remove(providerId: ProviderId): Promise<void> {
    const keyManager = this.requireKeyManager();
    try {
      keyManager.removeData(aliasFor(providerId));
    } catch (error) {
      if (!isNotFoundError(error)) throw new CredentialStoreOperationError('remove');
    }
  }
}
