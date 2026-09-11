import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingTvController } from '../src/pairing/tv-controller.js';

const privateKey = { extractable: false } as CryptoKey;
const senderPublicKey: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'shape-only-x',
  y: 'shape-only-y',
};

const exactEnvelope = {
  version: 1,
  algorithm: 'ECDH-P256+A256GCM',
  senderPublicKey,
  iv: 'opaque-iv',
  ciphertext: 'opaque-ciphertext',
};

function makeController(ciphertext: string, counters: { decrypt: number; onboarding: number }) {
  return new PairingTvController({
    crypto: {
      async generateTvKeyPair() {
        throw new Error('unexpected key generation');
      },
      async decrypt(_privateKey, envelope) {
        counters.decrypt += 1;
        assert.deepEqual(envelope, exactEnvelope);
        return new TextEncoder().encode('{}');
      },
    },
    sessions: {
      create() {
        throw new Error('unexpected session create');
      },
      consume() {
        return { status: 'ok', value: { privateKey } };
      },
    },
    relay: {
      async createSession() {
        throw new Error('unexpected relay create');
      },
      async poll() {
        return { status: 'ready', ciphertext };
      },
    },
    onboarding: {
      async connectXtream() {
        counters.onboarding += 1;
        return { providerId: 'unexpected-xtream' };
      },
      async connectM3u() {
        counters.onboarding += 1;
        return { ok: true, providerId: 'unexpected-m3u' };
      },
    },
    relayBaseUrl: 'https://relay.example.invalid',
  });
}

test('PAIR-I-CORE rejects malformed or widened ciphertext envelopes before PAIR-C decrypt', async () => {
  const malformed: unknown[] = [
    null,
    [],
    'not-an-object',
    { ...exactEnvelope, extra: true },
    { version: 1, algorithm: exactEnvelope.algorithm, senderPublicKey, iv: exactEnvelope.iv },
    { ...exactEnvelope, version: 2 },
    { ...exactEnvelope, algorithm: 'other' },
    { ...exactEnvelope, senderPublicKey: 'not-a-jwk-object' },
    { ...exactEnvelope, iv: 123 },
    { ...exactEnvelope, ciphertext: false },
  ];

  for (const value of malformed) {
    const counters = { decrypt: 0, onboarding: 0 };
    const controller = makeController(JSON.stringify(value), counters);

    assert.deepEqual(await controller.poll('session-1'), {
      status: 'error',
      code: 'INVALID_PAYLOAD',
    });
    assert.equal(counters.decrypt, 0, `decrypt called for ${JSON.stringify(value)}`);
    assert.equal(counters.onboarding, 0);
  }

  const invalidJsonCounters = { decrypt: 0, onboarding: 0 };
  const invalidJsonController = makeController('{', invalidJsonCounters);
  assert.deepEqual(await invalidJsonController.poll('session-1'), {
    status: 'error',
    code: 'INVALID_PAYLOAD',
  });
  assert.equal(invalidJsonCounters.decrypt, 0);
  assert.equal(invalidJsonCounters.onboarding, 0);
});

test('PAIR-I-CORE exact envelope shape delegates cryptographic authority to PAIR-C', async () => {
  const counters = { decrypt: 0, onboarding: 0 };
  const controller = makeController(JSON.stringify(exactEnvelope), counters);

  assert.deepEqual(await controller.poll('session-1'), {
    status: 'error',
    code: 'INVALID_PAYLOAD',
  });
  assert.equal(counters.decrypt, 1);
  assert.equal(counters.onboarding, 0);
});
