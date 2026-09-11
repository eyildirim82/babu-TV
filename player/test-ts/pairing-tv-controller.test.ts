import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PairingTvController,
  type PairingTvCryptoPort,
  type PairingTvOnboardingPort,
  type PairingTvRelayPort,
  type PairingTvSessionPort,
} from '../src/pairing/tv-controller.js';

const publicKey: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'synthetic-x',
  y: 'synthetic-y',
};

const privateKey = { extractable: false } as CryptoKey;

function unusedOnboarding(): PairingTvOnboardingPort {
  return {
    async connectXtream() {
      throw new Error('unexpected Xtream onboarding');
    },
    async connectM3u() {
      throw new Error('unexpected M3U onboarding');
    },
  };
}

test('PAIR-I-CORE start creates one memory-only session then exposes exact public bootstrap', async () => {
  const events: string[] = [];
  const crypto: PairingTvCryptoPort = {
    async generateTvKeyPair() {
      events.push('crypto:generate');
      return { publicKey, privateKey };
    },
    async decrypt() {
      throw new Error('unexpected decrypt');
    },
  };
  const sessions: PairingTvSessionPort<{ privateKey: CryptoKey }> = {
    create(value) {
      events.push('session:create');
      assert.equal(value.privateKey, privateKey);
      return { sessionId: 'session-1', createdAtMs: 100, expiresAtMs: 400 };
    },
    consume() {
      throw new Error('unexpected consume');
    },
  };
  const relay: PairingTvRelayPort = {
    async createSession(request) {
      events.push('relay:create');
      assert.deepEqual(request, { sessionId: 'session-1', expiresAtMs: 400 });
    },
    async poll() {
      throw new Error('unexpected poll');
    },
  };

  const controller = new PairingTvController({
    crypto,
    sessions,
    relay,
    onboarding: unusedOnboarding(),
    relayBaseUrl: 'https://relay.example.invalid',
  });

  const bootstrap = await controller.start();

  assert.deepEqual(events, ['crypto:generate', 'session:create', 'relay:create']);
  assert.deepEqual(Object.keys(bootstrap), [
    'version',
    'sessionId',
    'expiresAtMs',
    'tvPublicKey',
    'relayBaseUrl',
  ]);
  assert.deepEqual(bootstrap, {
    version: 1,
    sessionId: 'session-1',
    expiresAtMs: 400,
    tvPublicKey: publicKey,
    relayBaseUrl: 'https://relay.example.invalid',
  });

  const serialized = JSON.stringify(bootstrap);
  for (const forbidden of [
    'privateKey',
    'credential',
    'username',
    'password',
    'playlistUrl',
    'serverUrl',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `bootstrap leaked ${forbidden}`);
  }
});

test('PAIR-I-CORE pending poll does not consume, decrypt, or onboard', async () => {
  let consumeCalls = 0;
  let decryptCalls = 0;
  let onboardingCalls = 0;
  const controller = new PairingTvController({
    crypto: {
      async generateTvKeyPair() { return { publicKey, privateKey }; },
      async decrypt() {
        decryptCalls += 1;
        return new Uint8Array();
      },
    },
    sessions: {
      create() { return { sessionId: 'session-1', createdAtMs: 100, expiresAtMs: 400 }; },
      consume() {
        consumeCalls += 1;
        return { status: 'missing' };
      },
    },
    relay: {
      async createSession() {},
      async poll() { return { status: 'pending' }; },
    },
    onboarding: {
      async connectXtream() { onboardingCalls += 1; return { providerId: 'x' }; },
      async connectM3u() { onboardingCalls += 1; return { ok: true, providerId: 'm' }; },
    },
    relayBaseUrl: 'https://relay.example.invalid',
  });

  assert.deepEqual(await controller.poll('session-1'), { status: 'pending' });
  assert.equal(consumeCalls, 0);
  assert.equal(decryptCalls, 0);
  assert.equal(onboardingCalls, 0);
});

test('PAIR-I-CORE relay expired/consumed terminal states do not touch secrets or onboarding', async () => {
  for (const terminal of ['expired', 'consumed'] as const) {
    let consumeCalls = 0;
    let decryptCalls = 0;
    let onboardingCalls = 0;
    const controller = new PairingTvController({
      crypto: {
        async generateTvKeyPair() { return { publicKey, privateKey }; },
        async decrypt() {
          decryptCalls += 1;
          return new Uint8Array();
        },
      },
      sessions: {
        create() { return { sessionId: 'session-1', createdAtMs: 100, expiresAtMs: 400 }; },
        consume() {
          consumeCalls += 1;
          return { status: 'missing' };
        },
      },
      relay: {
        async createSession() {},
        async poll() { return { status: terminal }; },
      },
      onboarding: {
        async connectXtream() { onboardingCalls += 1; return { providerId: 'x' }; },
        async connectM3u() { onboardingCalls += 1; return { ok: true, providerId: 'm' }; },
      },
      relayBaseUrl: 'https://relay.example.invalid',
    });

    assert.deepEqual(await controller.poll('session-1'), { status: terminal });
    assert.equal(consumeCalls, 0);
    assert.equal(decryptCalls, 0);
    assert.equal(onboardingCalls, 0);
  }
});

test('PAIR-I-CORE ready poll consumes the session before ciphertext processing', async () => {
  const events: string[] = [];
  const sessions: PairingTvSessionPort<{ privateKey: CryptoKey }> = {
    create() { return { sessionId: 'session-1', createdAtMs: 100, expiresAtMs: 400 }; },
    consume() {
      events.push('session:consume');
      return { status: 'ok', value: { privateKey } };
    },
  };
  const crypto: PairingTvCryptoPort = {
    async generateTvKeyPair() { return { publicKey, privateKey }; },
    async decrypt() {
      events.push('crypto:decrypt');
      throw new Error('synthetic crypto failure');
    },
  };
  const relay: PairingTvRelayPort = {
    async createSession() {},
    async poll() {
      events.push('relay:poll');
      return {
        status: 'ready',
        ciphertext: JSON.stringify({
          version: 1,
          algorithm: 'ECDH-P256+A256GCM',
          senderPublicKey: publicKey,
          iv: 'opaque-iv',
          ciphertext: 'opaque-ciphertext',
        }),
      };
    },
  };

  const controller = new PairingTvController({
    crypto,
    sessions,
    relay,
    onboarding: unusedOnboarding(),
    relayBaseUrl: 'https://relay.example.invalid',
  });

  assert.deepEqual(await controller.poll('session-1'), {
    status: 'error',
    code: 'INVALID_PAYLOAD',
  });
  assert.deepEqual(events.slice(0, 2), ['relay:poll', 'session:consume']);
});

test('PAIR-I-CORE a second ready result for the same session cannot onboard again', async () => {
  let consumed = false;
  let onboardingCalls = 0;
  const controller = new PairingTvController({
    crypto: {
      async generateTvKeyPair() { return { publicKey, privateKey }; },
      async decrypt() {
        return new TextEncoder().encode(JSON.stringify({
          version: 1,
          credential: { kind: 'm3u', playlistUrl: 'https://playlist.example.invalid/list.m3u8' },
        }));
      },
    },
    sessions: {
      create() { return { sessionId: 'session-1', createdAtMs: 100, expiresAtMs: 400 }; },
      consume() {
        if (consumed) return { status: 'consumed' };
        consumed = true;
        return { status: 'ok', value: { privateKey } };
      },
    },
    relay: {
      async createSession() {},
      async poll() {
        return {
          status: 'ready',
          ciphertext: JSON.stringify({
            version: 1,
            algorithm: 'ECDH-P256+A256GCM',
            senderPublicKey: publicKey,
            iv: 'opaque-iv',
            ciphertext: 'opaque-ciphertext',
          }),
        };
      },
    },
    onboarding: {
      async connectXtream() {
        onboardingCalls += 1;
        return { providerId: 'xtream-created' };
      },
      async connectM3u() {
        onboardingCalls += 1;
        return { ok: true, providerId: 'm3u-created' };
      },
    },
    relayBaseUrl: 'https://relay.example.invalid',
  });

  await controller.poll('session-1');
  assert.deepEqual(await controller.poll('session-1'), { status: 'consumed' });
  assert.ok(onboardingCalls <= 1);
});
