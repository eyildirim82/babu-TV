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

export class AvplayAdapter {
  constructor(private readonly legacy: LegacyAvplayPort) {}

  isAvailable(): boolean {
    return this.legacy.isAvailable();
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
