import type { PlaybackEnginePort, PlaybackResult, StreamRequest } from './contracts.js';

export type NativeBufferingCallback = (buffering: boolean, percent?: number) => void;
export type NativeErrorCallback = (type: unknown) => void;

export interface NativePlayOptions {
  userAgent?: string | null;
  referer?: string | null;
  timeoutMs?: number;
}

export interface LegacyAvplayPort {
  isAvailable(): boolean;
  onBuffering(callback: NativeBufferingCallback): void;
  onError(callback: NativeErrorCallback): void;
  play(url: string, options?: NativePlayOptions): Promise<boolean>;
  pause(): void;
  resume(): void;
  stop(): void;
}

export class AvplayAdapter implements PlaybackEnginePort {
  readonly name = 'avplay' as const;

  constructor(private readonly legacy: LegacyAvplayPort) {}

  isAvailable(): boolean {
    return this.legacy.isAvailable();
  }

  async open(request: StreamRequest): Promise<PlaybackResult> {
    if (!this.isAvailable()) {
      return { ok: false, engine: null, error: 'ENGINE_FAILURE' };
    }

    const ok = await this.play(request.url, {
      userAgent: request.userAgent ?? null,
      referer: request.referer ?? null,
    });

    return ok
      ? { ok: true, engine: 'avplay', error: null }
      : { ok: false, engine: null, error: 'ENGINE_FAILURE' };
  }

  onBuffering(callback: NativeBufferingCallback): void {
    this.legacy.onBuffering(callback);
  }

  onError(callback: NativeErrorCallback): void {
    this.legacy.onError(callback);
  }

  play(url: string, options: NativePlayOptions = {}): Promise<boolean> {
    return this.legacy.play(url, options);
  }

  pause(): void {
    this.legacy.pause();
  }

  resume(): void {
    this.legacy.resume();
  }

  stop(): void {
    this.legacy.stop();
  }
}

export function createAvplayAdapter(legacy: LegacyAvplayPort): AvplayAdapter {
  return new AvplayAdapter(legacy);
}
