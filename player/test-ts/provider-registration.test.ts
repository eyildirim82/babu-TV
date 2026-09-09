import test from 'node:test';
import assert from 'node:assert/strict';
import type { CredentialStore, ProviderCredential } from '../src/credentials/contracts.js';
import type { Category, Channel, ProviderId, ProviderRecord } from '../src/domain/models.js';
import type { StreamRequest } from '../src/playback/contracts.js';
import type { ProviderAdapter, ProviderAdapterFactory, ProviderProfile } from '../src/providers/contracts.js';
import { ProviderCoreService, type ProviderSyncPort } from '../src/providers/provider-core-service.js';
import { ProviderError } from '../src/providers/errors.js';
import type { CatalogRepository } from '../src/repository/catalog-repository.js';
import type { ProviderRepository } from '../src/repository/provider-repository.js';

type RegistrationPort = {
  registerProvider(provider: ProviderRecord, credential: ProviderCredential): Promise<ProviderProfile>;
};

const RegistrationService = ProviderCoreService as unknown as new (
  providers: ProviderRepository,
  catalog: CatalogRepository,
  credentials: CredentialStore,
  sync: ProviderSyncPort,
  adapters: ProviderAdapterFactory,
) => ProviderCoreService & RegistrationPort;

const xtreamProvider: ProviderRecord = {
  id: 'provider-x',
  kind: 'xtream',
  name: 'Xtream Demo',
  createdAtMs: 10,
  lastSuccessfulSyncAtMs: null,
};

const xtreamCredential: ProviderCredential = {
  kind: 'xtream',
  serverUrl: 'https://example.com',
  username: 'demo-user',
  password: 'demo-pass',
};

const profile: ProviderProfile = {
  providerId: 'provider-x',
  kind: 'xtream',
  accountName: 'Demo Account',
  expiresAtMs: null,
  maxConnections: 2,
};

class TestProviderRepository implements ProviderRepository {
  readonly records = new Map<ProviderId, ProviderRecord>();
  activeId: ProviderId | null = null;
  failSave = false;

  async listProviders(): Promise<readonly ProviderRecord[]> { return [...this.records.values()]; }
  async getProvider(providerId: ProviderId): Promise<ProviderRecord | null> { return this.records.get(providerId) ?? null; }
  async saveProvider(provider: ProviderRecord): Promise<void> {
    if (this.failSave) throw new Error('raw provider persistence failure: demo-pass');
    this.records.set(provider.id, provider);
  }
  async removeProvider(providerId: ProviderId): Promise<void> {
    this.records.delete(providerId);
    if (this.activeId === providerId) this.activeId = null;
  }
  async getActiveProviderId(): Promise<ProviderId | null> { return this.activeId; }
  async setActiveProviderId(providerId: ProviderId | null): Promise<void> { this.activeId = providerId; }
}

class TestCredentialStore implements CredentialStore {
  readonly records = new Map<ProviderId, ProviderCredential>();
  failSave = false;
  removeCalls: ProviderId[] = [];

  isAvailable(): boolean { return true; }
  async save(providerId: ProviderId, credential: ProviderCredential): Promise<void> {
    if (this.failSave) throw new Error('raw credential persistence failure: demo-pass');
    this.records.set(providerId, credential);
  }
  async load(providerId: ProviderId): Promise<ProviderCredential | null> { return this.records.get(providerId) ?? null; }
  async remove(providerId: ProviderId): Promise<void> {
    this.removeCalls.push(providerId);
    this.records.delete(providerId);
  }
}

class TestCatalogRepository implements CatalogRepository {
  async replaceCategories(): Promise<void> {}
  async listCategories(): Promise<readonly Category[]> { return []; }
  async replaceChannels(): Promise<void> {}
  async listChannels(): Promise<readonly Channel[]> { return []; }
  async getChannel(): Promise<Channel | null> { return null; }
  async removeProviderCatalog(): Promise<void> {}
}

class TestSync implements ProviderSyncPort {
  readonly calls: ProviderId[] = [];
  async refresh(providerId: ProviderId) {
    this.calls.push(providerId);
    return {
      providerId,
      profile: 'success' as const,
      categories: { status: 'success' as const, count: 0 },
      channels: { status: 'success' as const, count: 0 },
      completedAtMs: 1,
    };
  }
}

class TestAdapter implements ProviderAdapter {
  readonly kind = 'xtream' as const;
  constructor(
    public readonly providerId: ProviderId,
    private readonly profileResult: ProviderProfile | Error,
    private readonly beforeValidate: () => void,
  ) {}

  async getProfile(): Promise<ProviderProfile> {
    this.beforeValidate();
    if (this.profileResult instanceof Error) throw this.profileResult;
    return this.profileResult;
  }
  async listCategories(): Promise<readonly Category[]> { return []; }
  async listChannels(): Promise<readonly Channel[]> { return []; }
  async resolveStream(): Promise<StreamRequest> { return { url: 'https://example.invalid/live.ts' }; }
}

class TestAdapterFactory implements ProviderAdapterFactory {
  createCalls = 0;
  constructor(private readonly createAdapter: () => ProviderAdapter) {}
  create(): ProviderAdapter {
    this.createCalls += 1;
    return this.createAdapter();
  }
}

function setup(profileResult: ProviderProfile | Error = profile) {
  const providers = new TestProviderRepository();
  const credentials = new TestCredentialStore();
  const catalog = new TestCatalogRepository();
  const sync = new TestSync();
  const adapters = new TestAdapterFactory(() => new TestAdapter('provider-x', profileResult, () => {
    assert.equal(providers.records.size, 0, 'metadata must not persist before validation');
    assert.equal(credentials.records.size, 0, 'credential must not persist before validation');
  }));
  const service = new RegistrationService(providers, catalog, credentials, sync, adapters);
  return { service, providers, credentials, sync, adapters };
}

function assertSanitizedUnavailable(error: unknown): boolean {
  assert.ok(error instanceof ProviderError);
  assert.equal(error.code, 'UNAVAILABLE');
  assert.equal(error.message.includes('demo-pass'), false);
  return true;
}

void test('registerProvider validates first, persists credential and metadata, returns profile, and does not activate or sync', async () => {
  const { service, providers, credentials, sync, adapters } = setup();

  assert.deepEqual(await service.registerProvider(xtreamProvider, xtreamCredential), profile);
  assert.deepEqual(await providers.getProvider('provider-x'), xtreamProvider);
  assert.deepEqual(await credentials.load('provider-x'), xtreamCredential);
  assert.equal(await providers.getActiveProviderId(), null);
  assert.deepEqual(sync.calls, []);
  assert.equal(adapters.createCalls, 1);
});

void test('registerProvider rejects duplicate provider id before validation or persistence', async () => {
  const { service, providers, credentials, adapters } = setup();
  await providers.saveProvider(xtreamProvider);

  await assert.rejects(service.registerProvider(xtreamProvider, xtreamCredential), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'MALFORMED');
    return true;
  });
  assert.equal(adapters.createCalls, 0);
  assert.equal(await credentials.load('provider-x'), null);
});

void test('registerProvider rejects provider/credential kind mismatch before validation or persistence', async () => {
  const { service, providers, credentials, adapters } = setup();
  const mismatched: ProviderCredential = { kind: 'm3u', playlistUrl: 'https://example.com/list.m3u' };

  await assert.rejects(service.registerProvider(xtreamProvider, mismatched), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, 'MALFORMED');
    return true;
  });
  assert.equal(adapters.createCalls, 0);
  assert.equal(await providers.getProvider('provider-x'), null);
  assert.equal(await credentials.load('provider-x'), null);
});

void test('registerProvider leaves no credential or metadata when provider validation fails', async () => {
  const validationError = new ProviderError('AUTH', 401, 'Provider authentication failed.');
  const { service, providers, credentials } = setup(validationError);

  await assert.rejects(service.registerProvider(xtreamProvider, xtreamCredential), validationError);
  assert.equal(await providers.getProvider('provider-x'), null);
  assert.equal(await credentials.load('provider-x'), null);
});

void test('registerProvider leaves no metadata when credential persistence fails and sanitizes the storage error', async () => {
  const { service, providers, credentials } = setup();
  credentials.failSave = true;

  await assert.rejects(service.registerProvider(xtreamProvider, xtreamCredential), assertSanitizedUnavailable);
  assert.equal(await providers.getProvider('provider-x'), null);
  assert.equal(await credentials.load('provider-x'), null);
});

void test('registerProvider rolls back a just-written credential when metadata persistence fails', async () => {
  const { service, providers, credentials } = setup();
  providers.failSave = true;

  await assert.rejects(service.registerProvider(xtreamProvider, xtreamCredential), assertSanitizedUnavailable);
  assert.equal(await providers.getProvider('provider-x'), null);
  assert.equal(await credentials.load('provider-x'), null);
  assert.deepEqual(credentials.removeCalls, ['provider-x']);
});
