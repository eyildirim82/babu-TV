import { ProviderError } from '../errors.js';
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

function errorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError('AUTH', status, 'Provider authentication failed.');
  }
  if (status === 404) {
    return new ProviderError('NOT_FOUND', status, 'Provider resource was not found.');
  }
  if (status >= 500) {
    return new ProviderError('SERVER', status, 'Provider server error.');
  }
  return new ProviderError('UNAVAILABLE', status, 'Provider request failed.');
}

export class FetchProviderHttpClient implements ProviderHttpClient {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly timers: ProviderHttpTimers = DEFAULT_TIMERS,
  ) {}

  private async request(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutHandle = this.timers.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok) throw errorForStatus(response.status);
      return response;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (timedOut) {
        throw new ProviderError('TIMEOUT', null, 'Provider request timed out.');
      }
      throw new ProviderError('NETWORK', null, 'Provider network request failed.');
    } finally {
      this.timers.clearTimeout(timeoutHandle);
    }
  }

  async getJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
    const response = await this.request(url, timeoutMs);
    try {
      return await response.json() as T;
    } catch {
      throw new ProviderError('MALFORMED', response.status, 'Provider response was malformed.');
    }
  }

  async getText(url: string, timeoutMs = 10_000): Promise<string> {
    const response = await this.request(url, timeoutMs);
    return response.text();
  }
}
