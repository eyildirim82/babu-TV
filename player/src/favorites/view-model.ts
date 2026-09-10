import type { Channel, ChannelId, ProviderId } from '../domain/models.js';
import type { FavoriteReconciliation } from './service.js';

export const FAVORITES_VIRTUAL_CATEGORY_KEY = 'virtual:favorites' as const;
export const FAVORITES_CATEGORY_LABEL = 'Favoriler' as const;

export interface FavoritesViewModel {
  categoryKey: typeof FAVORITES_VIRTUAL_CATEGORY_KEY;
  categoryLabel: typeof FAVORITES_CATEGORY_LABEL;
  status: 'ready' | 'empty';
  channels: readonly Channel[];
  focusItemIds: readonly ChannelId[];
}

export interface FavoritesViewModelInput {
  providerId: ProviderId;
  channels: readonly Channel[];
  reconciliation: FavoriteReconciliation;
}

export function buildFavoritesViewModel(input: FavoritesViewModelInput): FavoritesViewModel {
  const channelById = new Map<ChannelId, Channel>();
  for (const channel of input.channels) {
    if (channel.providerId !== input.providerId || channelById.has(channel.id)) continue;
    channelById.set(channel.id, channel);
  }

  const channels: Channel[] = [];
  for (const favorite of input.reconciliation.available) {
    if (favorite.providerId !== input.providerId) continue;
    const channel = channelById.get(favorite.channelId);
    if (channel !== undefined) channels.push(channel);
  }

  return {
    categoryKey: FAVORITES_VIRTUAL_CATEGORY_KEY,
    categoryLabel: FAVORITES_CATEGORY_LABEL,
    status: channels.length === 0 ? 'empty' : 'ready',
    channels,
    focusItemIds: channels.map((channel) => channel.id),
  };
}
