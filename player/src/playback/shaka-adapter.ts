import type {
  LegacyShakaAttemptResult,
  PlaybackEnginePort,
  PlaybackResult,
  StreamRequest,
} from './contracts.js';

export type ActivePlaybackEngine = 'shaka' | 'avplay' | null;

export type BufferingCallback = (buffering: boolean, percent?: number) => void;
export type TrackChangeCallback = (track: { height?: number; bandwidth?: number }) => void;
export type ChannelAdvanceCallback = () => void;
export type ProxySuggestionCallback = (channel: unknown) => void;

export interface LegacyPlayerPort {
  initPlayer(videoEl: unknown): boolean | Promise<boolean>;
  loadChannel(channel: unknown): Promise<boolean>;
  playShakaAttempt(channel: unknown): Promise<LegacyShakaAttemptResult>;
  stop(): void;
  togglePlay(): void;
  reloadChannel(): void;
  onBuffering(callback: BufferingCallback): void;
  onTrackChange(callback: TrackChangeCallback): void;
  onChannelAdvance(callback: ChannelAdvanceCallback): void;
  onProxySuggestion(callback: ProxySuggestionCallback): void;
  getActiveHeight(): number | null;
  getActiveBandwidth(): number | null;
  getBufferingPercent(): number;
  getPlayer(): unknown;
  getResolutions(): readonly number[];
  selectResolution(height: number | null): void;
  getPlaybackEngine(): ActivePlaybackEngine;
  setAutoQuality?(enabled: boolean): void;
  isNativeAvailable?(): boolean;
  getVideoElement?(): unknown;
}

function requestToLegacyChannel(request: StreamRequest): Record<string, unknown> {
  const customHeaders: Record<string, string> = { ...(request.headers ?? {}) };
  if (request.referer) customHeaders.Referer = request.referer;

  const channel: Record<string, unknown> = {
    url: request.url,
    // StreamRequest URLs are transient provider material and may contain
    // credentials/tokens. The inherited player can consume the URL, but its
    // diagnostic logging must treat it as sensitive.
    redactStreamUrl: true,
  };
  if (request.userAgent) channel.userAgent = request.userAgent;
  if (Object.keys(customHeaders).length > 0) channel.customHeaders = customHeaders;
  if (request.drm) channel.drm = request.drm;
  if (request.useProxy !== undefined) channel.useProxy = request.useProxy;
  if (request.proxyUrl) channel.proxyUrl = request.proxyUrl;
  return channel;
}

/**
 * Transitional adapter around the inherited player orchestrator.
 * Legacy callers keep the inherited Shaka -> AVPlay/recovery path through
 * `play()`/`loadChannel()`, while M3 uses the explicit Shaka-only `open()` seam.
 */
export class ShakaAdapter implements PlaybackEnginePort {
  readonly name = 'shaka' as const;

  constructor(private readonly legacy: LegacyPlayerPort) {}

  async open(request: StreamRequest): Promise<PlaybackResult> {
    const result = await this.legacy.playShakaAttempt(requestToLegacyChannel(request));
    return result.ok
      ? { ok: true, engine: 'shaka', error: null }
      : { ok: false, engine: null, error: result.error ?? 'UNKNOWN' };
  }

  isAvailable(): boolean {
    return this.legacy.getPlayer() !== null;
  }

  async play(request: StreamRequest): Promise<PlaybackResult> {
    const ok = await this.legacy.loadChannel(requestToLegacyChannel(request));
    return {
      ok,
      engine: ok ? this.legacy.getPlaybackEngine() : null,
      error: ok ? null : 'UNKNOWN',
    };
  }

  initPlayer(videoEl: unknown): boolean | Promise<boolean> {
    return this.legacy.initPlayer(videoEl);
  }

  loadChannel(channel: unknown): Promise<boolean> {
    return this.legacy.loadChannel(channel);
  }

  stop(): void {
    this.legacy.stop();
  }

  togglePlay(): void {
    this.legacy.togglePlay();
  }

  reloadChannel(): void {
    this.legacy.reloadChannel();
  }

  onBuffering(callback: BufferingCallback): void {
    this.legacy.onBuffering(callback);
  }

  onTrackChange(callback: TrackChangeCallback): void {
    this.legacy.onTrackChange(callback);
  }

  onChannelAdvance(callback: ChannelAdvanceCallback): void {
    this.legacy.onChannelAdvance(callback);
  }

  onProxySuggestion(callback: ProxySuggestionCallback): void {
    this.legacy.onProxySuggestion(callback);
  }

  getActiveHeight(): number | null {
    return this.legacy.getActiveHeight();
  }

  getActiveBandwidth(): number | null {
    return this.legacy.getActiveBandwidth();
  }

  getBufferingPercent(): number {
    return this.legacy.getBufferingPercent();
  }

  getPlayer(): unknown {
    return this.legacy.getPlayer();
  }

  getResolutions(): readonly number[] {
    return this.legacy.getResolutions();
  }

  selectResolution(height: number | null): void {
    this.legacy.selectResolution(height);
  }

  setAutoQuality(enabled: boolean): void {
    this.legacy.setAutoQuality?.(enabled);
  }

  isNativeAvailable(): boolean {
    return this.legacy.isNativeAvailable?.() ?? false;
  }

  getVideoElement(): unknown {
    return this.legacy.getVideoElement?.() ?? null;
  }
}
