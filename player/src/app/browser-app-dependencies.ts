import * as legacyPlayer from '../player.js';
import * as legacyAvplay from '../avplay.js';
import type { Platform } from '../platform/contracts.js';
import { createBrowserProviderRuntime } from '../providers/create-browser-provider-runtime.js';
import { XtreamOnboardingService } from '../providers/xtream-onboarding-service.js';
import { M3uOnboardingService } from '../providers/m3u/m3u-onboarding-service.js';
import { ProviderError } from '../providers/errors.js';
import { HomeView } from '../home/home-view.js';
import { FirstRunView } from '../first-run/first-run-view.js';
import { XtreamEntryView } from '../xtream-entry.js';
import { M3uEntryView } from '../m3u-entry.js';
import { ProviderManagementPresenter } from '../provider-management/provider-management-presenter.js';
import { FavoriteService } from '../favorites/service.js';
import { RepositoryEpgQuery } from '../epg/query-engine.js';
import { createBrowserLiveTvRuntime } from '../live-tv/create-live-tv-runtime.js';
import { RepositoryHomeDataSource } from './home-data-source.js';
import { createAppLiveTvFeaturePorts } from './live-tv-feature-ports.js';
import { ProviderManagementSurface } from './provider-management-surface.js';
import type { AppCompositionDependencies } from './app-composition.js';
import type { WidgetDataLike } from '../credentials/samsung-widgetdata-credential-store.js';

import '../ui/home.css';
import '../ui/first-run.css';
import '../ui/m3u-entry.css';
import '../ui/provider-management.css';
import '../ui/xtream-entry.css';

export interface BrowserAppDependencyInput {
  indexedDb: IDBFactory | null;
  widgetData: WidgetDataLike | null;
  fetchImpl: typeof fetch;
  platform: Platform;
  document: Document;
  setRemoteNumericMode(mode: 'buffered' | 'digits'): void;
  legacy: AppCompositionDependencies['legacy'];
  exitApp(): void;
  nowMs?: () => number;
}

function createProviderId(kind: 'xtream' | 'm3u', nowMs: () => number): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${kind}-${nowMs().toString(36)}-${suffix}`;
}

export function createBrowserAppDependencies(
  input: BrowserAppDependencyInput,
): AppCompositionDependencies {
  const nowMs = input.nowMs ?? (() => Date.now());
  const runtime = createBrowserProviderRuntime({
    indexedDb: input.indexedDb,
    widgetData: input.widgetData,
    fetchImpl: input.fetchImpl,
  });
  const homeData = new RepositoryHomeDataSource({
    providers: runtime.providers,
    catalog: runtime.catalog,
    watch: runtime.watchState,
    favorites: runtime.favorites,
    epg: new RepositoryEpgQuery(runtime.epg),
    nowMs,
  });
  const favoriteService = new FavoriteService(runtime.favorites);
  const epgQuery = new RepositoryEpgQuery(runtime.epg);
  const liveTvFeaturePorts = createAppLiveTvFeaturePorts({
    epg: epgQuery,
    favorites: favoriteService,
    nowMs,
  });
  const xtreamOnboarding = new XtreamOnboardingService({
    core: runtime.core,
    sync: runtime.sync,
    createProviderId: () => createProviderId('xtream', nowMs),
    now: nowMs,
  });
  const m3uOnboarding = new M3uOnboardingService({
    core: runtime.core,
    sync: runtime.sync,
    createProviderId: () => createProviderId('m3u', nowMs),
    now: nowMs,
  });

  return {
    providers: runtime.providers,
    core: runtime.core,
    homeData,
    views: {
      home: (callbacks) => new HomeView(input.document, callbacks),
      firstRun: (callbacks) => new FirstRunView(input.document, callbacks),
      xtream: (callbacks) => new XtreamEntryView(input.document, callbacks),
      m3u: (callbacks) => new M3uEntryView(input.document, callbacks),
      providerManagement: (callbacks) => {
        const presenter = new ProviderManagementPresenter({
          load: async () => ({
            providers: await runtime.providers.listProviders(),
            activeProviderId: await runtime.providers.getActiveProviderId(),
          }),
          switchProvider: (providerId) => runtime.core.switchActiveProvider(providerId),
          deleteProvider: (providerId) => runtime.core.deleteProvider(providerId),
          requestAddProvider: () => callbacks.onAddProvider(),
        });
        return new ProviderManagementSurface(input.document, presenter, {
          onBack: callbacks.onBack,
          onOpenLegacySettings: callbacks.onOpenLegacySettings,
        });
      },
    },
    onboarding: {
      connectXtream: async (entry) => {
        await xtreamOnboarding.connect(entry);
      },
      connectM3u: async (entry) => {
        const result = await m3uOnboarding.connect(entry);
        if (!result.ok) {
          throw new ProviderError(
            'UNAVAILABLE',
            null,
            'Provider connection could not be completed.',
          );
        }
      },
    },
    liveTv: {
      start: async (onRootBack) => {
        const routePlatform: Platform = {
          capabilities: () => input.platform.capabilities(),
          registerOptionalKeys: (keys) => input.platform.registerOptionalKeys(keys),
          exitApp: onRootBack,
        };
        const result = await createBrowserLiveTvRuntime({
          indexedDb: input.indexedDb,
          widgetData: input.widgetData,
          fetchImpl: input.fetchImpl,
          platform: routePlatform,
          document: input.document,
          legacyPlayer,
          legacyAvplay,
          featurePorts: liveTvFeaturePorts,
        });
        input.setRemoteNumericMode(result.mode === 'm3' ? 'digits' : 'buffered');
        return result.mode === 'm3'
          ? { mode: 'm3', controller: result.controller }
          : { mode: 'legacy' };
      },
    },
    legacy: input.legacy,
    exitApp: input.exitApp,
  };
}
