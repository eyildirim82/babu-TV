import type { PairingRelayRequest, PairingRelayTransport } from './relay-contracts.js';
import { PairingRelayError } from './relay-client.js';

export class FetchPairingRelayTransport implements PairingRelayTransport {
  constructor(private readonly fetchImpl: typeof fetch) {}

  async request<T>(request: PairingRelayRequest): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const init: RequestInit = {
        method: request.method,
        signal: controller.signal,
      };

      if (request.method === 'POST' && request.body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(request.body);
      }

      const response = await this.fetchImpl(request.url, init);
      if (!response.ok) throw new PairingRelayError('NETWORK');

      let text: string;
      try {
        text = await response.text();
      } catch {
        throw new PairingRelayError('NETWORK');
      }

      if (text.length === 0) return null as T;

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new PairingRelayError('MALFORMED');
      }
    } catch (error) {
      if (error instanceof PairingRelayError) throw error;
      throw new PairingRelayError('NETWORK');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
