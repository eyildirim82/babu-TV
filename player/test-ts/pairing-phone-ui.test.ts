import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingPhoneController, type PairingPhoneBootstrapV1 } from '../src/pairing/phone-controller.js';
import type { PairingCiphertextV1 } from '../src/pairing/crypto.js';

const validBootstrap: PairingPhoneBootstrapV1 = {
  version: 1,
  sessionId: 'session-1',
  expiresAtMs: 1_000,
  tvPublicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
  relayBaseUrl: 'https://relay.example.invalid',
};

const envelope: PairingCiphertextV1 = {
  version: 1,
  algorithm: 'ECDH-P256+A256GCM',
  senderPublicKey: { kty: 'EC', crv: 'P-256', x: 'sx', y: 'sy' },
  iv: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'BBBB',
};

test('PAIR-WEB rejects malformed bootstrap before crypto or relay', async () => {
  let cryptoCalls = 0;
  let relayCalls = 0;
  const bad = {
    ...validBootstrap,
    version: 2,
    sessionId: '',
    relayBaseUrl: 'http://relay.example.invalid',
  } as unknown as PairingPhoneBootstrapV1;
  const controller = new PairingPhoneController(bad, {
    crypto: { async encryptForTv() { cryptoCalls += 1; return envelope; } },
    relay: { async putCiphertext() { relayCalls += 1; } },
    nowMs: () => 100,
  });
  controller.chooseProvider('m3u');
  controller.updateM3u({ playlistUrl: 'https://playlist.example.invalid/a.m3u8' });
  await controller.submit();
  assert.deepEqual(controller.state(), { kind: 'error', providerKind: 'm3u', code: 'INVALID_BOOTSTRAP' });
  assert.equal(cryptoCalls, 0);
  assert.equal(relayCalls, 0);
});

test('PAIR-WEB sends only serialized PAIR-C ciphertext to relay and clears secrets after success', async () => {
  const relayRequests: Array<{ sessionId: string; ciphertext: string }> = [];
  let plaintext: Uint8Array | null = null;
  const controller = new PairingPhoneController(validBootstrap, {
    crypto: {
      async encryptForTv(_key, bytes) {
        plaintext = bytes;
        return envelope;
      },
    },
    relay: { async putCiphertext(request) { relayRequests.push(request); } },
    nowMs: () => 100,
  });
  controller.chooseProvider('xtream');
  controller.updateXtream({
    serverUrl: ' https://iptv.example.invalid ',
    username: ' user ',
    password: ' secret ',
  });
  await controller.submit();

  assert.ok(plaintext);
  assert.equal(relayRequests.length, 1);
  assert.deepEqual(relayRequests[0], {
    sessionId: 'session-1',
    ciphertext: JSON.stringify(envelope),
  });
  assert.doesNotMatch(relayRequests[0]!.ciphertext, /iptv|user|secret/);
  assert.deepEqual(controller.state(), { kind: 'success' });
  controller.chooseProvider('xtream');
  assert.deepEqual(controller.state(), {
    kind: 'xtream',
    input: { serverUrl: '', username: '', password: '' },
    error: null,
  });
});

test('PAIR-WEB suppresses duplicate submit while encryption is pending', async () => {
  let cryptoCalls = 0;
  let relayCalls = 0;
  let release!: (value: PairingCiphertextV1) => void;
  const pending = new Promise<PairingCiphertextV1>((resolve) => { release = resolve; });
  const controller = new PairingPhoneController(validBootstrap, {
    crypto: { async encryptForTv() { cryptoCalls += 1; return pending; } },
    relay: { async putCiphertext() { relayCalls += 1; } },
    nowMs: () => 100,
  });
  controller.chooseProvider('m3u');
  controller.updateM3u({ playlistUrl: 'https://playlist.example.invalid/a.m3u8' });
  const first = controller.submit();
  const second = controller.submit();
  assert.equal(cryptoCalls, 1);
  release(envelope);
  await Promise.all([first, second]);
  assert.equal(relayCalls, 1);
});
