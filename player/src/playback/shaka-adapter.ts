import type {
  LegacyShakaAttemptResult,
  PlaybackEnginePort,
  PlaybackResult,
  StreamRequest,
} from './contracts.js';
import { classifyShakaFailure } from './shaka-error-classifier.js';

export type ActivePlaybackEngine = 'shaka' | 'avplay' | null;

export type BufferingCallback = (buffering: boolean, percent?: number) => void;
export type TrackChangeCallback = (track: { height?: number; bandwidth?: number }) => void;
export type ChannelAdvanceCallback = () => void;
export type ProxySuggestionCallback = (channel: unknown) => void;
export type PlaybackTerminalCallback = (event: {
  token: number;
  reason: 'ended' | 'error';
}) => void;

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

interface ObservableEventTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

function asObservableEventTarget(value: unknown): ObservableEventTarget | null {
  if (value === null || typeof value !== 'object') return null;
  const candidate = value as Partial<ObservableEventTarget>;
  return typeof candidate.addEventListener === 'function'
    && typeof candidate.removeEventListener === 'function'
    ? candidate as ObservableEventTarget
    : null;
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
  private playbackToken = 0;
  private terminalCallback: PlaybackTerminalCallback | null = null;
  private terminalUnsubscribers: Array<() => void> = [];

  constructor(private readonly legacy: LegacyPlayerPort) {}

  async open(request: StreamRequest): Promise<PlaybackResult> {
    const token = ++this.playbackToken;
    const result = await this.legacy.playShakaAttempt(requestToLegacyChannel(request));
    if (result.ok) {
      this.bindTerminalEvents(token);
      return { ok: true, engine: 'shaka', error: null };
    }
    return {
      ok: false,
      engine: null,
      error: classifyShakaFailure(result.failure),
    };
  }

  isAvailable(): boolean {
    return true;
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
    this.clearTerminalListeners();
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

  onPlaybackTerminal(callback: PlaybackTerminalCallback): void {
    this.terminalCallback = callback;
  }

  getPlaybackToken(): number | null {
    return this.playbackToken > 0 ? this.playbackToken : null;
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

  private bindTerminalEvents(token: number): void {
    try {
      this.clearTerminalListeners();
      this.attachTerminalEvent(this.legacy.getVideoElement?.() ?? null, 'ended', token, 'ended');
      this.attachTerminalEvent(this.legacy.getVideoElement?.() ?? null, 'error', token, 'error');
      this.attachTerminalEvent(this.legacy.getPlayer(), 'error', token, 'error');
    } catch {
      // Terminal observation is optional and must never change open success.
    }
  }

  private attachTerminalEvent(
    value: unknown,
    eventName: string,
    token: number,
    reason: 'ended' | 'error',
  ): void {
    const target = asObservableEventTarget(value);
    if (target === null) return;
    const listener = () => {
      try {
        this.terminalCallback?.({ token, reason });
      } catch {
        // Consumer failures are contained at this read-only observation seam.
      }
    };
    target.addEventListener(eventName, listener);
    this.terminalUnsubscribers.push(() => target.removeEventListener(eventName, listener));
  }

  private clearTerminalListeners(): void {
    for (const unsubscribe of this.terminalUnsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // Cleanup failure cannot alter playback teardown.
      }
    }
  }
}
