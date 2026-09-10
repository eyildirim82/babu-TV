import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAIRING_TTL_MS,
  PairingSessionManager,
} from '../src/pairing/session.js';

function withGlobalCrypto(value: unknown, run: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value });
  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'crypto', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'crypto');
    }
  }
}

test('PAIR-S creates a five-minute session through injected clock and id', () => {
  const manager = new PairingSessionManager<string>({
    nowMs: () => 1000,
    makeSessionId: () => 'session-1',
  });

  assert.deepEqual(manager.create('opaque-handle'), {
    sessionId: 'session-1',
    createdAtMs: 1000,
    expiresAtMs: 1000 + DEFAULT_PAIRING_TTL_MS,
  });
});

test('PAIR-S default IDs use exactly 128 secure random bits and Base64URL without padding', () => {
  let requestedBytes = 0;
  withGlobalCrypto({
    getRandomValues(array: Uint8Array): Uint8Array {
      requestedBytes = array.byteLength;
      array.forEach((_, index) => {
        array[index] = index;
      });
      return array;
    },
  }, () => {
    const manager = new PairingSessionManager<string>({ nowMs: () => 1000 });
    const descriptor = manager.create('opaque-value');

    assert.equal(requestedBytes, 16);
    assert.match(descriptor.sessionId, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(descriptor.sessionId.includes('='), false);
  });
});

test('PAIR-S fails closed when secure randomness is unavailable and never calls Math.random', () => {
  const originalRandom = Math.random;
  let mathRandomCalls = 0;
  Math.random = () => {
    mathRandomCalls += 1;
    return 0.5;
  };

  try {
    withGlobalCrypto(undefined, () => {
      const manager = new PairingSessionManager<string>({ nowMs: () => 1000 });
      assert.throws(
        () => manager.create('opaque-value'),
        new Error('Pairing session randomness is unavailable.'),
      );
    });
    assert.equal(mathRandomCalls, 0);
  } finally {
    Math.random = originalRandom;
  }
});

test('PAIR-S rejects invalid TTL and non-finite creation time', () => {
  let id = 0;
  const manager = new PairingSessionManager<string>({
    nowMs: () => 1000,
    makeSessionId: () => `session-${++id}`,
  });

  for (const ttlMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => manager.create('opaque-value', ttlMs));
  }

  const invalidClock = new PairingSessionManager<string>({
    nowMs: () => Number.NaN,
    makeSessionId: () => 'bad-time',
  });
  assert.throws(() => invalidClock.create('opaque-value'));
});

test('PAIR-S rejects generated ID collisions instead of overwriting an existing session', () => {
  const manager = new PairingSessionManager<string>({
    nowMs: () => 1000,
    makeSessionId: () => 'duplicate-id',
  });

  manager.create('first-value');
  assert.throws(() => manager.create('second-value'));
});
