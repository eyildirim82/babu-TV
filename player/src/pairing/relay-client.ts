import type {
  PairingRelayCreateSessionRequest,
  PairingRelayPollResponse,
  PairingRelayPutCiphertextRequest,
  PairingRelayRequest,
  PairingRelayTransport,
} from './relay-contracts.js';

export type PairingRelayErrorCode = 'NETWORK' | 'MALFORMED' | 'UNAVAILABLE';

export class PairingRelayError extends Error {
  constructor(public readonly code: PairingRelayErrorCode) {
    super(
      code === 'MALFORMED'
        ? 'Pairing relay response was malformed.'
        : code === 'UNAVAILABLE'
          ? 'Pairing relay is unavailable.'
          : 'Pairing relay request failed.',
    );
    this.name = 'PairingRelayError';
  }
}

export function normalizePairingRelayBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new PairingRelayError('UNAVAILABLE');
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new PairingRelayError('UNAVAILABLE');
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExactKeySet(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function parsePollResponse(value: unknown): PairingRelayPollResponse {
  if (!isPlainObject(value) || typeof value.status !== 'string') {
    throw new PairingRelayError('MALFORMED');
  }

  if (value.status === 'ready') {
    if (!isExactKeySet(value, ['status', 'ciphertext']) || typeof value.ciphertext !== 'string') {
      throw new PairingRelayError('MALFORMED');
    }
    return { status: 'ready', ciphertext: value.ciphertext };
  }

  if (
    (value.status === 'pending' || value.status === 'expired' || value.status === 'consumed') &&
    isExactKeySet(value, ['status'])
  ) {
    return { status: value.status };
  }

  throw new PairingRelayError('MALFORMED');
}

export class PairingRelayClient {
  private readonly baseUrl: string;

  constructor(
    rawBaseUrl: string,
    private readonly transport: PairingRelayTransport,
    private readonly timeoutMs: number,
  ) {
    this.baseUrl = normalizePairingRelayBaseUrl(rawBaseUrl);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new PairingRelayError('UNAVAILABLE');
    }
  }

  async createSession(request: PairingRelayCreateSessionRequest): Promise<void> {
    await this.send<unknown>({
      method: 'POST',
      url: `${this.baseUrl}/v1/pairing/sessions`,
      body: { sessionId: request.sessionId, expiresAtMs: request.expiresAtMs },
      timeoutMs: this.timeoutMs,
    });
  }

  async putCiphertext(request: PairingRelayPutCiphertextRequest): Promise<void> {
    const sessionId = encodeURIComponent(request.sessionId);
    await this.send<unknown>({
      method: 'POST',
      url: `${this.baseUrl}/v1/pairing/sessions/${sessionId}/ciphertext`,
      body: { ciphertext: request.ciphertext },
      timeoutMs: this.timeoutMs,
    });
  }

  async poll(sessionId: string): Promise<PairingRelayPollResponse> {
    const encodedSessionId = encodeURIComponent(sessionId);
    const response = await this.send<unknown>({
      method: 'GET',
      url: `${this.baseUrl}/v1/pairing/sessions/${encodedSessionId}/ciphertext`,
      timeoutMs: this.timeoutMs,
    });
    return parsePollResponse(response);
  }

  private async send<T>(request: PairingRelayRequest): Promise<T> {
    try {
      return await this.transport.request<T>(request);
    } catch (error) {
      if (error instanceof PairingRelayError) {
        throw error;
      }
      throw new PairingRelayError('NETWORK');
    }
  }
}
