import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encryptForPairingTv } from '../src/pairing/crypto.js';
import { createTvPairingCore } from '../src/pairing/create-tv-pairing-core.js';
import { PairingRelayClient } from '../src/pairing/relay-client.js';
import { PairingSessionManager } from '../src/pairing/session.js';
import type { PairingRelayRequest, PairingRelayTransport } from '../src/pairing/relay-contracts.js';
import type { PairingTvOnboardingPort, PairingTvSessionValue } from '../src/pairing/tv-controller.js';

function makeRelay() {
  let ciphertext: string | undefined;
  const requests: PairingRelayRequest[] = [];
  const transport: PairingRelayTransport = {
    async request<T>(request: PairingRelayRequest): Promise<T> {
      requests.push(request);
      if (request.method === 'GET') {
        return (ciphertext === undefined
          ? { status: 'pending' }
          : { status: 'ready', ciphertext }) as T;
      }
      return undefined as T;
    },
  };

  return {
    relay: new PairingRelayClient('https://relay.example.invalid', transport, 5000),
    requests,
    setCiphertext(value: string) {
      ciphertext = value;
    },
  };
}

function onboarding(calls: unknown[]): PairingTvOnboardingPort {
  return {
    async connectXtream(input) {
      calls.push({ kind: 'xtream', input });
      return { providerId: 'xtream-created' };
    },
    async connectM3u(input) {
      calls.push({ kind: 'm3u', input });
      return { ok: true, providerId: 'm3u-created' };
    },
  };
}

test('PAIR-I-CORE factory wires existing crypto/session/relay modules into one single-use flow', async () => {
  const relayHarness = makeRelay();
  const onboardingCalls: unknown[] = [];
  const sessions = new PairingSessionManager<PairingTvSessionValue>({
    nowMs: () => 1000,
    makeSessionId: () => 'deterministic-session',
  });
  const controller = createTvPairingCore({
    relay: relayHarness.relay,
    relayBaseUrl: 'https://relay.example.invalid',
    onboarding: onboarding(onboardingCalls),
    sessions,
  });

  const bootstrap = await controller.start();
  assert.equal(bootstrap.sessionId, 'deterministic-session');
  assert.equal(bootstrap.expiresAtMs, 301000);
  assert.equal(bootstrap.relayBaseUrl, 'https://relay.example.invalid');
  assert.equal(relayHarness.requests.length, 1);
  assert.deepEqual(relayHarness.requests[0].body, {
    sessionId: 'deterministic-session',
    expiresAtMs: 301000,
  });

  const plaintext = new TextEncoder().encode(JSON.stringify({
    version: 1,
    credential: {
      kind: 'm3u',
      playlistUrl: 'https://playlist.example.invalid/list.m3u8',
    },
  }));
  const envelope = await encryptForPairingTv(bootstrap.tvPublicKey, plaintext);
  relayHarness.setCiphertext(JSON.stringify(envelope));

  assert.deepEqual(await controller.poll(bootstrap.sessionId), {
    status: 'completed',
    providerId: 'm3u-created',
  });
  assert.deepEqual(onboardingCalls, [{
    kind: 'm3u',
    input: { playlistUrl: 'https://playlist.example.invalid/list.m3u8' },
  }]);

  assert.deepEqual(await controller.poll(bootstrap.sessionId), { status: 'consumed' });
  assert.equal(onboardingCalls.length, 1);
});

test('PAIR-I-CORE factory creates a secure default session manager when none is supplied', async () => {
  const relayHarness = makeRelay();
  const controller = createTvPairingCore({
    relay: relayHarness.relay,
    relayBaseUrl: 'https://relay.example.invalid',
    onboarding: onboarding([]),
  });

  const bootstrap = await controller.start();
  assert.equal(typeof bootstrap.sessionId, 'string');
  assert.ok(bootstrap.sessionId.length > 0);
  assert.ok(bootstrap.expiresAtMs > Date.now());
});

test('PAIR-I-CORE factory source stays outside app, persistence, provider-core, and Live TV hot zones', () => {
  const source = readFileSync(
    new URL('../src/pairing/create-tv-pairing-core.ts', import.meta.url),
    'utf8',
  );

  for (const forbidden of [
    '../app/',
    '../credentials/',
    '../repository/',
    '../live-tv/',
    'CredentialStore',
    'ProviderRepository',
    'ProviderCoreService',
    'requestPlayback',
    'console.',
    'exportKey',
  ]) {
    assert.equal(source.includes(forbidden), false, `factory crossed forbidden boundary: ${forbidden}`);
  }
});
