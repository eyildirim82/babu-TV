import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderCredential } from '../src/credentials/contracts.js';
import type { Channel, ProviderRecord } from '../src/domain/models.js';
import { LiveTvController, type LiveTvView } from '../src/live-tv/live-tv-controller.js';
import { createLiveTvRuntime } from '../src/live-tv/create-live-tv-runtime.js';
import type { Platform, PlatformCapabilities } from '../src/platform/contracts.js';
import {
  ProviderCoreService,
  type ProviderSnapshot,
  type ProviderSyncPort,
} from '../src/providers/provider-core-service.js';
import type { ProviderSyncReport } from '../src/providers/provider-sync-service.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';

function provider(id = 'provider-1'): ProviderRecord {
  return {
    id,
    kind: 'xtream',
    name: id,
    createdAtMs: 1,
    lastSuccessfulSyncAtMs: null,
  };
}

function channel(id: string): Channel {
  return {
    providerId: 'provider-1',
    id,
    name: id,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

function snapshot(id: string): ProviderSnapshot {
  return {
    provider: provider(),
    categories: [],
    channels: [channel(id)],
  };
}

function credential(): ProviderCredential {
  return {
    kind: 'xtream',
    serverUrl: 'https://provider.example.test',
    username: 'synthetic-user',
    password: 'synthetic-password',
  };
}

function report(): ProviderSyncReport {
  return {
    providerId: 'provider-1',
    profile: 'success',
    categories: { status: 'success', count: 0 },
    channels: { status: 'success', count: 1 },
    completedAtMs: 123,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class FakeProviders {
  constructor(public activeProviderId: string | null) {}

  async getActiveProviderId(): Promise<string | null> {
    return this.activeProviderId;
  }
}

class FakeCredentials {
  readonly saveCalls: Array<{ providerId: string; credential: ProviderCredential }> = [];
  readonly loadCalls: string[] = [];

  constructor(
    private readonly available = true,
    private readonly stored: ProviderCredential | null = credential(),
  ) {}

  isAvailable(): boolean {
    return this.available;
  }

  async save(providerId: string, value: ProviderCredential): Promise<void> {
    this.saveCalls.push({ providerId, credential: value });
  }

  async load(providerId: string): Promise<ProviderCredential | null> {
    this.loadCalls.push(providerId);
    return this.stored;
  }

  async remove(): Promise<void> {}
}

class FakeCore {
  readonly cacheFirstCalls: string[] = [];
  readonly cachedCalls: string[] = [];
  readonly refreshDeferred = deferred<ProviderSyncReport>();

  constructor(
    private readonly initial: ProviderSnapshot,
    private readonly refreshed: ProviderSnapshot,
  ) {}

  async loadCacheFirst(providerId: string) {
    this.cacheFirstCalls.push(providerId);
    return {
      cached: this.initial,
      refresh: this.refreshDeferred.promise,
    };
  }

  async loadCached(providerId: string): Promise<ProviderSnapshot> {
    this.cachedCalls.push(providerId);
    return this.refreshed;
  }
}

class FakePlatform implements Platform {
  capabilities(): PlatformCapabilities {
    return { tizen: false, optionsKey: false, channelKeys: false, numericKeys: false };
  }
  registerOptionalKeys(): void {}
  exitApp(): void {}
}

class RecordingView implements LiveTvView {
  readonly highlighted: Array<string | null> = [];

  render(state: ReturnType<LiveTvController['state']>): void {
    this.highlighted.push(state.highlightedChannelId);
  }
}

function controller(view = new RecordingView()): { controller: LiveTvController; view: RecordingView } {
  return {
    controller: new LiveTvController({
      intent: {
        async requestChannel() {
          return 'playing';
        },
      },
      platform: new FakePlatform(),
      view,
    }),
    view,
  };
}

void test('no active Provider Core ID falls back to legacy without credential migration', async () => {
  const providers = new FakeProviders(null);
  const credentials = new FakeCredentials();
  const core = new FakeCore(snapshot('cached'), snapshot('refreshed'));
  const live = controller();

  const result = await createLiveTvRuntime({ providers, credentials, core, controller: live.controller });

  assert.deepEqual(result, { mode: 'legacy' });
  assert.deepEqual(credentials.saveCalls, []);
  assert.deepEqual(credentials.loadCalls, []);
  assert.deepEqual(core.cacheFirstCalls, []);
});

void test('active provider enters M3 from cache immediately and syncs refreshed cache without recursive refresh', async () => {
  const providers = new FakeProviders('provider-1');
  const credentials = new FakeCredentials();
  const core = new FakeCore(snapshot('cached'), snapshot('refreshed'));
  const live = controller();

  const result = await createLiveTvRuntime({ providers, credentials, core, controller: live.controller });

  assert.equal(result.mode, 'm3');
  if (result.mode !== 'm3') return;
  assert.equal(result.controller.state().highlightedChannelId, 'cached');
  assert.deepEqual(core.cacheFirstCalls, ['provider-1']);
  assert.deepEqual(core.cachedCalls, []);

  core.refreshDeferred.resolve(report());
  await result.refresh;

  assert.equal(result.controller.state().highlightedChannelId, 'refreshed');
  assert.deepEqual(core.cacheFirstCalls, ['provider-1']);
  assert.deepEqual(core.cachedCalls, ['provider-1']);
  assert.deepEqual(credentials.saveCalls, []);
});

void test('secure credential storage unavailable falls back safely without consulting legacy secrets', async () => {
  const providers = new FakeProviders('provider-1');
  const credentials = new FakeCredentials(false);
  const core = new FakeCore(snapshot('cached'), snapshot('refreshed'));
  const live = controller();

  const result = await createLiveTvRuntime({ providers, credentials, core, controller: live.controller });

  assert.deepEqual(result, { mode: 'legacy' });
  assert.deepEqual(credentials.saveCalls, []);
  assert.deepEqual(credentials.loadCalls, []);
  assert.deepEqual(core.cacheFirstCalls, []);
});

void test('missing active provider credential falls back without creating or saving a replacement', async () => {
  const providers = new FakeProviders('provider-1');
  const credentials = new FakeCredentials(true, null);
  const core = new FakeCore(snapshot('cached'), snapshot('refreshed'));
  const live = controller();

  const result = await createLiveTvRuntime({ providers, credentials, core, controller: live.controller });

  assert.deepEqual(result, { mode: 'legacy' });
  assert.deepEqual(credentials.loadCalls, ['provider-1']);
  assert.deepEqual(credentials.saveCalls, []);
  assert.deepEqual(core.cacheFirstCalls, []);
});

void test('ProviderCoreService loadCached reads cache without starting a provider refresh', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();
  const syncCalls: string[] = [];
  const sync: ProviderSyncPort = {
    async refresh(providerId: string): Promise<ProviderSyncReport> {
      syncCalls.push(providerId);
      return report();
    },
  };

  await providers.saveProvider(provider());
  await catalog.replaceChannels('provider-1', [channel('cached')]);
  const core = new ProviderCoreService(providers, catalog, credentials, sync);

  const cached = await core.loadCached('provider-1');

  assert.deepEqual(cached.channels.map((item) => item.id), ['cached']);
  assert.deepEqual(syncCalls, []);
});
