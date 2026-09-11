import type { Channel, ChannelId, ProviderId } from '../domain/models.js';
import type { LiveTvAction, LiveTvScope, LiveTvState } from './contracts.js';

export function scopeKey(scope: LiveTvScope): string {
  if (scope.kind === 'all') return 'all';
  if (scope.kind === 'favorites') return 'virtual:favorites';
  return `category:${scope.categoryId}`;
}

export function channelsForScope(
  channels: readonly Channel[],
  scope: LiveTvScope,
  favoriteChannelIds: readonly ChannelId[] = [],
): readonly Channel[] {
  if (scope.kind === 'all') return channels;
  if (scope.kind === 'category') {
    return channels.filter((channel) => channel.categoryId === scope.categoryId);
  }

  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  return favoriteChannelIds.flatMap((channelId) => {
    const channel = channelById.get(channelId);
    return channel === undefined ? [] : [channel];
  });
}

function firstExisting(
  candidates: readonly (ChannelId | null)[],
  visibleIds: readonly ChannelId[],
): ChannelId | null {
  for (const candidate of candidates) {
    if (candidate !== null && visibleIds.includes(candidate)) return candidate;
  }
  return visibleIds[0] ?? null;
}

function withRestore(
  state: LiveTvState,
  scope: LiveTvScope,
  channelId: ChannelId | null,
): LiveTvState['restoreChannelIdByScope'] {
  return {
    ...state.restoreChannelIdByScope,
    [scopeKey(scope)]: channelId,
  };
}

function visibleIds(
  channels: readonly Channel[],
  scope: LiveTvScope,
  favoriteChannelIds: readonly ChannelId[],
): readonly ChannelId[] {
  return channelsForScope(channels, scope, favoriteChannelIds).map((channel) => channel.id);
}

export function createInitialLiveTvState(providerId: ProviderId): LiveTvState {
  return {
    providerId,
    playingChannelId: null,
    highlightedChannelId: null,
    activeScope: { kind: 'all' },
    favoriteChannelIds: [],
    restoreChannelIdByScope: {},
    overlayOpen: false,
    overlayZone: 'CHANNEL',
    playbackStatus: 'IDLE',
    pendingIntent: null,
    playbackError: null,
    numericInput: '',
  };
}

export function reduceLiveTv(state: LiveTvState, action: LiveTvAction): LiveTvState {
  switch (action.type) {
    case 'ENTER': {
      const ids = visibleIds(action.channels, state.activeScope, state.favoriteChannelIds);
      const restore = state.restoreChannelIdByScope[scopeKey(state.activeScope)] ?? null;
      const highlightedChannelId = firstExisting(
        [state.playingChannelId, restore, state.highlightedChannelId],
        ids,
      );
      return {
        ...state,
        overlayOpen: true,
        highlightedChannelId,
        restoreChannelIdByScope: withRestore(state, state.activeScope, highlightedChannelId),
      };
    }

    case 'OPEN_OVERLAY': {
      const ids = visibleIds(action.channels, state.activeScope, state.favoriteChannelIds);
      const restore = state.restoreChannelIdByScope[scopeKey(state.activeScope)] ?? null;
      const highlightedChannelId = firstExisting(
        [state.playingChannelId, restore, state.highlightedChannelId],
        ids,
      );
      return {
        ...state,
        overlayOpen: true,
        highlightedChannelId,
        restoreChannelIdByScope: withRestore(state, state.activeScope, highlightedChannelId),
      };
    }

    case 'CLOSE_OVERLAY':
      return { ...state, overlayOpen: false };

    case 'SET_SCOPE': {
      const ids = visibleIds(action.channels, action.scope, state.favoriteChannelIds);
      const restore = state.restoreChannelIdByScope[scopeKey(action.scope)] ?? null;
      const highlightedChannelId = firstExisting(
        [state.playingChannelId, restore, state.highlightedChannelId],
        ids,
      );
      return {
        ...state,
        activeScope: action.scope,
        highlightedChannelId,
        restoreChannelIdByScope: withRestore(state, action.scope, highlightedChannelId),
      };
    }

    case 'MOVE_HIGHLIGHT': {
      const ids = visibleIds(action.channels, state.activeScope, state.favoriteChannelIds);
      if (ids.length === 0) {
        return {
          ...state,
          highlightedChannelId: null,
          restoreChannelIdByScope: withRestore(state, state.activeScope, null),
        };
      }

      const currentIndex = state.highlightedChannelId === null
        ? -1
        : ids.indexOf(state.highlightedChannelId);
      const nextIndex = currentIndex < 0
        ? 0
        : Math.max(
            0,
            Math.min(ids.length - 1, currentIndex + (action.direction === 'NEXT' ? 1 : -1)),
          );
      const highlightedChannelId = ids[nextIndex] ?? null;
      return {
        ...state,
        highlightedChannelId,
        restoreChannelIdByScope: withRestore(state, state.activeScope, highlightedChannelId),
      };
    }

    case 'SYNC_CHANNELS': {
      const ids = visibleIds(action.channels, state.activeScope, state.favoriteChannelIds);
      const restore = state.restoreChannelIdByScope[scopeKey(state.activeScope)] ?? null;
      const highlightedChannelId = firstExisting(
        [state.highlightedChannelId, restore, state.playingChannelId],
        ids,
      );
      return {
        ...state,
        highlightedChannelId,
        restoreChannelIdByScope: withRestore(state, state.activeScope, highlightedChannelId),
      };
    }

    case 'SYNC_FAVORITES': {
      const favoriteChannelIds = [...action.channelIds];
      if (state.activeScope.kind !== 'favorites') {
        return { ...state, favoriteChannelIds };
      }

      const ids = visibleIds(action.channels, state.activeScope, favoriteChannelIds);
      const restore = state.restoreChannelIdByScope[scopeKey(state.activeScope)] ?? null;
      const highlightedChannelId = firstExisting(
        [state.highlightedChannelId, restore, state.playingChannelId],
        ids,
      );
      return {
        ...state,
        favoriteChannelIds,
        highlightedChannelId,
        restoreChannelIdByScope: withRestore(state, state.activeScope, highlightedChannelId),
      };
    }
  }
}
