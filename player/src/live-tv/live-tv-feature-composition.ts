import type { Category, Channel, ChannelId, ProviderId } from '../domain/models.js';
import type { EpgQuery } from '../epg/contracts.js';
import type { FavoriteReconciliation } from '../favorites/service.js';
import {
  buildFavoritesViewModel,
  type FavoritesViewModel,
} from '../favorites/view-model.js';
import {
  presentEpgLiveTv,
  type EpgLiveTvPresentation,
} from './epg-live-tv-presentation.js';
import { buildEpgLiveTvViewModel } from './epg-live-tv-view-model.js';

export interface LiveTvFavoritePort {
  isFavorite(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  toggle(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  reconcile(
    providerId: ProviderId,
    availableChannelIds: ReadonlySet<ChannelId>,
  ): Promise<FavoriteReconciliation>;
}

export interface LiveTvFeaturePorts {
  epg: Pick<EpgQuery, 'getCurrent' | 'getNext'>;
  favorites: LiveTvFavoritePort;
  nowMs(): number;
}

export type LiveTvFeatureLayer = 'none' | 'search' | 'actions' | 'program-info';

export interface LiveTvFeatureRefreshInput {
  providerId: ProviderId;
  channels: readonly Channel[];
  visibleChannels: readonly Channel[];
  categories: readonly Category[];
  highlightedChannelId: ChannelId | null;
}

export interface LiveTvFeatureState {
  layer: LiveTvFeatureLayer;
  epg: EpgLiveTvPresentation;
  selectedFavorite: boolean;
  favorites: FavoritesViewModel;
}

export interface LiveTvFeatureComposition {
  refresh(input: LiveTvFeatureRefreshInput): Promise<LiveTvFeatureState>;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function emptyReconciliation(): FavoriteReconciliation {
  return { available: [], missing: [] };
}

export function createLiveTvFeatureComposition(
  ports: LiveTvFeaturePorts,
): LiveTvFeatureComposition {
  return {
    async refresh(input): Promise<LiveTvFeatureState> {
      const availableChannelIds = new Set(input.channels.map((channel) => channel.id));
      const epgModel = await buildEpgLiveTvViewModel({
        providerId: input.providerId,
        visibleChannels: input.visibleChannels,
        highlightedChannelId: input.highlightedChannelId,
        atMs: ports.nowMs(),
        query: ports.epg,
      });

      const epg = presentEpgLiveTv(epgModel, {
        formatTimeRange(startMs, endMs) {
          return `${formatTime(startMs)}–${formatTime(endMs)}`;
        },
      });

      let reconciliation: FavoriteReconciliation;
      try {
        reconciliation = await ports.favorites.reconcile(input.providerId, availableChannelIds);
      } catch {
        reconciliation = emptyReconciliation();
      }

      let selectedFavorite = false;
      if (input.highlightedChannelId !== null) {
        try {
          selectedFavorite = await ports.favorites.isFavorite(
            input.providerId,
            input.highlightedChannelId,
          );
        } catch {
          selectedFavorite = false;
        }
      }

      return {
        layer: 'none',
        epg,
        selectedFavorite,
        favorites: buildFavoritesViewModel({
          providerId: input.providerId,
          channels: input.channels,
          reconciliation,
        }),
      };
    },
  };
}
