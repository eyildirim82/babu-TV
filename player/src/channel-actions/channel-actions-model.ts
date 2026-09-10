import type { ChannelId, ProviderId } from '../domain/models.js';

export type ChannelActionId = 'WATCH' | 'FAVORITE' | 'PROGRAM_INFO';

export interface ChannelActionItem {
  id: ChannelActionId;
  label: string;
}

export interface ChannelActionContext {
  providerId: ProviderId;
  channelId: ChannelId;
}

export interface ChannelActionPresentationInput extends ChannelActionContext {
  isFavorite: boolean;
  programInfoAvailable: boolean;
}

export interface ChannelActionsState {
  open: boolean;
  focusedActionId: ChannelActionId | null;
}

export type ChannelActionsReducerAction =
  | { type: 'MOVE'; direction: 'PREVIOUS' | 'NEXT'; actions: readonly ChannelActionItem[] }
  | { type: 'SYNC'; actions: readonly ChannelActionItem[] }
  | { type: 'BACK' };

export type ChannelActionIntent =
  | ({ type: 'PLAY_CHANNEL' } & ChannelActionContext)
  | ({ type: 'TOGGLE_FAVORITE' } & ChannelActionContext)
  | ({ type: 'SHOW_PROGRAM_INFO' } & ChannelActionContext);

export function buildChannelActions(input: ChannelActionPresentationInput): readonly ChannelActionItem[] {
  const actions: ChannelActionItem[] = [
    { id: 'WATCH', label: 'İzle' },
    {
      id: 'FAVORITE',
      label: input.isFavorite ? 'Favorilerden Çıkar' : 'Favoriye Ekle',
    },
  ];

  if (input.programInfoAvailable) {
    actions.push({ id: 'PROGRAM_INFO', label: 'Program Bilgisi' });
  }

  return actions;
}

export function createChannelActionsState(actions: readonly ChannelActionItem[]): ChannelActionsState {
  return {
    open: true,
    focusedActionId: actions[0]?.id ?? null,
  };
}

function syncFocusedAction(
  focusedActionId: ChannelActionId | null,
  actions: readonly ChannelActionItem[],
): ChannelActionId | null {
  if (focusedActionId !== null && actions.some((action) => action.id === focusedActionId)) {
    return focusedActionId;
  }
  return actions[0]?.id ?? null;
}

export function reduceChannelActions(
  state: ChannelActionsState,
  action: ChannelActionsReducerAction,
): ChannelActionsState {
  if (action.type === 'BACK') {
    return state.open ? { ...state, open: false } : state;
  }

  if (action.type === 'SYNC') {
    const focusedActionId = syncFocusedAction(state.focusedActionId, action.actions);
    return focusedActionId === state.focusedActionId ? state : { ...state, focusedActionId };
  }

  if (action.actions.length === 0) {
    return state.focusedActionId === null ? state : { ...state, focusedActionId: null };
  }

  const focusedActionId = syncFocusedAction(state.focusedActionId, action.actions);
  const currentIndex = action.actions.findIndex((item) => item.id === focusedActionId);
  const delta = action.direction === 'NEXT' ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(action.actions.length - 1, currentIndex + delta));
  const nextActionId = action.actions[nextIndex]?.id ?? null;

  return nextActionId === state.focusedActionId
    ? state
    : { ...state, focusedActionId: nextActionId };
}

export function activateChannelAction(
  actionId: ChannelActionId,
  context: ChannelActionContext,
): ChannelActionIntent {
  switch (actionId) {
    case 'WATCH':
      return { type: 'PLAY_CHANNEL', ...context };
    case 'FAVORITE':
      return { type: 'TOGGLE_FAVORITE', ...context };
    case 'PROGRAM_INFO':
      return { type: 'SHOW_PROGRAM_INFO', ...context };
  }
}
