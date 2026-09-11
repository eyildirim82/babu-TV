import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderCredential } from '../src/credentials/contracts.js';
import type { Channel, ProviderId, ProviderKind, ProviderRecord } from '../src/domain/models.js';
import type { ProviderProfile } from '../src/providers/contracts.js';
import { ProviderError } from '../src/providers/errors.js';
import type { ProviderSyncReport } from '../src/providers/provider-sync-service.js';
import {
  ProviderReentryService,
  type ProviderReentryInput,
} from '../src/providers/provider-reentry-service.js';

const previousXtream: ProviderCredential = {
  kind: 'xtream',
  serverUrl: 'https://old.example.invalid',
  username: 'old-user',
  password: 'old-password',
};

const xtreamInput: ProviderReentryInput = {
  providerId: 'provider-a',
  kind: 'xtream',
  serverUrl: ' https://new.example.invalid ',
  username: ' new-user ',
  password: ' new-password ',
};

const m3uInput: ProviderReentryInput = {
  providerId: 'provider-a',
  kind: 'm3u',
  playlistUrl: ' https://playlist.example.invalid/list.m3u?token=secret#fragment ',
};

function provider(kind: ProviderKind = 'xtream'): ProviderRecord {
  return {
    id: 'provider-a',
    kind,
    name: kind === 'xtream' ? 'Salon' : 'M3U',
    createdAtMs: 10,
    lastSuccessfulSyncAtMs: 20,
  };
}

function channel(kind: ProviderKind = 'xtream'): Channel {
  return {
    providerId: 'provider-a',
    id: kind === 'xtream' ? 'channel-x' : 'channel-m',
    name: kind === 'xtream' ? 'News' : 'Playlist News',
    categoryId: null,
    logoUrl: null,
    number: 1,
  };
}

function successReport(overrides: Partial<ProviderSyncReport> = {}): ProviderSyncReport {
  return {
    providerId: 'provider-a',
    profile: 'success',
    categories: { status: 'success', count: 1 },
    channels: { status: 'success', count: 1 },
    completedAtMs: 100,
    ...overrides,
  };
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createHarness(options: {
  provider?: ProviderRecord | null;
  previousCredential?: ProviderCredential | null;
  profile?: ProviderProfile;
  profileError?: unknown;
  channels?: readonly Channel[];
  channelError?: unknown;
  refreshReport?: ProviderSyncReport;
  refreshError?: unknown;
  failCandidateSave?: boolean;
  failCompensation?: boolean;
  holdChannels?: { entered: () => void; wait: Promise<void> };
} = {}) {
  const existingProvider = options.provider === undefined ? provider() : options.provider;
  let storedCredential = options.previousCredential === undefined
    ? previousXtream
    : options.previousCredential;
  const events: string[] = [];
  const saveCalls: ProviderCredential[] = [];
  let removeCalls = 0;
  let adapterCreates = 0;
  let refreshCalls = 0;

  const deps = {
    providers: {
      async getProvider(providerId: ProviderId) {
        events.push(`provider:get:${providerId}`);
        return existingProvider;
      },
    },
    credentials: {
      async load(providerId: ProviderId) {
        events.push(`credential:load:${providerId}`);
        return storedCredential;
      },
      async save(providerId: ProviderId, credential: ProviderCredential) {
        events.push(`credential:save:${providerId}:${credential.kind}`);
        saveCalls.push(credential);
        storedCredential = credential;
        if (options.failCandidateSave && saveCalls.length === 1) {
          throw new Error('candidate save leaked https://new.example.invalid?password=new-password');
        }
        if (options.failCompensation && saveCalls.length > 1) {
          throw new Error('restore leaked old-password');
        }
      },
      async remove(providerId: ProviderId) {
        events.push(`credential:remove:${providerId}`);
        removeCalls += 1;
        storedCredential = null;
        if (options.failCompensation) {
          throw new Error('cleanup leaked https://playlist.example.invalid?token=secret');
        }
      },
    },
    adapters: {
      create(record: ProviderRecord, credential: ProviderCredential) {
        adapterCreates += 1;
        events.push(`adapter:create:${record.id}:${credential.kind}`);
        return {
          providerId: record.id,
          kind: credential.kind,
          async getProfile() {
            events.push('adapter:profile');
            if (options.profileError) throw options.profileError;
            return options.profile ?? {
              providerId: record.id,
              kind: credential.kind,
              accountName: null,
              expiresAtMs: null,
              maxConnections: null,
            };
          },
          async listCategories() {
            return [];
          },
          async listChannels() {
            events.push('adapter:channels');
            options.holdChannels?.entered();
            if (options.holdChannels) await options.holdChannels.wait;
            if (options.channelError) throw options.channelError;
            return options.channels ?? [channel(record.kind)];
          },
          async resolveStream() {
            throw new Error('not used');
          },
        };
      },
    },
    sync: {
      async refresh(providerId: ProviderId) {
        events.push(`sync:${providerId}`);
        refreshCalls += 1;
        if (options.refreshError) throw options.refreshError;
        return options.refreshReport ?? successReport();
      },
    },
  };

  return {
    service: new ProviderReentryService(deps),
    events,
    saveCalls,
    get storedCredential() {
      return storedCredential;
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

async function rejection(
  promise: Promise<unknown>,
  code: ProviderError['code'],
): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ${code} rejection`);
}

test('provider re-entry preserves provider identity and commits Xtream only after profile plus channel preflight', async () => {
  const fixture = createHarness();

  const result = await fixture.service.reenter(xtreamInput);

  assert.deepEqual(result, {
    providerId: 'provider-a',
    kind: 'xtream',
    refresh: 'completed',
  });
  assert.deepEqual(fixture.saveCalls, [{
    kind: 'xtream',
    serverUrl: 'https://new.example.invalid',
    username: 'new-user',
    password: 'new-password',
  }]);
  assert.deepEqual(fixture.events, [
    'provider:get:provider-a',
    'adapter:create:provider-a:xtream',
    'adapter:profile',
    'adapter:channels',
    'credential:load:provider-a',
    'credential:save:provider-a:xtream',
    'sync:provider-a',
  ]);
  assert.equal(fixture.events.some((event) => /delete|removeProvider|register|addProvider/i.test(event)), false);
});

test('provider re-entry rejects provider kind conversion before network or credential writes', async () => {
  const fixture = createHarness({ provider: provider('xtream') });

  const error = await rejection(fixture.service.reenter(m3uInput), 'MALFORMED');

  assert.equal(fixture.adapterCreates, 0);
  assert.equal(fixture.saveCalls.length, 0);
  assert.equal(fixture.removeCalls, 0);
  assert.equal(fixture.refreshCalls, 0);
  assert.deepEqual(fixture.events, ['provider:get:provider-a']);
  assert.equal(error.message.includes('playlist.example.invalid'), false);
});

test('provider re-entry Xtream preflight failures perform zero writes and sanitize raw network errors', async () => {
  const profileFixture = createHarness({
    profileError: new Error('401 https://new.example.invalid/player_api.php?username=new-user&password=new-password'),
  });
  const profileError = await rejection(profileFixture.service.reenter(xtreamInput), 'UNAVAILABLE');
  assert.equal(profileFixture.saveCalls.length, 0);
  assert.equal(profileFixture.removeCalls, 0);
  assert.equal(profileFixture.refreshCalls, 0);
  assert.equal(profileError.message.includes('new-password'), false);
  assert.equal(profileError.message.includes('new.example.invalid'), false);

  const channelFixture = createHarness({
    channelError: new ProviderError('NETWORK', null, 'raw https://new.example.invalid?password=new-password'),
  });
  const channelError = await rejection(channelFixture.service.reenter(xtreamInput), 'NETWORK');
  assert.equal(channelFixture.saveCalls.length, 0);
  assert.equal(channelFixture.removeCalls, 0);
  assert.equal(channelFixture.refreshCalls, 0);
  assert.equal(channelError.message.includes('new-password'), false);
  assert.equal(channelError.message.includes('new.example.invalid'), false);
});

test('provider re-entry rejects mismatched Xtream profile identity before writes', async () => {
  const fixture = createHarness({
    profile: {
      providerId: 'other-provider',
      kind: 'xtream',
      accountName: null,
      expiresAtMs: null,
      maxConnections: null,
    },
  });

  await rejection(fixture.service.reenter(xtreamInput), 'MALFORMED');
  assert.equal(fixture.saveCalls.length, 0);
  assert.equal(fixture.refreshCalls, 0);
});

test('provider re-entry reuses M3U validation and rejects invalid or zero-channel candidates without writes', async () => {
  const invalidFixture = createHarness({ provider: provider('m3u'), previousCredential: null });
  const invalidError = await rejection(invalidFixture.service.reenter({
    providerId: 'provider-a',
    kind: 'm3u',
    playlistUrl: 'file:///tmp/secret-list.m3u',
  }), 'MALFORMED');
  assert.equal(invalidFixture.adapterCreates, 0);
  assert.equal(invalidFixture.saveCalls.length, 0);
  assert.equal(invalidFixture.refreshCalls, 0);
  assert.equal(invalidError.message.includes('secret-list'), false);

  const zeroFixture = createHarness({
    provider: provider('m3u'),
    previousCredential: null,
    channels: [],
  });
  const zeroError = await rejection(zeroFixture.service.reenter(m3uInput), 'MALFORMED');
  assert.equal(zeroFixture.saveCalls.length, 0);
  assert.equal(zeroFixture.removeCalls, 0);
  assert.equal(zeroFixture.refreshCalls, 0);
  assert.equal(zeroError.message.includes('token=secret'), false);
});

test('provider re-entry M3U success normalizes credential and requires a usable channel before commit', async () => {
  const fixture = createHarness({
    provider: provider('m3u'),
    previousCredential: { kind: 'm3u', playlistUrl: 'https://old.example.invalid/list.m3u' },
    channels: [channel('m3u')],
  });

  const result = await fixture.service.reenter(m3uInput);

  assert.deepEqual(result, { providerId: 'provider-a', kind: 'm3u', refresh: 'completed' });
  assert.deepEqual(fixture.saveCalls, [{
    kind: 'm3u',
    playlistUrl: 'https://playlist.example.invalid/list.m3u?token=secret',
  }]);
  assert.deepEqual(fixture.events, [
    'provider:get:provider-a',
    'adapter:create:provider-a:m3u',
    'adapter:channels',
    'credential:load:provider-a',
    'credential:save:provider-a:m3u',
    'sync:provider-a',
  ]);
});

test('provider re-entry save failure best-effort restores the exact previous credential', async () => {
  const fixture = createHarness({ failCandidateSave: true });

  const error = await rejection(fixture.service.reenter(xtreamInput), 'UNAVAILABLE');

  assert.equal(fixture.saveCalls.length, 2);
  assert.deepEqual(fixture.saveCalls[1], previousXtream);
  assert.deepEqual(fixture.storedCredential, previousXtream);
  assert.equal(fixture.refreshCalls, 0);
  assert.equal(error.message.includes('new-password'), false);
  assert.equal(error.message.toLowerCase().includes('rollback'), false);
  assert.equal(error.message.toLowerCase().includes('restored'), false);
});

test('provider re-entry save failure without previous credential attempts candidate cleanup', async () => {
  const fixture = createHarness({
    previousCredential: null,
    failCandidateSave: true,
  });

  const error = await rejection(fixture.service.reenter(xtreamInput), 'UNAVAILABLE');

  assert.equal(fixture.saveCalls.length, 1);
  assert.equal(fixture.removeCalls, 1);
  assert.equal(fixture.storedCredential, null);
  assert.equal(fixture.refreshCalls, 0);
  assert.equal(error.message.toLowerCase().includes('rollback'), false);
});

test('provider re-entry compensation failure remains sanitized UNAVAILABLE and makes no rollback-success claim', async () => {
  const restoreFixture = createHarness({
    failCandidateSave: true,
    failCompensation: true,
  });
  const restoreError = await rejection(restoreFixture.service.reenter(xtreamInput), 'UNAVAILABLE');
  assert.equal(restoreFixture.saveCalls.length, 2);
  assert.equal(restoreError.message.includes('old-password'), false);
  assert.equal(restoreError.message.toLowerCase().includes('rollback'), false);
  assert.equal(restoreError.message.toLowerCase().includes('restored'), false);

  const cleanupFixture = createHarness({
    previousCredential: null,
    failCandidateSave: true,
    failCompensation: true,
  });
  const cleanupError = await rejection(cleanupFixture.service.reenter(xtreamInput), 'UNAVAILABLE');
  assert.equal(cleanupFixture.removeCalls, 1);
  assert.equal(cleanupError.message.includes('token=secret'), false);
  assert.equal(cleanupError.message.toLowerCase().includes('rollback'), false);
});

test('provider re-entry post-commit refresh failure keeps new credential and reports degraded without compensation', async () => {
  const fixture = createHarness({
    refreshError: new Error('refresh leaked https://new.example.invalid?password=new-password'),
  });

  const result = await fixture.service.reenter(xtreamInput);

  assert.deepEqual(result, { providerId: 'provider-a', kind: 'xtream', refresh: 'degraded' });
  assert.deepEqual(fixture.storedCredential, {
    kind: 'xtream',
    serverUrl: 'https://new.example.invalid',
    username: 'new-user',
    password: 'new-password',
  });
  assert.equal(fixture.saveCalls.length, 1);
  assert.equal(fixture.removeCalls, 0);
  assert.equal(JSON.stringify(result).includes('new.example.invalid'), false);
  assert.equal(JSON.stringify(result).includes('new-password'), false);
});

test('provider re-entry classifies a partial refresh report as degraded without rolling credentials back', async () => {
  const fixture = createHarness({
    refreshReport: successReport({
      channels: { status: 'failed', code: 'NETWORK' },
    }),
  });

  const result = await fixture.service.reenter(xtreamInput);

  assert.equal(result.refresh, 'degraded');
  assert.equal(fixture.saveCalls.length, 1);
  assert.equal(fixture.removeCalls, 0);
});

test('provider re-entry leaves activation, Favorites, and watch state untouched because they are outside the transaction', async () => {
  const fixture = createHarness();
  const activeProviderId = 'provider-b';
  const favorites = ['provider-a:channel-x', 'provider-b:channel-y'];
  const watch = ['provider-a:channel-x@50', 'provider-b:channel-y@80'];

  await fixture.service.reenter(xtreamInput);

  assert.equal(activeProviderId, 'provider-b');
  assert.deepEqual(favorites, ['provider-a:channel-x', 'provider-b:channel-y']);
  assert.deepEqual(watch, ['provider-a:channel-x@50', 'provider-b:channel-y@80']);
  assert.equal(fixture.events.some((event) => /active|favorite|watch|delete|removeProvider/i.test(event)), false);
});

test('provider re-entry missing provider is sanitized and performs no network or writes', async () => {
  const fixture = createHarness({ provider: null });

  const error = await rejection(fixture.service.reenter(xtreamInput), 'NOT_FOUND');

  assert.equal(fixture.adapterCreates, 0);
  assert.equal(fixture.saveCalls.length, 0);
  assert.equal(fixture.refreshCalls, 0);
  assert.equal(error.message.includes('new.example.invalid'), false);
});

test('provider re-entry bounds concurrent same-provider submissions and releases the guard afterward', async () => {
  const entered = deferred();
  const release = deferred();
  const fixture = createHarness({
    holdChannels: {
      entered: entered.resolve,
      wait: release.promise,
    },
  });

  const first = fixture.service.reenter(xtreamInput);
  await entered.promise;

  const duplicateError = await rejection(fixture.service.reenter({
    ...xtreamInput,
    password: 'second-secret',
  }), 'UNAVAILABLE');
  assert.equal(duplicateError.message.includes('second-secret'), false);
  assert.equal(fixture.adapterCreates, 1);
  assert.equal(fixture.saveCalls.length, 0);
  assert.equal(fixture.refreshCalls, 0);

  release.resolve();
  await first;

  const later = await fixture.service.reenter(xtreamInput);
  assert.equal(later.providerId, 'provider-a');
  assert.equal(fixture.adapterCreates, 2);
  assert.equal(fixture.saveCalls.length, 2);
  assert.equal(fixture.refreshCalls, 2);
});
