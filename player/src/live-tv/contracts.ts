import type {
  CategoryId,
  Channel,
  ChannelId,
  ProviderId,
} from '../domain/models.js';
import type { PlaybackErrorCode } from '../playback/contracts.js';

export type LiveTvScope =
  | { kind: 'all' }
  | { kind: 'category'; categoryId: CategoryId };

export type LiveTvOverlayZone = 'CATEGORY' | 'CHANNEL' | 'ACTIONS';

export interface PlaybackIntentState {
  id: number;
  channelId: ChannelId;
  previousChannelId: ChannelId | null;
}

export interface LiveTvState {
  providerId: ProviderId;
  playingChannelId: ChannelId | null;
  highlightedChannelId: ChannelId | null;
  activeScope: LiveTvScope;
  restoreChannelIdByScope: Readonly<Record<string, ChannelId | null>>;
  overlayOpen: boolean;
  overlayZone: LiveTvOverlayZone;
  playbackStatus:
    | 'IDLE'
    | 'RESOLVING'
    | 'PREPARING'
    | 'PLAYING'
    | 'BUFFERING'
    | 'RECOVERING'
    | 'FAILED';
  pendingIntent: PlaybackIntentState | null;
  playbackError: PlaybackErrorCode | null;
  numericInput: string;
}

export type LiveTvAction =
  | { type: 'ENTER'; channels: readonly Channel[] }
  | { type: 'OPEN_OVERLAY'; channels: readonly Channel[] }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'SET_SCOPE'; scope: LiveTvScope; channels: readonly Channel[] }
  | {
      type: 'MOVE_HIGHLIGHT';
      direction: 'PREVIOUS' | 'NEXT';
      channels: readonly Channel[];
    }
  | { type: 'SYNC_CHANNELS'; channels: readonly Channel[] };
