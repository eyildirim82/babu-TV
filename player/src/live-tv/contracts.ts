import type {
  CategoryId,
  Channel,
  ChannelId,
  ProviderId,
} from '../domain/models.js';
import type { PlaybackErrorCode, StreamRequest } from '../playback/contracts.js';

export type LiveTvScope =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'category'; categoryId: CategoryId };

export type LiveTvOverlayZone = 'CATEGORY' | 'CHANNEL' | 'ACTIONS';

export interface PlaybackIntentState {
  id: number;
  channelId: ChannelId;
  previousChannelId: ChannelId | null;
}

export interface ChannelStreamResolver {
  resolve(providerId: ProviderId, channelId: ChannelId): Promise<StreamRequest>;
}

export interface SessionSwitchRequest {
  intentId: number;
  providerId?: ProviderId;
  targetChannelId: ChannelId;
  previousChannelId: ChannelId | null;
  initialRequest: StreamRequest;
  reResolveTarget(): Promise<StreamRequest>;
  resolvePrevious: (() => Promise<StreamRequest>) | null;
  isCurrent(): boolean;
  onRecovering(): void;
  onHandoffStarted?(): void;
  onRollbackRestored?(engine: 'shaka' | 'avplay'): void;
}

export type SessionSwitchResult =
  | { status: 'playing'; engine: 'shaka' | 'avplay' }
  | {
      status: 'failed';
      error: PlaybackErrorCode;
      rollback: 'not-needed' | 'restored' | 'failed';
    };

export interface PlayerSessionPort {
  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult>;
  stop(): Promise<void> | void;
}

export type ChannelIntentEvent =
  | { type: 'RESOLVING'; intent: PlaybackIntentState }
  | { type: 'PREPARING'; intent: PlaybackIntentState }
  | { type: 'RECOVERING'; intent: PlaybackIntentState }
  | {
      type: 'PLAYING';
      intent: PlaybackIntentState;
      engine: 'shaka' | 'avplay';
    }
  | {
      type: 'FAILED';
      intent: PlaybackIntentState;
      error: PlaybackErrorCode;
      rollback: 'not-needed' | 'restored' | 'failed';
    };

export interface LiveTvState {
  providerId: ProviderId;
  playingChannelId: ChannelId | null;
  highlightedChannelId: ChannelId | null;
  activeScope: LiveTvScope;
  favoriteChannelIds?: readonly ChannelId[];
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
  | { type: 'SYNC_CHANNELS'; channels: readonly Channel[] }
  | {
      type: 'SYNC_FAVORITES';
      channelIds: readonly ChannelId[];
      channels: readonly Channel[];
    };
