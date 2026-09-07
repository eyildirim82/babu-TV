import type { ProviderId } from '../domain/models.js';
import type { CredentialStore, ProviderCredential } from './contracts.js';

const WIDGET_DATA_CHARACTER_LIMIT = 20_000;

type CredentialDocument = Record<string, ProviderCredential>;
type CredentialOperation = 'save' | 'load' | 'remove';

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
  constructor(operation: CredentialOperation) {
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

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return candidate.name === 'NotFoundError' || candidate.message === 'NotFoundError';
}

function parseCredential(value: unknown, operation: CredentialOperation): ProviderCredential {
  if (!value || typeof value !== 'object') {
    throw new CredentialStoreOperationError(operation);
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

  throw new CredentialStoreOperationError(operation);
}

function parseDocument(rawData: string, operation: CredentialOperation): CredentialDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    throw new CredentialStoreOperationError(operation);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CredentialStoreOperationError(operation);
  }

  const document: CredentialDocument = Object.create(null) as CredentialDocument;
  for (const [providerId, value] of Object.entries(parsed as Record<string, unknown>)) {
    document[providerId] = parseCredential(value, operation);
  }
  return document;
}

function serializeDocument(document: CredentialDocument): string {
  const serialized = JSON.stringify(document);
  if (serialized.length > WIDGET_DATA_CHARACTER_LIMIT) {
    throw new CredentialStoreCapacityError();
  }
  return serialized;
}

export class SamsungWidgetDataCredentialStore implements CredentialStore {
  constructor(private readonly widgetData: WidgetDataLike | null) {}

  isAvailable(): boolean {
    return this.widgetData !== null;
  }

  private requireWidgetData(): WidgetDataLike {
    if (!this.widgetData) throw new CredentialStoreUnavailableError();
    return this.widgetData;
  }

  private async readDocument(operation: CredentialOperation): Promise<CredentialDocument> {
    const widgetData = this.requireWidgetData();
    const rawData = await new Promise<string | null>((resolve, reject) => {
      try {
        widgetData.read(
          (data) => resolve(data),
          (error) => {
            if (isNotFoundError(error)) resolve(null);
            else reject(new CredentialStoreOperationError(operation));
          },
        );
      } catch {
        reject(new CredentialStoreOperationError(operation));
      }
    });

    if (rawData === null) return Object.create(null) as CredentialDocument;
    return parseDocument(rawData, operation);
  }

  private async writeDocument(document: CredentialDocument, operation: CredentialOperation): Promise<void> {
    const widgetData = this.requireWidgetData();
    const serialized = serializeDocument(document);

    await new Promise<void>((resolve, reject) => {
      try {
        widgetData.write(
          serialized,
          resolve,
          () => reject(new CredentialStoreOperationError(operation)),
        );
      } catch {
        reject(new CredentialStoreOperationError(operation));
      }
    });
  }

  async save(providerId: ProviderId, credential: ProviderCredential): Promise<void> {
    const document = await this.readDocument('save');
    document[providerId] = credential;
    await this.writeDocument(document, 'save');
  }

  async load(providerId: ProviderId): Promise<ProviderCredential | null> {
    const document = await this.readDocument('load');
    return document[providerId] ?? null;
  }

  async remove(providerId: ProviderId): Promise<void> {
    const widgetData = this.requireWidgetData();
    const document = await this.readDocument('remove');
    if (!Object.prototype.hasOwnProperty.call(document, providerId)) return;

    delete document[providerId];
    if (Object.keys(document).length > 0) {
      await this.writeDocument(document, 'remove');
      return;
    }

    await new Promise<void>((resolve, reject) => {
      try {
        widgetData.remove(
          resolve,
          (error) => {
            if (isNotFoundError(error)) resolve();
            else reject(new CredentialStoreOperationError('remove'));
          },
        );
      } catch {
        reject(new CredentialStoreOperationError('remove'));
      }
    });
  }
}
