import type { Platform } from '../platform/contracts.js';
import { createBrowserProviderRuntime } from '../providers/create-browser-provider-runtime.js';
import { ProviderReentryService } from '../providers/provider-reentry-service.js';
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
import {
  createBrowserLiveTvRuntime,
  type BrowserLiveTvRuntimeDependencies,
} from '../live-tv/create-live-tv-runtime.js';
import {
  createHomeDataSource,
  DEFAULT_HOME_WATCH_SCORE_POLICY,
} from './home-data-source.js';
import { createAppLiveTvFeaturePorts } from './live-tv-feature-ports.js';
import { ProviderManagementSurface } from './provider-management-surface.js';
import type { AppCompositionDependencies } from './app-composition.js';
import type { WidgetDataLike } from '../credentials/samsung-widgetdata-credential-store.js';
import QRCode from 'qrcode';
import { FetchPairingRelayTransport } from '../pairing/browser-relay-transport.js';
import { PairingRelayClient } from '../pairing/relay-client.js';
import { createTvPairingCore } from '../pairing/create-tv-pairing-core.js';
import { PairingTvView } from '../pairing/tv-view.js';

import '../ui/home.css';
import '../ui/first-run.css';
import '../ui/m3u-entry.css';
import '../ui/provider-management.css';
import '../ui/xtream-entry.css';
import '../ui/pairing-tv.css';

const EPG_QUERY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface BrowserAppDependencyInput {
  indexedDb: IDBFactory | null;
  widgetData: WidgetDataLike | null;
  fetchImpl: typeof fetch;
  platform: Platform;
  document: Document;
  legacyPlayer: BrowserLiveTvRuntimeDependencies['legacyPlayer'];
  legacyAvplay: BrowserLiveTvRuntimeDependencies['legacyAvplay'];
  setRemoteNumericMode(mode: 'buffered' | 'digits'): void;
  legacy: AppCompositionDependencies['legacy'];
  exitApp(): void;
  pairing?: {
    relayBaseUrl: string;
    phoneBaseUrl: string;
    relayTimeoutMs: number;
    pollIntervalMs: number;
  };
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
  const homeData = createHomeDataSource({
    providers: runtime.providers,
    catalog: runtime.catalog,
    watchState: runtime.watchState,
    favorites: runtime.favorites,
    nowMs,
    watchScorePolicy: DEFAULT_HOME_WATCH_SCORE_POLICY,
  });
  const favoriteService = new FavoriteService(runtime.favorites, nowMs);
  const epgQuery = new RepositoryEpgQuery(runtime.epgRepository, {
    lookBehindMs: EPG_QUERY_WINDOW_MS,
    lookAheadMs: EPG_QUERY_WINDOW_MS,
  });
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
  const providerReentry = new ProviderReentryService({
    providers: runtime.providers,
    credentials: runtime.credentials,
    adapters: runtime.adapters,
    sync: runtime.sync,
  });
  const pairingConfig = input.pairing;

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
          requestEditProvider: (providerId, kind) => callbacks.onEditProvider(providerId, kind),
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
    pairing: pairingConfig ? {
      view: (callbacks) => {
        const transport = new FetchPairingRelayTransport(input.fetchImpl);
        const relay = new PairingRelayClient(
          pairingConfig.relayBaseUrl,
          transport,
          pairingConfig.relayTimeoutMs,
        );
        const pairingCore = createTvPairingCore({
          relay,
          relayBaseUrl: pairingConfig.relayBaseUrl,
          onboarding: {
            connectXtream: (entry) => xtreamOnboarding.connect(entry),
            connectM3u: (entry) => m3uOnboarding.connect(entry),
          },
        });
        const qr = {
          toDataUrl: (value: string) => QRCode.toDataURL(
            value,
            {
              errorCorrectionLevel: 'M',
              margin: 2,
              width: 360,
            },
          ),
        };
        return new PairingTvView(
          input.document,
          pairingCore,
          callbacks,
          {
            phoneBaseUrl: pairingConfig.phoneBaseUrl,
            pollIntervalMs: pairingConfig.pollIntervalMs,
          },
          qr,
        );
      },
    } : undefined,
    reentry: {
      reenter: (input) => providerReentry.reenter(input),
    },
    liveTv: {
      start: async (onRootBack) => {
        const routePlatform: Platform = {
          capabilities: () => input.platform.capabilities(),
          registerOptionalKeys: (keys) => input.platform.registerOptionalKeys(keys),
          exitApp: () => {
            input.setRemoteNumericMode('buffered');
            onRootBack();
          },
        };
        const result = await createBrowserLiveTvRuntime({
          indexedDb: input.indexedDb,
          widgetData: input.widgetData,
          fetchImpl: input.fetchImpl,
          platform: routePlatform,
          document: input.document,
          legacyPlayer: input.legacyPlayer,
          legacyAvplay: input.legacyAvplay,
          featurePorts: liveTvFeaturePorts,
        });
        input.setRemoteNumericMode(result.mode === 'm3' ? 'digits' : 'buffered');
        return result.mode === 'm3'
          ? {
              mode: 'm3',
              controller: result.controller,
              enterProvider: result.enterProvider,
            }
          : { mode: 'legacy' };
      },
    },
    legacy: input.legacy,
    exitApp: input.exitApp,
  };
}
