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
