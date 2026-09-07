import type { PlaybackResult, PlaybackService, StreamRequest } from './contracts.js';
import {
  ShakaAdapter,
  type BufferingCallback,
  type ChannelAdvanceCallback,
  type LegacyPlayerPort,
  type ProxySuggestionCallback,
  type TrackChangeCallback,
} from './shaka-adapter.js';

export class PlaybackServiceFacade implements PlaybackService {
  constructor(private readonly primary: ShakaAdapter) {}

  play(request: StreamRequest): Promise<PlaybackResult> {
    return this.primary.play(request);
  }

  initPlayer(videoEl: unknown): boolean | Promise<boolean> {
    return this.primary.initPlayer(videoEl);
  }

  loadChannel(channel: unknown): Promise<boolean> {
    return this.primary.loadChannel(channel);
  }

  stop(): void {
    this.primary.stop();
  }

  togglePlay(): void {
    this.primary.togglePlay();
  }

  reloadChannel(): void {
    this.primary.reloadChannel();
  }

  onBuffering(callback: BufferingCallback): void {
    this.primary.onBuffering(callback);
  }

  onTrackChange(callback: TrackChangeCallback): void {
    this.primary.onTrackChange(callback);
  }

  onChannelAdvance(callback: ChannelAdvanceCallback): void {
    this.primary.onChannelAdvance(callback);
  }

  onProxySuggestion(callback: ProxySuggestionCallback): void {
    this.primary.onProxySuggestion(callback);
  }

  getActiveHeight(): number | null {
    return this.primary.getActiveHeight();
  }

  getActiveBandwidth(): number | null {
    return this.primary.getActiveBandwidth();
  }

  getBufferingPercent(): number {
    return this.primary.getBufferingPercent();
  }

  getPlayer(): unknown {
    return this.primary.getPlayer();
  }

  getResolutions(): readonly number[] {
    return this.primary.getResolutions();
  }

  selectResolution(height: number | null): void {
    this.primary.selectResolution(height);
  }

  setAutoQuality(enabled: boolean): void {
    this.primary.setAutoQuality(enabled);
  }

  isNativeAvailable(): boolean {
    return this.primary.isNativeAvailable();
  }

  getVideoElement(): unknown {
    return this.primary.getVideoElement();
  }
}

export function createPlaybackService(legacyPlayer: LegacyPlayerPort): PlaybackServiceFacade {
  return new PlaybackServiceFacade(new ShakaAdapter(legacyPlayer));
}
