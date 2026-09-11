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
const envelope = JSON.stringify({
  version: 1,
  algorithm: 'ECDH-P256+A256GCM',
  senderPublicKey,
  iv: 'opaque-iv',
  ciphertext: 'opaque-ciphertext',
});

function makeController(
  decryptedPayload: unknown,
  options: {
    consume?: () => { status: 'ok'; value: { privateKey: CryptoKey } } | { status: 'consumed' };
    connectXtream?: (input: { serverUrl: string; username: string; password: string }) => Promise<{ providerId: string }>;
    connectM3u?: (input: { playlistUrl: string }) => Promise<{ ok: true; providerId: string } | { ok: false }>;
  } = {},
) {
  return new PairingTvController({
    crypto: {
      async generateTvKeyPair() {
        throw new Error('unexpected key generation');
      },
      async decrypt() {
        return new TextEncoder().encode(JSON.stringify(decryptedPayload));
      },
    },
    sessions: {
      create() {
        throw new Error('unexpected session create');
      },
      consume: options.consume ?? (() => ({ status: 'ok', value: { privateKey } })),
    },
    relay: {
      async createSession() {
        throw new Error('unexpected relay create');
      },
      async poll() {
        return { status: 'ready', ciphertext: envelope };
      },
    },
    onboarding: {
      connectXtream: options.connectXtream ?? (async () => {
        throw new Error('unexpected Xtream onboarding');
      }),
      connectM3u: options.connectM3u ?? (async () => {
        throw new Error('unexpected M3U onboarding');
      }),
    },
    relayBaseUrl: 'https://relay.example.invalid',
  });
}

test('PAIR-I-CORE dispatches strict Xtream payload only through existing onboarding authority', async () => {
  const calls: unknown[] = [];
  const controller = makeController(
    {
      version: 1,
      credential: {
        kind: 'xtream',
        serverUrl: 'https://iptv.example.invalid',
        username: 'alice',
        password: 'secret',
      },
    },
    {
      async connectXtream(input) {
        calls.push(input);
        return { providerId: 'xtream-created' };
      },
    },
  );

  assert.deepEqual(await controller.poll('session-1'), {
    status: 'completed',
    providerId: 'xtream-created',
  });
  assert.deepEqual(calls, [{
    serverUrl: 'https://iptv.example.invalid',
    username: 'alice',
    password: 'secret',
  }]);
});

test('PAIR-I-CORE dispatches strict M3U payload only through existing onboarding authority', async () => {
  const calls: unknown[] = [];
  const controller = makeController(
    {
      version: 1,
      credential: {
        kind: 'm3u',
        playlistUrl: 'https://playlist.example.invalid/list.m3u8',
      },
    },
    {
      async connectM3u(input) {
        calls.push(input);
        return { ok: true, providerId: 'm3u-created' };
      },
    },
  );

  assert.deepEqual(await controller.poll('session-1'), {
    status: 'completed',
    providerId: 'm3u-created',
  });
  assert.deepEqual(calls, [{ playlistUrl: 'https://playlist.example.invalid/list.m3u8' }]);
});

test('PAIR-I-CORE uses the existing strict PAIR-WEB provider payload decoder before onboarding', async () => {
  for (const malformed of [
    {
      version: 1,
      credential: {
        kind: 'xtream',
        serverUrl: 'https://iptv.example.invalid',
        username: 'alice',
        password: 'secret',
        extra: true,
      },
    },
    {
      version: 1,
      credential: {
        kind: 'unknown',
        value: 'secret',
      },
    },
    {
      version: 1,
      credential: {
        kind: 'm3u',
      },
    },
  ]) {
    let onboardingCalls = 0;
    const controller = makeController(malformed, {
      async connectXtream() {
        onboardingCalls += 1;
        return { providerId: 'unexpected' };
      },
      async connectM3u() {
        onboardingCalls += 1;
        return { ok: true, providerId: 'unexpected' };
      },
    });

    assert.deepEqual(await controller.poll('session-1'), {
      status: 'error',
      code: 'INVALID_PAYLOAD',
    });
    assert.equal(onboardingCalls, 0);
  }
});

test('PAIR-I-CORE sanitizes onboarding failures without echoing credentials or caught text', async () => {
  const xtream = makeController(
    {
      version: 1,
      credential: {
        kind: 'xtream',
        serverUrl: 'https://iptv.example.invalid',
        username: 'alice',
        password: 'hunter2',
      },
    },
    {
      async connectXtream() {
        throw new Error('https://secret.invalid/?username=alice&password=hunter2');
      },
    },
  );
  assert.deepEqual(await xtream.poll('session-1'), {
    status: 'error',
    code: 'UNAVAILABLE',
  });

  const m3u = makeController(
    {
      version: 1,
      credential: {
        kind: 'm3u',
        playlistUrl: 'https://playlist.example.invalid/?token=secret',
      },
    },
    {
      async connectM3u() {
        return { ok: false };
      },
    },
  );
  assert.deepEqual(await m3u.poll('session-1'), {
    status: 'error',
    code: 'UNAVAILABLE',
  });
});

test('PAIR-I-CORE consumed session cannot dispatch onboarding twice', async () => {
  let consumed = false;
  let onboardingCalls = 0;
  const controller = makeController(
    {
      version: 1,
      credential: {
        kind: 'm3u',
        playlistUrl: 'https://playlist.example.invalid/list.m3u8',
      },
    },
    {
      consume() {
        if (consumed) return { status: 'consumed' };
        consumed = true;
        return { status: 'ok', value: { privateKey } };
      },
      async connectM3u() {
        onboardingCalls += 1;
        return { ok: true, providerId: 'm3u-created' };
      },
    },
  );

  assert.deepEqual(await controller.poll('session-1'), {
    status: 'completed',
    providerId: 'm3u-created',
  });
  assert.deepEqual(await controller.poll('session-1'), { status: 'consumed' });
  assert.equal(onboardingCalls, 1);
});
