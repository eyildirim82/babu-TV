export type PlaybackState =
  | 'IDLE'
  | 'RESOLVING'
  | 'PREPARING'
  | 'PLAYING'
  | 'BUFFERING'
  | 'FAILED';

export type PlaybackErrorCode =
  | 'AUTH'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'STREAM_NOT_FOUND'
  | 'UNSUPPORTED_CODEC'
  | 'ENGINE_FAILURE'
  | 'UNKNOWN';

export interface StreamRequest {
  url: string;
  userAgent?: string;
  referer?: string;
  headers?: Readonly<Record<string, string>>;
  drm?: { keyId: string; key: string };
  useProxy?: boolean;
  proxyUrl?: string;
}

export interface PlaybackResult {
  ok: boolean;
  engine: 'shaka' | 'avplay' | null;
  error: PlaybackErrorCode | null;
}

export interface PlaybackService {
  play(request: StreamRequest): Promise<PlaybackResult>;
  stop(): Promise<void> | void;
}
