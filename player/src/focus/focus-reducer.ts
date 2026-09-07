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

export function reduceFocus(state: FocusState, _action: FocusReducerAction): FocusState {
  return state;
}
