import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderId, ProviderRecord } from '../src/domain/models.js';
import type { ProviderProfile } from '../src/providers/contracts.js';
import { ProviderError } from '../src/providers/errors.js';
import type { ProviderSnapshot } from '../src/providers/provider-core-service.js';
import type { ProviderSyncReport } from '../src/providers/provider-sync-service.js';
import {
  M3uOnboardingService,
  type M3uConnectInput,
} from '../src/providers/m3u/m3u-onboarding-service.js';

const input: M3uConnectInput = {
  playlistUrl: ' https://example.invalid/list.m3u?opaque=test-value ',
};

const profile: ProviderProfile = {
  providerId: 'provider-1',
  kind: 'm3u',
  accountName: null,
  expiresAtMs: null,
  maxConnections: null,
};

const snapshot: ProviderSnapshot = {
  provider: {
    id: 'provider-1',
    kind: 'm3u',
    name: 'M3U',
    createdAtMs: 123,
    lastSuccessfulSyncAtMs: 456,
  },
  categories: [],
  channels: [
    {
      providerId: 'provider-1',
      id: 'channel-1',
      name: 'Synthetic News',
      categoryId: null,
      logoUrl: null,
      number: 1,
    },
  ],
};

function successReport(overrides: Partial<ProviderSyncReport> = {}): ProviderSyncReport {
  return {
    providerId: 'provider-1',
    profile: 'success',
    categories: { status: 'success', count: 0 },
    channels: { status: 'success', count: 1 },
    completedAtMs: 456,
    ...overrides,
  };
}

function createHarness(options: {
  registerError?: unknown;
  syncError?: unknown;
  report?: ProviderSyncReport;
  cache?: ProviderSnapshot;
  loadError?: unknown;
  activateError?: unknown;
  deleteError?: unknown;
} = {}) {
  const events: string[] = [];
  const registered: Array<{ provider: ProviderRecord; credential: unknown }> = [];
  const deleted: ProviderId[] = [];

  const core = {
    async registerProvider(provider: ProviderRecord, credential: unknown) {
      events.push('register');
      registered.push({ provider, credential });
      if (options.registerError) throw options.registerError;
      return profile;
    },
    async switchActiveProvider(providerId: ProviderId) {
      events.push('activate');
      assert.equal(providerId, 'provider-1');
      if (options.activateError) throw options.activateError;
    },
    async deleteProvider(providerId: ProviderId) {
      events.push('delete');
      deleted.push(providerId);
      if (options.deleteError) throw options.deleteError;
    },
    async loadCached(providerId: ProviderId) {
      events.push('loadCached');
      assert.equal(providerId, 'provider-1');
      if (options.loadError) throw options.loadError;
      return options.cache ?? snapshot;
    },
  };

  const sync = {
    async refresh(providerId: ProviderId) {
      events.push('sync');
      assert.equal(providerId, 'provider-1');
      if (options.syncError) throw options.syncError;
      return options.report ?? successReport();
    },
  };

  const service = new M3uOnboardingService({
    core,
    sync,
    createProviderId: () => {
      events.push('createId');
      return 'provider-1';
    },
    now: () => 123,
  });

  return { service, events, registered, deleted };
}

test('M3U-C preserves invalid input and performs no Provider Core work', async () => {
  const { service, events } = createHarness();
  const invalid = { playlistUrl: '  ftp://example.invalid/private-list  ' };

  const result = await service.connect(invalid);

  assert.deepEqual(result, {
    ok: false,
    code: 'UNSUPPORTED_PROTOCOL',
    input: invalid,
  });
  assert.deepEqual(events, []);
});

test('M3U-C validates, registers, syncs, validates usable cache, then activates', async () => {
  const { service, events, registered, deleted } = createHarness();

  const result = await service.connect(input);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.providerId, 'provider-1');
  assert.equal(result.profile, profile);
  assert.equal(result.snapshot, snapshot);
  assert.deepEqual(events, ['createId', 'register', 'sync', 'loadCached', 'activate']);
  assert.deepEqual(deleted, []);
  assert.deepEqual(registered[0], {
    provider: {
      id: 'provider-1',
      kind: 'm3u',
      name: 'M3U',
      createdAtMs: 123,
      lastSuccessfulSyncAtMs: null,
    },
    credential: {
      kind: 'm3u',
      playlistUrl: 'https://example.invalid/list.m3u?opaque=test-value',
    },
  });
});

test('M3U-C preserves ProviderError from registration without post-registration cleanup', async () => {
  const expected = new ProviderError('AUTH', 401, 'Authentication failed.');
  const { service, events, deleted } = createHarness({ registerError: expected });

  await assert.rejects(service.connect(input), (error: unknown) => error === expected);
  assert.deepEqual(events, ['createId', 'register']);
  assert.deepEqual(deleted, []);
});

test('M3U-C rolls back the registered provider when initial sync throws', async () => {
  const { service, events, deleted } = createHarness({
    syncError: new Error('network detail with https://example.invalid/private?opaque=should-not-leak'),
  });

  await assert.rejects(
    service.connect(input),
    (error: unknown) =>
      error instanceof ProviderError &&
      error.code === 'UNAVAILABLE' &&
      !error.message.includes('opaque=') &&
      !error.message.includes('example.invalid'),
  );
  assert.deepEqual(events, ['createId', 'register', 'sync', 'delete']);
  assert.deepEqual(deleted, ['provider-1']);
});

test('M3U-C rolls back and preserves the channel-stage error code when sync cannot produce channels', async () => {
  const { service, events } = createHarness({
    report: successReport({ channels: { status: 'failed', code: 'TIMEOUT' } }),
  });

  await assert.rejects(
    service.connect(input),
    (error: unknown) => error instanceof ProviderError && error.code === 'TIMEOUT',
  );
  assert.deepEqual(events, ['createId', 'register', 'sync', 'delete']);
});

test('M3U-C rejects and rolls back an empty persisted channel cache before activation', async () => {
  const { service, events } = createHarness({
    report: successReport({ channels: { status: 'success', count: 0 } }),
    cache: { ...snapshot, channels: [] },
  });

  await assert.rejects(
    service.connect(input),
    (error: unknown) => error instanceof ProviderError && error.code === 'MALFORMED',
  );
  assert.deepEqual(events, ['createId', 'register', 'sync', 'loadCached', 'delete']);
});

test('M3U-C rolls back cache-read failure before activation is attempted', async () => {
  const { service, events } = createHarness({ loadError: new Error('cache read detail') });

  await assert.rejects(
    service.connect(input),
    (error: unknown) => error instanceof ProviderError && error.code === 'UNAVAILABLE',
  );
  assert.deepEqual(events, ['createId', 'register', 'sync', 'loadCached', 'delete']);
});

test('M3U-C rolls back activation failure after usable cache validation', async () => {
  const { service, events } = createHarness({ activateError: new Error('active write detail') });

  await assert.rejects(
    service.connect(input),
    (error: unknown) => error instanceof ProviderError && error.code === 'UNAVAILABLE',
  );
  assert.deepEqual(events, ['createId', 'register', 'sync', 'loadCached', 'activate', 'delete']);
});

test('M3U-C cleanup failure never replaces the original safe provider error', async () => {
  const { service } = createHarness({
    report: successReport({ channels: { status: 'failed', code: 'AUTH' } }),
    deleteError: new Error('cleanup detail'),
  });

  await assert.rejects(
    service.connect(input),
    (error: unknown) =>
      error instanceof ProviderError && error.code === 'AUTH' && !error.message.includes('cleanup'),
  );
});

test('M3U-C keeps the credential-bearing playlist URL out of provider metadata and failures', async () => {
  const { service, registered } = createHarness({
    report: successReport({ channels: { status: 'failed', code: 'SERVER' } }),
  });

  await assert.rejects(
    service.connect(input),
    (error: unknown) =>
      error instanceof ProviderError &&
      !error.message.includes('opaque=test-value') &&
      !error.message.includes('example.invalid'),
  );

  const serializedProvider = JSON.stringify(registered[0]?.provider);
  assert.equal(serializedProvider.includes('opaque=test-value'), false);
  assert.equal(serializedProvider.includes('example.invalid'), false);
});
