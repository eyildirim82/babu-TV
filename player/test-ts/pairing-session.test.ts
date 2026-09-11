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

test('PAIR-S rejects generated ID collisions without overwriting the first session', () => {
  const manager = new PairingSessionManager<string>({
    nowMs: () => 1000,
    makeSessionId: () => 'duplicate-id',
  });

  manager.create('first-value');
  assert.throws(() => manager.create('second-value'));
  assert.deepEqual(manager.consume('duplicate-id'), { status: 'ok', value: 'first-value' });
});

test('PAIR-S consumes once, rejects replay, and expires at the exact boundary', () => {
  let now = 1000;
  let id = 0;
  const manager = new PairingSessionManager<string>({
    nowMs: () => now,
    makeSessionId: () => `session-${++id}`,
  });

  const first = manager.create('secret-handle', 100);
  assert.deepEqual(manager.consume(first.sessionId), { status: 'ok', value: 'secret-handle' });
  assert.deepEqual(manager.consume(first.sessionId), { status: 'consumed' });

  now = first.expiresAtMs - 1;
  assert.deepEqual(manager.consume(first.sessionId), { status: 'consumed' });
  now = first.expiresAtMs;
  assert.deepEqual(manager.consume(first.sessionId), { status: 'expired' });
  assert.deepEqual(manager.consume('missing'), { status: 'missing' });
});

test('PAIR-S isolates sessions and honors a custom positive TTL', () => {
  let now = 5000;
  let id = 0;
  const manager = new PairingSessionManager<{ handle: string }>({
    nowMs: () => now,
    makeSessionId: () => `session-${++id}`,
  });

  const firstValue = { handle: 'first' };
  const secondValue = { handle: 'second' };
  const first = manager.create(firstValue, 25);
  const second = manager.create(secondValue, 50);

  assert.equal(first.expiresAtMs, 5025);
  assert.equal(second.expiresAtMs, 5050);
  assert.deepEqual(manager.consume(first.sessionId), { status: 'ok', value: firstValue });
  assert.deepEqual(manager.consume(second.sessionId), { status: 'ok', value: secondValue });

  now = 5025;
  assert.deepEqual(manager.consume(first.sessionId), { status: 'expired' });
  assert.deepEqual(manager.consume(second.sessionId), { status: 'consumed' });
});

test('PAIR-S purgeExpired removes only expired entries and returns no session values', () => {
  let now = 1000;
  let id = 0;
  const manager = new PairingSessionManager<string>({
    nowMs: () => now,
    makeSessionId: () => `session-${++id}`,
  });

  const consumed = manager.create('consumed-value', 100);
  const live = manager.create('live-value', 200);
  assert.deepEqual(manager.consume(consumed.sessionId), { status: 'ok', value: 'consumed-value' });

  now = consumed.expiresAtMs - 1;
  assert.equal(manager.purgeExpired(), 0);
  assert.deepEqual(manager.consume(consumed.sessionId), { status: 'consumed' });

  now = consumed.expiresAtMs;
  assert.equal(manager.purgeExpired(), 1);
  assert.deepEqual(manager.consume(consumed.sessionId), { status: 'missing' });
  assert.deepEqual(manager.consume(live.sessionId), { status: 'ok', value: 'live-value' });

  now = live.expiresAtMs;
  assert.equal(manager.purgeExpired(), 1);
  assert.deepEqual(manager.consume(live.sessionId), { status: 'missing' });
});
