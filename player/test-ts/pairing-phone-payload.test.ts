import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePairingProviderPayload,
  encodePairingProviderPayload,
  type PairingProviderPayloadV1,
} from '../src/pairing/phone-payload.js';

test('PAIR-WEB encodes exact Xtream payload as UTF-8 JSON', () => {
  const payload: PairingProviderPayloadV1 = {
    version: 1,
    credential: {
      kind: 'xtream',
      serverUrl: 'https://iptv.example.invalid',
      username: 'kullanıcı',
      password: 'şifre',
    },
  };
  const bytes = encodePairingProviderPayload(payload);
  const json = new TextDecoder().decode(bytes);
  assert.deepEqual(Object.keys(JSON.parse(json)), ['version', 'credential']);
  assert.deepEqual(decodePairingProviderPayload(bytes), payload);
});

test('PAIR-WEB encodes exact M3U payload as UTF-8 JSON', () => {
  const payload: PairingProviderPayloadV1 = {
    version: 1,
    credential: { kind: 'm3u', playlistUrl: 'https://playlist.example.invalid/list.m3u8' },
  };
  assert.deepEqual(decodePairingProviderPayload(encodePairingProviderPayload(payload)), payload);
});

test('PAIR-WEB rejects malformed or widened provider payloads with one sanitized error', () => {
  const invalidValues: unknown[] = [
    { version: 2, credential: { kind: 'm3u', playlistUrl: 'https://x.invalid/a.m3u8' } },
    { version: 1, credential: { kind: 'unknown' } },
    { version: 1, credential: { kind: 'm3u', playlistUrl: 'x', extra: true } },
    { version: 1, credential: { kind: 'xtream', serverUrl: 'x', username: 'u' } },
    {
      version: 1,
      credential: {
        kind: 'xtream',
        serverUrl: 'x',
        username: 'u',
        password: 'p',
        playlistUrl: 'x',
      },
    },
    { version: 1, credential: { kind: 'm3u', playlistUrl: 7 } },
    { version: 1, credential: { kind: 'm3u', playlistUrl: 'x' }, extra: true },
  ];

  for (const value of invalidValues) {
    assert.throws(
      () => decodePairingProviderPayload(new TextEncoder().encode(JSON.stringify(value))),
      /^Error: Pairing provider payload is invalid\.$/,
    );
  }

  assert.throws(
    () => decodePairingProviderPayload(new TextEncoder().encode('{')),
    /^Error: Pairing provider payload is invalid\.$/,
  );
  assert.throws(
    () => decodePairingProviderPayload(new Uint8Array([0xff])),
    /^Error: Pairing provider payload is invalid\.$/,
  );
});
