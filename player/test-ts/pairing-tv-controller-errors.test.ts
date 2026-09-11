import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PairingTvController,
  PairingTvError,
} from '../src/pairing/tv-controller.js';

test('PAIR-I-CORE start failures surface one fixed sanitized unavailable error', async () => {
  const controller = new PairingTvController({
    crypto: {
      async generateTvKeyPair() {
        throw new Error('https://secret.invalid/?username=alice&password=hunter2');
      },
      async decrypt() {
        throw new Error('unexpected decrypt');
      },
    },
    sessions: {
      create() {
        throw new Error('unexpected session create');
      },
      consume() {
        return { status: 'missing' };
      },
    },
    relay: {
      async createSession() {
        throw new Error('unexpected relay create');
      },
      async poll() {
        return { status: 'pending' };
      },
    },
    onboarding: {
      async connectXtream() {
        throw new Error('unexpected onboarding');
      },
      async connectM3u() {
        throw new Error('unexpected onboarding');
      },
    },
    relayBaseUrl: 'https://relay.example.invalid',
  });

  await assert.rejects(
    controller.start(),
    (error: unknown) =>
      error instanceof PairingTvError
      && error.code === 'UNAVAILABLE'
      && error.message === 'TV pairing is unavailable.'
      && !error.message.includes('secret')
      && !error.message.includes('alice')
      && !error.message.includes('hunter2'),
  );
});
