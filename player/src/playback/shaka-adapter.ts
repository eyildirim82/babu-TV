import type { PlaybackResult, StreamRequest } from './contracts.js';

export type ActivePlaybackEngine = 'shaka' | 'avplay' | null;

export type BufferingCallback = (buffering: boolean, percent?: number) => void;
export type TrackChangeCallback = (track: { height?: number; bandwidth?: number }) => void;
export type ChannelAdvanceCallback = () => void;
export type ProxySuggestionCallback = (channel: unknown) => void;

export interface LegacyPlayerPort {
  initPlayer(videoEl: unknown): boolean | Promise<boolean>;
  loadChannel(channel: unknown): Promise<boolean>;
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

  const channel: Record<string, unknown> = { url: request.url };
  if (request.userAgent) channel.userAgent = request.userAgent;
  if (Object.keys(customHeaders).length > 0) channel.customHeaders = customHeaders;
  return channel;
}

/**
 * Transitional adapter around the inherited player orchestrator.
 * The inherited module still owns its proven Shaka -> AVPlay fallback in M1C;
 * later milestones can split engine coordination without changing callers.
 */
export class ShakaAdapter {
  constructor(private readonly legacy: LegacyPlayerPort) {}

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
