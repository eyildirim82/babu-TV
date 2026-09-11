import type { CredentialStore } from '../credentials/contracts.js';
import type { WidgetDataLike } from '../credentials/samsung-widgetdata-credential-store.js';
import type { ProviderId } from '../domain/models.js';
import type { Platform } from '../platform/contracts.js';
import { AvplayAdapter } from '../playback/avplay-adapter.js';
import { PlayerSessionCoordinator } from '../playback/player-session-coordinator.js';
import { ShakaAdapter } from '../playback/shaka-adapter.js';
import { createBrowserProviderRuntime } from '../providers/create-browser-provider-runtime.js';
import type {
  CacheFirstLoad,
  ProviderSnapshot,
} from '../providers/provider-core-service.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import {
  LegacyPlaybackTerminalBinder,
  PlaybackWatchObserver,
  WatchObservingPlayerSession,
} from '../watch/playback-session-observer.js';
import { WatchStateService } from '../watch/service.js';
import { ChannelIntentCoordinator } from './channel-intent-coordinator.js';
import { DomLiveTvView } from './dom-live-tv-view.js';
import {
  createLiveTvFeatureComposition,
  type LiveTvFeaturePorts,
} from './live-tv-feature-composition.js';
import { LiveTvController } from './live-tv-controller.js';
import { ProviderStreamResolver } from './provider-stream-resolver.js';

const MEANINGFUL_WATCH_MINIMUM_MS = 30_000;

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
  featurePorts?: LiveTvFeaturePorts;
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
    const {
      providers,
      catalog,
      watchState,
      credentials,
      adapters,
      core,
    } = createBrowserProviderRuntime({
      indexedDb: deps.indexedDb,
      widgetData: deps.widgetData,
      fetchImpl: deps.fetchImpl,
    });
    const resolver = new ProviderStreamResolver(providers, credentials, adapters);
    const shaka = new ShakaAdapter(deps.legacyPlayer);
    const avplay = new AvplayAdapter(deps.legacyAvplay);
    const watchService = new WatchStateService(watchState, {
      minimumSessionMs: MEANINGFUL_WATCH_MINIMUM_MS,
    });
    const watchObserver = new PlaybackWatchObserver(watchService, {
      now: () => Date.now(),
    });
    const terminalBinder = new LegacyPlaybackTerminalBinder(watchObserver, {
      shaka,
      avplay,
    });
    const session = new WatchObservingPlayerSession(
      new PlayerSessionCoordinator(shaka, avplay),
      watchObserver,
      terminalBinder,
    );
    const view = new DomLiveTvView(deps.document);
    const features = deps.featurePorts === undefined
      ? undefined
      : createLiveTvFeatureComposition(deps.featurePorts);
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
      ...(features === undefined ? {} : { features }),
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
