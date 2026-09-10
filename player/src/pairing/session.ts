export const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export interface PairingSessionDescriptor {
  sessionId: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface PairingSessionDependencies {
  nowMs?: () => number;
  makeSessionId?: () => string;
}

interface PairingSessionEntry<T> {
  descriptor: PairingSessionDescriptor;
  value: T;
  consumed: boolean;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = '';

  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset];
    const hasSecond = offset + 1 < bytes.length;
    const hasThird = offset + 2 < bytes.length;
    const second = hasSecond ? bytes[offset + 1] : 0;
    const third = hasThird ? bytes[offset + 2] : 0;
    const combined = (first << 16) | (second << 8) | third;

    encoded += BASE64URL_ALPHABET[(combined >>> 18) & 0x3f];
    encoded += BASE64URL_ALPHABET[(combined >>> 12) & 0x3f];
    if (hasSecond) {
      encoded += BASE64URL_ALPHABET[(combined >>> 6) & 0x3f];
    }
    if (hasThird) {
      encoded += BASE64URL_ALPHABET[combined & 0x3f];
    }
  }

  return encoded;
}

function makeSecureSessionId(): string {
  const secureRandom = globalThis.crypto;
  if (!secureRandom || typeof secureRandom.getRandomValues !== 'function') {
    throw new Error('Pairing session randomness is unavailable.');
  }

  const bytes = new Uint8Array(16);
  secureRandom.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export class PairingSessionManager<T> {
  private readonly nowMs: () => number;
  private readonly makeSessionId: () => string;
  private readonly entries = new Map<string, PairingSessionEntry<T>>();

  constructor(dependencies: PairingSessionDependencies = {}) {
    this.nowMs = dependencies.nowMs ?? Date.now;
    this.makeSessionId = dependencies.makeSessionId ?? makeSecureSessionId;
  }

  create(value: T, ttlMs = DEFAULT_PAIRING_TTL_MS): PairingSessionDescriptor {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error('Pairing session TTL is invalid.');
    }

    const createdAtMs = this.nowMs();
    if (!Number.isFinite(createdAtMs)) {
      throw new Error('Pairing session time is invalid.');
    }

    const sessionId = this.makeSessionId();
    if (this.entries.has(sessionId)) {
      throw new Error('Pairing session ID collision.');
    }

    const descriptor: PairingSessionDescriptor = {
      sessionId,
      createdAtMs,
      expiresAtMs: createdAtMs + ttlMs,
    };
    this.entries.set(sessionId, { descriptor, value, consumed: false });
    return descriptor;
  }
}
