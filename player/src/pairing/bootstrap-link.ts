import { PairingRelayError } from './relay-client.js';
import type { PairingTvBootstrapV1 } from './tv-controller.js';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function normalizePhoneBaseUrl(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
      throw new Error('invalid public phone url');
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    throw new PairingRelayError('UNAVAILABLE');
  }
}

function encodePublicBootstrap(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    encoded += BASE64.charAt((block >> 18) & 63);
    encoded += BASE64.charAt((block >> 12) & 63);
    if (second !== undefined) encoded += BASE64.charAt((block >> 6) & 63);
    if (third !== undefined) encoded += BASE64.charAt(block & 63);
  }
  return encoded.replace(/\+/g, '-').replace(/\//g, '_');
}

export function createPairingPhoneUrl(
  phoneBaseUrl: string,
  bootstrap: PairingTvBootstrapV1,
): string {
  const publicBootstrap: PairingTvBootstrapV1 = {
    version: bootstrap.version,
    sessionId: bootstrap.sessionId,
    expiresAtMs: bootstrap.expiresAtMs,
    tvPublicKey: bootstrap.tvPublicKey,
    relayBaseUrl: bootstrap.relayBaseUrl,
  };
  const encoded = encodePublicBootstrap(JSON.stringify(publicBootstrap));
  return `${normalizePhoneBaseUrl(phoneBaseUrl)}#pairing=${encoded}`;
}
