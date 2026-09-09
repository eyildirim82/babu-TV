import type { CredentialStore } from '../credentials/contracts.js';
import {
  SamsungWidgetDataCredentialStore,
  type WidgetDataLike,
} from '../credentials/samsung-widgetdata-credential-store.js';
import type { ProviderId } from '../domain/models.js';
import type { Platform } from '../platform/contracts.js';
import { AvplayAdapter } from '../playback/avplay-adapter.js';
import { PlayerSessionCoordinator } from '../playback/player-session-coordinator.js';
import { ShakaAdapter } from '../playback/shaka-adapter.js';
import { ProviderAdapterFactoryImpl } from '../providers/provider-adapter-factory.js';
import {
  ProviderCoreService,
  type CacheFirstLoad,
  type ProviderSnapshot,
} from '../providers/provider-core-service.js';
import { ProviderSyncService } from '../providers/provider-sync-service.js';
import { FetchProviderHttpClient } from '../providers/http/fetch-provider-http-client.js';
import { StructuredCatalogRepository } from '../repository/structured-catalog-repository.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import { StructuredProviderRepository } from '../repository/structured-provider-repository.js';
import { IndexedDbStructuredStore } from '../storage/indexeddb-structured-store.js';
import { ChannelIntentCoordinator } from './channel-intent-coordinator.js';
import { DomLiveTvView } from './dom-live-tv-view.js';
import { LiveTvController } from './live-tv-controller.js';
import { ProviderStreamResolver } from './provider-stream-resolver.js';

export interface LiveTvRuntimeProviderPort {
  getActiveProviderId(): Promise<ProviderId | null>;
}

export interface LiveTvRuntimeCredentialPort {
  isAvailable(): boolean;
  load(providerId: ProviderId): ReturnType<CredentialStore['load']>;
}

export interface LiveTvRuntimeCorePort {
  loadCacheFirst(providerId: ProviderId): Promise<CacheFirstLoad>;
  loadCached(providerId: ProviderId): Promise<ProviderSnapshot>;
}

export interface LiveTvRuntimeDependencies {
  providers: LiveTvRuntimeProviderPort | Pick<ProviderRepository, 'getActiveProviderId'>;
  credentials: LiveTvRuntimeCredentialPort;
  core: LiveTvRuntimeCorePort;
  controller: LiveTvController;
}

export type LiveTvRuntimeStart =
  | { mode: 'm3'; controller: LiveTvController; refresh: Promise<void> }
  | { mode: 'legacy' };

export interface BrowserLiveTvRuntimeDependencies {
  indexedDb: IDBFactory | null;
  widgetData: WidgetDataLike | null;
  fetchImpl: typeof fetch;
  platform: Platform;
  document: Document;
  legacyPlayer: ConstructorParameters<typeof ShakaAdapter>[0];
  legacyAvplay: ConstructorParameters<typeof AvplayAdapter>[0];
}

export async function createLiveTvRuntime(
  deps: LiveTvRuntimeDependencies,
): Promise<LiveTvRuntimeStart> {
  let providerId: ProviderId | null;
  try {
    providerId = await deps.providers.getActiveProviderId();
  } catch {
    return { mode: 'legacy' };
  }

  if (providerId === null || !deps.credentials.isAvailable()) {
    return { mode: 'legacy' };
  }

  try {
    if (await deps.credentials.load(providerId) === null) {
      return { mode: 'legacy' };
    }
  } catch {
    return { mode: 'legacy' };
  }

  let cacheFirst: CacheFirstLoad;
  try {
    cacheFirst = await deps.core.loadCacheFirst(providerId);
  } catch {
    return { mode: 'legacy' };
  }

  deps.controller.enter(cacheFirst.cached);

  const refresh = cacheFirst.refresh.then(async () => {
    const refreshed = await deps.core.loadCached(providerId);
    deps.controller.syncCatalog(refreshed);
  }).catch(() => {
    // Cache-first M3 remains usable when a background provider refresh fails.
  });

  return {
    mode: 'm3',
    controller: deps.controller,
    refresh,
  };
}

export async function createBrowserLiveTvRuntime(
  deps: BrowserLiveTvRuntimeDependencies,
): Promise<LiveTvRuntimeStart> {
  try {
    const store = new IndexedDbStructuredStore(deps.indexedDb);
    const providers = new StructuredProviderRepository(store);
    const catalog = new StructuredCatalogRepository(store);
    const credentials = new SamsungWidgetDataCredentialStore(deps.widgetData);
    const http = new FetchProviderHttpClient(deps.fetchImpl);
    const adapters = new ProviderAdapterFactoryImpl(http);
    const sync = new ProviderSyncService(providers, catalog, credentials, adapters);
    const core = new ProviderCoreService(providers, catalog, credentials, sync, adapters);
    const resolver = new ProviderStreamResolver(providers, credentials, adapters);
    const session = new PlayerSessionCoordinator(
      new ShakaAdapter(deps.legacyPlayer),
      new AvplayAdapter(deps.legacyAvplay),
    );
    const view = new DomLiveTvView(deps.document);
    let controller: LiveTvController | null = null;
    const intent = new ChannelIntentCoordinator(
      resolver,
      session,
      (event) => controller?.handleIntentEvent(event),
    );
    controller = new LiveTvController({
      intent,
      platform: deps.platform,
      view,
    });

    return await createLiveTvRuntime({
      providers,
      credentials,
      core,
      controller,
    });
  } catch {
    return { mode: 'legacy' };
  }
}
