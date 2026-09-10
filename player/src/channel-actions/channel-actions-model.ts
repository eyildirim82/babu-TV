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

export function buildChannelActions(_input: ChannelActionPresentationInput): readonly ChannelActionItem[] {
  return [];
}

export function createChannelActionsState(_actions: readonly ChannelActionItem[]): ChannelActionsState {
  return { open: true, focusedActionId: null };
}

export function reduceChannelActions(
  state: ChannelActionsState,
  _action: ChannelActionsReducerAction,
): ChannelActionsState {
  return state;
}

export function activateChannelAction(
  _actionId: ChannelActionId,
  context: ChannelActionContext,
): ChannelActionIntent {
  return { type: 'PLAY_CHANNEL', ...context };
}
