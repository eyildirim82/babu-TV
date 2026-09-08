import type { ProviderHttpClient } from './contracts.js';

export interface ProviderHttpTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const DEFAULT_TIMERS: ProviderHttpTimers = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export class FetchProviderHttpClient implements ProviderHttpClient {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly timers: ProviderHttpTimers = DEFAULT_TIMERS,
  ) {}

  async getJson<T>(_url: string, _timeoutMs = 10_000): Promise<T> {
    this.timers.setTimeout(() => {}, _timeoutMs);
    return {} as T;
  }

  async getText(_url: string, _timeoutMs = 10_000): Promise<string> {
    this.timers.setTimeout(() => {}, _timeoutMs);
    return '';
  }
}
