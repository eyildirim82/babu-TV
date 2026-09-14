import { encryptForPairingTv } from './crypto.js';
import { FetchPairingRelayTransport } from './fetch-relay-transport.js';
import {
  PairingPhoneController,
  type PairingPhoneBootstrapV1,
  type PairingPhoneRelayPort,
} from './phone-controller.js';
import { PairingPhoneView } from './phone-view.js';
import { PairingRelayClient, PairingRelayError, normalizePairingRelayBaseUrl } from './relay-client.js';

const DEFAULT_PHONE_RELAY_TIMEOUT_MS = 10_000;
const BOOTSTRAP_KEYS = new Set([
  'version',
  'sessionId',
  'expiresAtMs',
  'tvPublicKey',
  'relayBaseUrl',
]);

function decodeBase64Url(value: string): string | null {
  if (
    value.length === 0
    || value.length % 4 === 1
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const canonical = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    if (canonical !== value) return null;

    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function decodeBootstrap(value: unknown): PairingPhoneBootstrapV1 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (
    keys.length !== BOOTSTRAP_KEYS.size
    || keys.some((key) => !BOOTSTRAP_KEYS.has(key))
    || candidate.version !== 1
    || typeof candidate.sessionId !== 'string'
    || candidate.sessionId.trim().length === 0
    || typeof candidate.expiresAtMs !== 'number'
    || !Number.isFinite(candidate.expiresAtMs)
    || !Object.prototype.hasOwnProperty.call(candidate, 'tvPublicKey')
    || typeof candidate.relayBaseUrl !== 'string'
  ) {
    return null;
  }

  try {
    normalizePairingRelayBaseUrl(candidate.relayBaseUrl);
  } catch {
    return null;
  }

  return {
    version: 1,
    sessionId: candidate.sessionId,
    expiresAtMs: candidate.expiresAtMs,
    tvPublicKey: candidate.tvPublicKey as JsonWebKey,
    relayBaseUrl: candidate.relayBaseUrl,
  };
}

export function isPairingPhoneRoute(hash: string): boolean {
  return hash.startsWith('#pairing=');
}

export function decodePairingPhoneFragment(hash: string): PairingPhoneBootstrapV1 | null {
  if (!isPairingPhoneRoute(hash)) return null;
  const encoded = hash.slice('#pairing='.length);
  const decoded = decodeBase64Url(encoded);
  if (decoded === null) return null;

  try {
    return decodeBootstrap(JSON.parse(decoded) as unknown);
  } catch {
    return null;
  }
}

export interface PairingPhoneBrowserRouteInput {
  hash: string;
  document: Document;
  fetchImpl: typeof fetch;
  nowMs?: () => number;
  relayTimeoutMs?: number;
}

function unavailableRelay(): PairingPhoneRelayPort {
  return {
    async putCiphertext(): Promise<void> {
      throw new PairingRelayError('UNAVAILABLE');
    },
  };
}

// The Tizen build strips type="module" from the entry script, which Vite places
// in <head>. The script then runs before <body> exists, so wait for parsing.
function documentBodyReady(document: Document): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

export async function tryStartPairingPhoneBrowserRoute(
  input: PairingPhoneBrowserRouteInput,
): Promise<boolean> {
  if (!isPairingPhoneRoute(input.hash)) return false;

  const bootstrap = decodePairingPhoneFragment(input.hash);
  const relay: PairingPhoneRelayPort = bootstrap === null
    ? unavailableRelay()
    : new PairingRelayClient(
        bootstrap.relayBaseUrl,
        new FetchPairingRelayTransport(input.fetchImpl),
        input.relayTimeoutMs ?? DEFAULT_PHONE_RELAY_TIMEOUT_MS,
      );
  const controller = new PairingPhoneController(bootstrap, {
    crypto: { encryptForTv: encryptForPairingTv },
    relay,
    nowMs: input.nowMs ?? (() => Date.now()),
  });

  if (bootstrap === null) {
    await controller.submit();
  }

  await documentBodyReady(input.document);
  input.document.body.replaceChildren();
  const view = new PairingPhoneView(input.document, controller);
  view.show();
  return true;
}
