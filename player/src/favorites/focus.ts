import type { FocusState } from '../domain/actions.js';
import type { ChannelId } from '../domain/models.js';
import { reduceFocus } from '../focus/focus-reducer.js';
import type { FavoritesViewModel } from './view-model.js';

export function syncFavoritesFocus(
  state: FocusState,
  model: FavoritesViewModel,
  playingChannelId: ChannelId | null,
): FocusState {
  return reduceFocus(state, {
    type: 'SYNC_ITEMS',
    itemIds: model.focusItemIds,
    playingItemId: playingChannelId,
  });
}

export function moveFavoritesFocus(
  state: FocusState,
  model: FavoritesViewModel,
  direction: 'PREVIOUS' | 'NEXT',
): FocusState {
  return reduceFocus(state, {
    type: 'MOVE_ITEM',
    itemIds: model.focusItemIds,
    direction,
  });
}
