import type { FocusState } from '../domain/actions.js';

export type FocusReducerAction =
  | {
      type: 'SYNC_ITEMS';
      itemIds: readonly string[];
      playingItemId: string | null;
    }
  | {
      type: 'MOVE_ITEM';
      itemIds: readonly string[];
      direction: 'PREVIOUS' | 'NEXT';
    };

function contains(itemIds: readonly string[], itemId: string | null): itemId is string {
  return itemId !== null && itemIds.includes(itemId);
}

function withItem(state: FocusState, itemId: string | null): FocusState {
  return itemId === state.itemId ? state : { ...state, itemId };
}

export function reduceFocus(state: FocusState, action: FocusReducerAction): FocusState {
  if (action.type === 'SYNC_ITEMS') {
    if (action.itemIds.length === 0) return withItem(state, null);
    if (contains(action.itemIds, state.itemId)) return state;
    if (contains(action.itemIds, action.playingItemId)) return withItem(state, action.playingItemId);
    if (contains(action.itemIds, state.restoreItemId)) return withItem(state, state.restoreItemId);
    return withItem(state, action.itemIds[0] ?? null);
  }

  if (action.itemIds.length === 0) return withItem(state, null);
  const currentIndex = state.itemId === null ? -1 : action.itemIds.indexOf(state.itemId);
  if (currentIndex < 0) return withItem(state, action.itemIds[0] ?? null);

  const delta = action.direction === 'NEXT' ? 1 : -1;
  const targetIndex = Math.max(0, Math.min(action.itemIds.length - 1, currentIndex + delta));
  return withItem(state, action.itemIds[targetIndex] ?? null);
}
