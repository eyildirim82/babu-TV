import type { FavoriteRepository } from '../favorites/contracts.js';
import { createHomeViewModel, type HomeViewModel } from '../home/home-domain.js';
import type { CatalogRepository } from '../repository/catalog-repository.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import type { WatchStateRepository } from '../watch/contracts.js';
import type { WatchScorePolicy } from '../watch/score.js';

export const DEFAULT_HOME_WATCH_SCORE_POLICY: WatchScorePolicy = Object.freeze({
  durationWeightPerMinute: 1,
  openWeight: 5,
  recencyHalfLifeMs: 7 * 24 * 60 * 60 * 1000,
});

export interface HomeDataSourcePorts {
  providers: Pick<ProviderRepository, 'listProviders' | 'getActiveProviderId'>;
  catalog: Pick<CatalogRepository, 'listChannels'>;
  favorites: Pick<FavoriteRepository, 'list'>;
  watchState: Pick<WatchStateRepository, 'getLastWatched' | 'listAggregates'>;
  nowMs(): number;
  watchScorePolicy: WatchScorePolicy;
}

export interface HomeDataSource {
  load(): Promise<HomeViewModel>;
}

export function createHomeDataSource(ports: HomeDataSourcePorts): HomeDataSource {
  return {
    async load() {
      const [providers, activeProviderId] = await Promise.all([
        ports.providers.listProviders(),
        ports.providers.getActiveProviderId(),
      ]);

      if (activeProviderId === null) {
        return createHomeViewModel({
          providers,
          activeProviderId: null,
          channels: [],
          lastWatched: null,
          favorites: [],
          watchAggregates: [],
          nowMs: ports.nowMs(),
          watchScorePolicy: ports.watchScorePolicy,
        });
      }

      const [channels, favorites, lastWatched, watchAggregates] = await Promise.all([
        ports.catalog.listChannels(activeProviderId),
        ports.favorites.list(activeProviderId),
        ports.watchState.getLastWatched(activeProviderId),
        ports.watchState.listAggregates(activeProviderId),
      ]);

      return createHomeViewModel({
        providers,
        activeProviderId,
        channels,
        lastWatched,
        favorites,
        watchAggregates,
        nowMs: ports.nowMs(),
        watchScorePolicy: ports.watchScorePolicy,
      });
    },
  };
}
