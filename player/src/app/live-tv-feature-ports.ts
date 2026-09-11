import type { EpgQuery } from '../epg/contracts.js';
import type { FavoriteService } from '../favorites/service.js';
import type { LiveTvFeaturePorts } from '../live-tv/live-tv-feature-composition.js';

export interface AppLiveTvFeaturePortDependencies {
  epg: Pick<EpgQuery, 'getCurrent' | 'getNext'>;
  favorites: Pick<FavoriteService, 'isFavorite' | 'toggle' | 'reconcile'>;
  nowMs(): number;
}

export function createAppLiveTvFeaturePorts(
  deps: AppLiveTvFeaturePortDependencies,
): LiveTvFeaturePorts {
  return {
    epg: deps.epg,
    favorites: deps.favorites,
    nowMs: deps.nowMs,
  };
}
