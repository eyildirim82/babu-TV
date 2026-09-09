import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderId, ProviderRecord } from '../src/domain/models.js';
import type { ProviderProfile } from '../src/providers/contracts.js';
import { ProviderError } from '../src/providers/errors.js';
import type { ProviderSnapshot } from '../src/providers/provider-core-service.js';
import type { ProviderSyncReport } from '../src/providers/provider-sync-service.js';
import {
  XtreamOnboardingService,
  type XtreamConnectInput,
} from '../src/providers/xtream-onboarding-service.js';

const input: XtreamConnectInput = {
  serverUrl: ' https://demo.invalid/base/ ',
  username: ' demo-user ',
  password: ' demo-pass ',
};

const profile: ProviderProfile = {
  providerId: 'provider-1',
  kind: 'xtream',
  accountName: 'Demo',
  expiresAtMs: null,
  maxConnections: 1,
};

const snapshot: ProviderSnapshot = {
  provider: {
    id: 'provider-1',
    kind: 'xtream',
    name: 'demo.invalid',
    createdAtMs: 123,
    lastSuccessfulSyncAtMs: 456,
  },
  categories: [],
  channels: [],
};

function successReport(overrides: Partial<ProviderSyncReport> = {}): ProviderSyncReport {
  return {
    providerId: 'provider-1',
    profile: 'success',
    categories: { status: 'success', count: 0 },
    channels: { status: 'success', count: 0 },
    completedAtMs: 456,
    ...overrides,
  };
}

function createHarness(options: {
  registerError?: unknown;
  syncError?: unknown;
  report?: ProviderSyncReport;
  activateError?: unknown;
  loadError?: unknown;
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
      return snapshot;
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

  const service = new XtreamOnboardingService({
    core,
    sync,
    createProviderId: () => 'provider-1',
    now: () => 123,
  });

  return { service, events, registered, deleted };
}

test('registers, syncs channels, activates, and returns the cached snapshot in order', async () => {
  const { service, events, registered, deleted } = createHarness();
  const result = await service.connect(input);

  assert.deepEqual(events, ['register', 'sync', 'activate', 'loadCached']);
  assert.equal(result.providerId, 'provider-1');
  assert.equal(result.profile, profile);
  assert.equal(result.snapshot, snapshot);
  assert.deepEqual(deleted, []);
  assert.deepEqual(registered[0], {
    provider: {
      id: 'provider-1',
      kind: 'xtream',
      name: 'demo.invalid',
      createdAtMs: 123,
      lastSuccessfulSyncAtMs: null,
    },
    credential: {
      kind: 'xtream',
      serverUrl: 'https://demo.invalid/base/',
      username: 'demo-user',
      password: 'demo-pass',
    },
  });
});

test('trims inputs and rejects empty fields before Provider Core work', async () => {
  const { service, events } = createHarness();
  await assert.rejects(
    service.connect({ serverUrl: ' ', username: 'demo-user', password: 'demo-pass' }),
    (error: unknown) => error instanceof ProviderError && error.code === 'MALFORMED',
  );
  assert.deepEqual(events, []);
});

test('preserves ProviderError from registration without post-registration cleanup', async () => {
  const expected = new ProviderError('AUTH', 401, 'Authentication failed.');
  const { service, events, deleted } = createHarness({ registerError: expected });

  await assert.rejects(service.connect(input), (error: unknown) => error === expected);
  assert.deepEqual(events, ['register']);
  assert.deepEqual(deleted, []);
});

test('rolls back the new provider when initial sync throws', async () => {
  const { service, events, deleted } = createHarness({ syncError: new Error('network raw detail') });

  await assert.rejects(
    service.connect(input),
    (error: unknown) => error instanceof ProviderError && error.code === 'UNAVAILABLE' && !error.message.includes('demo-pass'),
  );
  assert.deepEqual(events, ['register', 'sync', 'delete']);
  assert.deepEqual(deleted, ['provider-1']);
});

test('rolls back and preserves the channel-stage error code when channel sync fails', async () => {
  const { service, events } = createHarness({
    report: successReport({ channels: { status: 'failed', code: 'TIMEOUT' } }),
  });

  await assert.rejects(
    service.connect(input),
    (error: unknown) => error instanceof ProviderError && error.code === 'TIMEOUT',
  );
  assert.deepEqual(events, ['register', 'sync', 'delete']);
});

test('allows category failure when channel sync succeeds', async () => {
  const { service, events } = createHarness({
    report: successReport({ categories: { status: 'failed', code: 'SERVER' } }),
  });

  const result = await service.connect(input);
  assert.equal(result.providerId, 'provider-1');
  assert.deepEqual(events, ['register', 'sync', 'activate', 'loadCached']);
});

test('rolls back when active-provider selection fails', async () => {
  const { service, events } = createHarness({ activateError: new Error('active write failed') });

  await assert.rejects(
    service.connect(input),
    (error: unknown) => error instanceof ProviderError && error.code === 'UNAVAILABLE',
  );
  assert.deepEqual(events, ['register', 'sync', 'activate', 'delete']);
});

test('rolls back when post-sync cache loading fails', async () => {
  const { service, events } = createHarness({ loadError: new Error('cache read failed') });

  await assert.rejects(
    service.connect(input),
    (error: unknown) => error instanceof ProviderError && error.code === 'UNAVAILABLE',
  );
  assert.deepEqual(events, ['register', 'sync', 'activate', 'loadCached', 'delete']);
});

test('cleanup failure never replaces the original safe provider error', async () => {
  const { service } = createHarness({
    report: successReport({ channels: { status: 'failed', code: 'AUTH' } }),
    deleteError: new Error('cleanup secret-looking detail'),
  });

  await assert.rejects(
    service.connect(input),
    (error: unknown) => error instanceof ProviderError && error.code === 'AUTH' && !error.message.includes('cleanup'),
  );
});

test('provider id is supplied independently from credential material', async () => {
  const { service, registered } = createHarness();
  await service.connect(input);
  assert.equal(registered[0].provider.id, 'provider-1');
  assert.equal(registered[0].provider.id.includes('demo-user'), false);
  assert.equal(registered[0].provider.id.includes('demo-pass'), false);
  assert.equal(registered[0].provider.id.includes('demo.invalid'), false);
});
