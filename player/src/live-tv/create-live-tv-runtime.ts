import type { CredentialStore } from '../credentials/contracts.js';
import type { ProviderId } from '../domain/models.js';
import type {
  CacheFirstLoad,
  ProviderSnapshot,
} from '../providers/provider-core-service.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import type { LiveTvController } from './live-tv-controller.js';

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
