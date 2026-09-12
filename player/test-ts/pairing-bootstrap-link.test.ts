import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingRelayError } from '../src/pairing/relay-client.js';
import { createPairingPhoneUrl } from '../src/pairing/bootstrap-link.js';
import type { PairingTvBootstrapV1 } from '../src/pairing/tv-controller.js';

const bootstrap: PairingTvBootstrapV1 = {
  version: 1,
  sessionId: 'public-session-id',
  expiresAtMs: 1_800_000_000_000,
  tvPublicKey: { kty: 'EC', crv: 'P-256', x: 'public-x', y: 'public-y' },
  relayBaseUrl: 'https://relay.example.invalid/base',
};

function decodePairingFragment(url: string): unknown {
  const parsed = new URL(url);
  assert.match(parsed.hash, /^#pairing=[A-Za-z0-9_-]+$/);
  const encoded = parsed.hash.slice('#pairing='.length);
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as unknown;
}

test('PAIR-I-WIRE bootstrap link uses an HTTPS fragment and strips existing query/hash', () => {
  const value = createPairingPhoneUrl(
    ' https://phone.example.invalid/pair/?ignored=yes#old ',
    bootstrap,
  );
  const parsed = new URL(value);

  assert.equal(parsed.protocol, 'https:');
  assert.equal(parsed.username, '');
  assert.equal(parsed.password, '');
  assert.equal(parsed.pathname, '/pair/');
  assert.equal(parsed.search, '');
  assert.match(parsed.hash, /^#pairing=/);
});

test('PAIR-I-WIRE bootstrap fragment decodes to the exact public bootstrap key set', () => {
  const value = createPairingPhoneUrl('https://phone.example.invalid/pair', bootstrap);
  const decoded = decodePairingFragment(value) as Record<string, unknown>;

  assert.deepEqual(Object.keys(decoded), [
    'version',
    'sessionId',
    'expiresAtMs',
    'tvPublicKey',
    'relayBaseUrl',
  ]);
  assert.deepEqual(decoded, bootstrap);
  const serialized = JSON.stringify(decoded);
  for (const forbidden of ['credential', 'username', 'password', 'playlistUrl', 'serverUrl', 'privateKey']) {
    assert.equal(serialized.includes(forbidden), false, `forbidden bootstrap key: ${forbidden}`);
  }
});

test('PAIR-I-WIRE bootstrap fragment encoding is deterministic base64url without padding', () => {
  const first = createPairingPhoneUrl('https://phone.example.invalid', bootstrap);
  const second = createPairingPhoneUrl('https://phone.example.invalid', bootstrap);
  assert.equal(first, second);
  const fragment = new URL(first).hash.slice('#pairing='.length);
  assert.doesNotMatch(fragment, /[+/=]/);
});

test('PAIR-I-WIRE bootstrap link rejects non-HTTPS and URL user-info with sanitized errors', () => {
  for (const raw of [
    'http://phone.example.invalid',
    'https://user@phone.example.invalid',
    'https://user:pass@phone.example.invalid',
    'not-a-url',
  ]) {
    assert.throws(
      () => createPairingPhoneUrl(raw, bootstrap),
      (error: unknown) => error instanceof PairingRelayError
        && error.code === 'UNAVAILABLE'
        && error.message === 'Pairing relay is unavailable.'
        && !error.message.includes(raw),
    );
  }
});
