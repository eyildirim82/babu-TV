import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAIRING_TTL_MS,
  PairingSessionManager,
} from '../src/pairing/session.js';

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
