import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderCredential } from '../src/credentials/contracts.js';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import type { Category, Channel, EpgProgram, ProviderKind, ProviderRecord } from '../src/domain/models.js';
import { parseXmltvPrograms } from '../src/epg/xmltv-parser.js';
import type { ProviderAdapter, ProviderAdapterFactory, ProviderProfile } from '../src/providers/contracts.js';
import { ProviderError, type ProviderErrorCode } from '../src/providers/errors.js';
import {
  FetchProviderHttpClient,
  type ProviderHttpTimers,
} from '../src/providers/http/fetch-provider-http-client.js';
import type { ProviderHttpClient } from '../src/providers/http/contracts.js';
import { M3uProvider } from '../src/providers/m3u/m3u-provider.js';
import { ProviderEpgService } from '../src/providers/provider-epg-service.js';
import {
  ProviderReentryService,
  type ProviderReentryInput,
} from '../src/providers/provider-reentry-service.js';
import { ProviderSyncService, type ProviderSyncReport } from '../src/providers/provider-sync-service.js';
import { XtreamProvider } from '../src/providers/xtream/xtream-provider.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';
import {
  MemoryEpgProgramRepository,
  MemoryFavoriteRepository,
  MemoryWatchStateRepository,
} from './support/v1-rc-memory-repositories.js';

const SECRET_URL = 'https://example.invalid/player_api.php?username=m7-user&password=m7-secret';

function provider(id: string, kind: ProviderKind = 'xtream'): ProviderRecord {
  return { id, kind, name: id, createdAtMs: 1, lastSuccessfulSyncAtMs: null };
}

function category(providerId: string, id: string): Category {
  return { providerId, id, name: id };
}

function channel(providerId: string, id: string): Channel {
  return { providerId, id, name: id, categoryId: null, logoUrl: null, number: null };
}

function profile(providerId: string, kind: ProviderKind = 'xtream'): ProviderProfile {
  return {
    providerId,
    kind,
    accountName: null,
    expiresAtMs: null,
    maxConnections: null,
  };
}

function successReport(providerId = 'provider-a'): ProviderSyncReport {
  return {
    providerId,
    profile: 'success',
    categories: { status: 'success', count: 1 },
    channels: { status: 'success', count: 1 },
    completedAtMs: 123,
  };
}

async function expectProviderError(
  promise: Promise<unknown>,
  code: ProviderErrorCode,
  status: number | null,
): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return error;
  }
  assert.fail(`Expected ProviderError(${code})`);
}

function assertNoSecrets(value: string): void {
  assert.equal(value.includes('m7-user'), false);
  assert.equal(value.includes('m7-secret'), false);
  assert.equal(value.includes(SECRET_URL), false);
}

class EmptyCatalogAdapter implements ProviderAdapter {
  readonly providerId = 'provider-a';
  readonly kind = 'xtream' as const;

  async getProfile(): Promise<ProviderProfile> {
    return profile(this.providerId);
  }

  async listCategories(): Promise<readonly Category[]> {
    return [category(this.providerId, 'new-category')];
  }

  async listChannels(): Promise<readonly Channel[]> {
    return [];
  }

  async resolveStream(): Promise<{ url: string }> {
    return { url: 'https://stream.example.invalid/channel.ts' };
  }
}

const emptyCatalogFactory: ProviderAdapterFactory = {
  create() {
    return new EmptyCatalogAdapter();
  },
};

for (const [status, code, message] of [
  [401, 'AUTH', 'Provider authentication failed.'],
  [403, 'AUTH', 'Provider authentication failed.'],
  [404, 'NOT_FOUND', 'Provider resource was not found.'],
  [500, 'SERVER', 'Provider server error.'],
] as const) {
  test(`M7 FAIL HTTP ${status} is classified and sanitized`, async () => {
    const client = new FetchProviderHttpClient(async () => new Response(
      `raw body ${SECRET_URL}`,
      { status },
    ));

    const error = await expectProviderError(client.getJson(SECRET_URL), code, status);

    assert.equal(error.message, message);
    assertNoSecrets(error.message);
  });
}

test('M7 FAIL transport rejection is NETWORK and hides native error text', async () => {
  const client = new FetchProviderHttpClient(async () => {
    throw new Error(`socket rejected ${SECRET_URL}`);
  });

  const error = await expectProviderError(client.getText(SECRET_URL), 'NETWORK', null);

  assert.equal(error.message, 'Provider network request failed.');
  assertNoSecrets(error.message);
});

test('M7 FAIL offline network loss is NETWORK and hides native error text', async () => {
  const client = new FetchProviderHttpClient(async () => {
    throw new TypeError(`Failed to fetch while offline: ${SECRET_URL}`);
  });

  const error = await expectProviderError(client.getText(SECRET_URL), 'NETWORK', null);

  assert.equal(error.message, 'Provider network request failed.');
  assertNoSecrets(error.message);
});

test('M7 FAIL timeout is deterministic TIMEOUT and hides request secrets', async () => {
  const timers: ProviderHttpTimers = {
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
  };
  const fetchImpl: typeof fetch = async (_input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException(`aborted ${SECRET_URL}`, 'AbortError');
    }
    throw new Error('injected timeout did not abort');
  };
  const client = new FetchProviderHttpClient(fetchImpl, timers);

  const error = await expectProviderError(client.getJson(SECRET_URL, 10), 'TIMEOUT', null);

  assert.equal(error.message, 'Provider request timed out.');
  assertNoSecrets(error.message);
});

test('M7 FAIL malformed Xtream response is MALFORMED without payload or credential leakage', async () => {
  const http: ProviderHttpClient = {
    async getJson<T>() {
      return { malformed: SECRET_URL } as unknown as T;
    },
    async getText() {
      throw new Error('not used');
    },
  };
  const adapter = new XtreamProvider('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.invalid',
    username: 'm7-user',
    password: 'm7-secret',
  }, http);

  const error = await expectProviderError(adapter.listChannels(), 'MALFORMED', null);

  assertNoSecrets(error.message);
});

test('M7 FAIL malformed M3U is MALFORMED without playlist content leakage', async () => {
  const http: ProviderHttpClient = {
    async getJson<T>() {
      throw new Error('not used') as never;
    },
    async getText() {
      return `not-an-m3u ${SECRET_URL}`;
    },
  };
  const adapter = new M3uProvider('provider-a', {
    kind: 'm3u',
    playlistUrl: 'https://example.invalid/list.m3u?token=m7-secret',
  }, http);

  const error = await expectProviderError(adapter.listChannels(), 'MALFORMED', null);

  assert.equal(error.message, 'Provider playlist was malformed.');
  assertNoSecrets(error.message);
});

test('M7 FAIL malformed XMLTV rows are ignored without producing corrupt programs', () => {
  const malformed = `
    <tv>
      <programme channel="channel-a" start="m7-secret" stop="20260912170000 +0300">
        <title>Secret ${SECRET_URL}</title>
      </programme>
      <programme channel="" start="20260912160000 +0300" stop="20260912170000 +0300">
        <title>Missing channel</title>
      </programme>
    </tv>
  `;

  assert.deepEqual(parseXmltvPrograms(malformed), []);
});

test('M7 FAIL empty provider catalog preserves usable channel cache and does not advance sync', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();

  await providers.saveProvider(provider('provider-a'));
  await providers.setActiveProviderId('provider-a');
  await catalog.replaceCategories('provider-a', [category('provider-a', 'old-category')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'cached-channel')]);
  await credentials.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.invalid',
    username: 'm7-user',
    password: 'm7-secret',
  });

  const service = new ProviderSyncService(
    providers,
    catalog,
    credentials,
    emptyCatalogFactory,
    () => 123_456,
  );

  const report = await service.refresh('provider-a');

  assert.deepEqual(report.channels, { status: 'failed', code: 'MALFORMED' });
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.id), [
    'cached-channel',
  ]);
  assert.equal((await providers.getProvider('provider-a'))?.lastSuccessfulSyncAtMs, null);
  assert.equal(await providers.getActiveProviderId(), 'provider-a');
});

test('M7 FAIL provider sync failure preserves stale catalog activation favorites and watch state', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();
  const favorites = new MemoryFavoriteRepository();
  const watch = new MemoryWatchStateRepository();

  await providers.saveProvider(provider('provider-a'));
  await providers.setActiveProviderId('provider-a');
  await catalog.replaceCategories('provider-a', [category('provider-a', 'cached-category')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'cached-channel')]);
  await credentials.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.invalid',
    username: 'm7-user',
    password: 'm7-secret',
  });
  await favorites.put({ providerId: 'provider-a', channelId: 'cached-channel', addedAtMs: 10 });
  await watch.setLastWatched({ providerId: 'provider-a', channelId: 'cached-channel', lastPlayedAtMs: 20 });
  await watch.putAggregate({
    providerId: 'provider-a',
    channelId: 'cached-channel',
    meaningfulWatchMs: 30,
    meaningfulOpenCount: 2,
    lastMeaningfulWatchAtMs: 40,
  });

  const failingFactory: ProviderAdapterFactory = {
    create(record) {
      return {
        providerId: record.id,
        kind: record.kind,
        async getProfile() {
          return profile(record.id, record.kind);
        },
        async listCategories() {
          throw new ProviderError('NETWORK', null, `category failure ${SECRET_URL}`);
        },
        async listChannels() {
          throw new ProviderError('NETWORK', null, `channel failure ${SECRET_URL}`);
        },
        async resolveStream() {
          throw new Error('not used');
        },
      };
    },
  };
  const service = new ProviderSyncService(providers, catalog, credentials, failingFactory, () => 999);

  const report = await service.refresh('provider-a');

  assert.equal(report.providerId, 'provider-a');
  assert.deepEqual(report.categories, { status: 'failed', code: 'NETWORK' });
  assert.deepEqual(report.channels, { status: 'failed', code: 'NETWORK' });
  assert.deepEqual((await catalog.listCategories('provider-a')).map((item) => item.id), ['cached-category']);
  assert.deepEqual((await catalog.listChannels('provider-a')).map((item) => item.id), ['cached-channel']);
  assert.equal(await providers.getActiveProviderId(), 'provider-a');
  assert.equal((await providers.getProvider('provider-a'))?.lastSuccessfulSyncAtMs, null);
  assert.deepEqual(await favorites.list('provider-a'), [
    { providerId: 'provider-a', channelId: 'cached-channel', addedAtMs: 10 },
  ]);
  assert.deepEqual(await watch.getLastWatched('provider-a'), {
    providerId: 'provider-a',
    channelId: 'cached-channel',
    lastPlayedAtMs: 20,
  });
  assert.deepEqual(await watch.getAggregate('provider-a', 'cached-channel'), {
    providerId: 'provider-a',
    channelId: 'cached-channel',
    meaningfulWatchMs: 30,
    meaningfulOpenCount: 2,
    lastMeaningfulWatchAtMs: 40,
  });
  assertNoSecrets(JSON.stringify(report));
});

test('M7 FAIL background EPG refresh failure preserves stale usable programs', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();
  const repository = new MemoryEpgProgramRepository();
  const window = { startMs: 1_000, endMs: 5_000 };
  const cachedProgram: EpgProgram = {
    channelId: 'cached-channel',
    startMs: 2_000,
    endMs: 4_000,
    title: 'Cached program',
    description: 'usable stale data',
  };

  await providers.saveProvider(provider('provider-a'));
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'cached-channel')]);
  await credentials.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.invalid',
    username: 'm7-user',
    password: 'm7-secret',
  });
  await repository.replaceWindow('provider-a', window, [cachedProgram]);

  const epgFactory: ProviderAdapterFactory = {
    create(record) {
      return {
        providerId: record.id,
        kind: record.kind,
        epg: {
          describeChannels(channels) {
            return channels.map((item) => ({
              providerId: item.providerId,
              channelId: item.id,
              name: item.name,
              epgIds: [item.id],
            }));
          },
          createSource() {
            return {
              providerId: record.id,
              async listPrograms() {
                throw new ProviderError('NETWORK', null, `EPG failed ${SECRET_URL}`);
              },
            };
          },
        },
        async getProfile() {
          return profile(record.id, record.kind);
        },
        async listCategories() {
          return [];
        },
        async listChannels() {
          return [];
        },
        async resolveStream() {
          throw new Error('not used');
        },
      };
    },
  };
  const service = new ProviderEpgService({
    providers,
    catalog,
    credentials,
    adapters: epgFactory,
    repository,
  });

  const result = await service.refreshInBackground('provider-a', window);

  assert.deepEqual(result, { providerId: 'provider-a', status: 'failed', code: 'NETWORK' });
  assert.deepEqual(await repository.listPrograms('provider-a', 'cached-channel', window), [cachedProgram]);
  assertNoSecrets(JSON.stringify(result));
});

const reentryInput: ProviderReentryInput = {
  providerId: 'provider-a',
  kind: 'xtream',
  serverUrl: ' https://new.example.invalid ',
  username: ' m7-user ',
  password: ' m7-secret ',
};

function createReentryHarness(options: {
  credentialAvailable?: boolean;
  preflightError?: unknown;
  refreshError?: unknown;
} = {}) {
  const existingProvider = provider('provider-a');
  let storedCredential: ProviderCredential | null = {
    kind: 'xtream',
    serverUrl: 'https://old.example.invalid',
    username: 'old-user',
    password: 'old-secret',
  };
  let loadCalls = 0;
  let saveCalls = 0;
  let removeCalls = 0;
  let adapterCreates = 0;
  let refreshCalls = 0;

  const service = new ProviderReentryService({
    providers: {
      async getProvider() {
        return existingProvider;
      },
    },
    credentials: {
      isAvailable() {
        return options.credentialAvailable !== false;
      },
      async load() {
        loadCalls += 1;
        return storedCredential;
      },
      async save(_providerId, credential) {
        saveCalls += 1;
        storedCredential = credential;
      },
      async remove() {
        removeCalls += 1;
        storedCredential = null;
      },
    },
    adapters: {
      create(record, credential) {
        adapterCreates += 1;
        return {
          providerId: record.id,
          kind: credential.kind,
          async getProfile() {
            if (options.preflightError) throw options.preflightError;
            return profile(record.id, credential.kind);
          },
          async listCategories() {
            return [];
          },
          async listChannels() {
            return [channel(record.id, 'channel-a')];
          },
          async resolveStream() {
            throw new Error('not used');
          },
        };
      },
    },
    sync: {
      async refresh(providerId) {
        refreshCalls += 1;
        if (options.refreshError) throw options.refreshError;
        return successReport(providerId);
      },
    },
  });

  return {
    service,
    get storedCredential() {
      return storedCredential;
    },
    get loadCalls() {
      return loadCalls;
    },
    get saveCalls() {
      return saveCalls;
    },
    get removeCalls() {
      return removeCalls;
    },
    get adapterCreates() {
      return adapterCreates;
    },
    get refreshCalls() {
      return refreshCalls;
    },
  };
}

test('M7 FAIL credential-store unavailable blocks re-entry before preflight or writes', async () => {
  const fixture = createReentryHarness({ credentialAvailable: false });

  const error = await expectProviderError(fixture.service.reenter(reentryInput), 'UNAVAILABLE', null);

  assert.equal(fixture.loadCalls, 0);
  assert.equal(fixture.adapterCreates, 0);
  assert.equal(fixture.saveCalls, 0);
  assert.equal(fixture.removeCalls, 0);
  assert.equal(fixture.refreshCalls, 0);
  assertNoSecrets(error.message);
});

test('M7 FAIL provider re-entry preflight failure performs zero credential writes and is sanitized', async () => {
  const fixture = createReentryHarness({
    preflightError: new ProviderError('NETWORK', null, `preflight leaked ${SECRET_URL}`),
  });

  const error = await expectProviderError(fixture.service.reenter(reentryInput), 'NETWORK', null);

  assert.equal(fixture.loadCalls, 1);
  assert.equal(fixture.adapterCreates, 1);
  assert.equal(fixture.saveCalls, 0);
  assert.equal(fixture.removeCalls, 0);
  assert.equal(fixture.refreshCalls, 0);
  assert.equal(error.message, 'Provider credentials could not be validated.');
  assertNoSecrets(error.message);
});

test('M7 FAIL provider re-entry post-credential refresh failure keeps committed credential and reports degraded', async () => {
  const fixture = createReentryHarness({
    refreshError: new Error(`refresh failed ${SECRET_URL}`),
  });

  const result = await fixture.service.reenter(reentryInput);

  assert.deepEqual(result, { providerId: 'provider-a', kind: 'xtream', refresh: 'degraded' });
  assert.deepEqual(fixture.storedCredential, {
    kind: 'xtream',
    serverUrl: 'https://new.example.invalid',
    username: 'm7-user',
    password: 'm7-secret',
  });
  assert.equal(fixture.saveCalls, 1);
  assert.equal(fixture.removeCalls, 0);
  assert.equal(fixture.refreshCalls, 1);
  assert.equal(result.providerId, 'provider-a');
});
