import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRelaySessionStore } from '../src/memory-session-store.js';
import { DEFAULT_RELAY_LIMITS, type RelayLimits } from '../src/limits.js';

const TTL = DEFAULT_RELAY_LIMITS.sessionTtlMs;
const GRACE = DEFAULT_RELAY_LIMITS.tombstoneGraceMs;
const CLIENT = 'client-a';

function store(overrides: Partial<RelayLimits> = {}): MemoryRelaySessionStore {
  return new MemoryRelaySessionStore({ ...DEFAULT_RELAY_LIMITS, ...overrides });
}

test('RELAY-STORE defaults match the V1 five-minute pairing TTL and bound memory', () => {
  assert.equal(TTL, 5 * 60 * 1000);
  assert.equal(GRACE, 10 * 60 * 1000);
  assert.equal(DEFAULT_RELAY_LIMITS.maxSessions, 50_000);
  assert.equal(DEFAULT_RELAY_LIMITS.maxLiveSessionsPerClient, 10);
  assert.equal(DEFAULT_RELAY_LIMITS.maxTombstones, 20_000);
});

test('RELAY-STORE create, put and take deliver the ciphertext exactly once', async () => {
  const s = store();
  assert.deepEqual(await s.create('session-aaaaaaaaaa', CLIENT, 1_000), { outcome: 'created' });
  assert.deepEqual(await s.take('session-aaaaaaaaaa', 1_001), { kind: 'pending' });
  assert.equal(await s.put('session-aaaaaaaaaa', 'opaque', 1_002), 'stored');
  assert.deepEqual(await s.take('session-aaaaaaaaaa', 1_003), { kind: 'ready', ciphertext: 'opaque' });
  assert.deepEqual(await s.take('session-aaaaaaaaaa', 1_004), { kind: 'consumed' });
  assert.deepEqual(await s.take('session-aaaaaaaaaa', 1_005), { kind: 'consumed' });
});

test('RELAY-STORE never overwrites an existing session', async () => {
  const s = store();
  assert.deepEqual(await s.create('session-bbbbbbbbbb', CLIENT, 0), { outcome: 'created' });
  assert.equal(await s.put('session-bbbbbbbbbb', 'first', 1), 'stored');
  assert.deepEqual(await s.create('session-bbbbbbbbbb', 'client-b', 2), { outcome: 'exists' });
  assert.deepEqual(await s.take('session-bbbbbbbbbb', 3), { kind: 'ready', ciphertext: 'first' });
  assert.deepEqual(await s.create('session-bbbbbbbbbb', CLIENT, 4), { outcome: 'exists' });
});

test('RELAY-STORE treats an identical retried put as stored and rejects different or late puts', async () => {
  const s = store();
  await s.create('session-cccccccccc', CLIENT, 0);
  assert.equal(await s.put('session-cccccccccc', 'first', 1), 'stored');
  assert.equal(await s.put('session-cccccccccc', 'first', 2), 'stored');
  assert.equal(await s.put('session-cccccccccc', 'second', 2), 'conflict');
  await s.take('session-cccccccccc', 3);
  assert.equal(await s.put('session-cccccccccc', 'first', 4), 'conflict');
});

test('RELAY-STORE reports missing sessions', async () => {
  const s = store();
  assert.equal(await s.put('session-missing000', 'x', 0), 'missing');
  assert.deepEqual(await s.take('session-missing000', 0), { kind: 'missing' });
});

test('RELAY-STORE uses a server-owned TTL and expires pending and ready sessions', async () => {
  const s = store();
  await s.create('session-pending000', CLIENT, 0);
  await s.create('session-ready00000', CLIENT, 0);
  await s.put('session-ready00000', 'opaque', 1);

  assert.deepEqual(await s.take('session-pending000', TTL - 1), { kind: 'pending' });
  assert.deepEqual(await s.take('session-pending000', TTL), { kind: 'expired' });
  assert.equal(await s.put('session-pending000', 'late', TTL), 'expired');
  assert.deepEqual(await s.take('session-ready00000', TTL), { kind: 'expired' });
  assert.deepEqual(await s.take('session-ready00000', TTL + 1), { kind: 'expired' });
});

test('RELAY-STORE drops ciphertext on expiry and on consumption', async () => {
  const s = store();
  await s.create('session-expire0000', CLIENT, 0);
  await s.put('session-expire0000', 'secret-ciphertext-a', 1);
  await s.create('session-consume000', CLIENT, 0);
  await s.put('session-consume000', 'secret-ciphertext-b', 1);

  await s.take('session-expire0000', TTL);
  await s.take('session-consume000', 2);

  assert.equal(s.debugRetainedCiphertextCount(), 0);
});

test('RELAY-STORE purge drops expired ciphertext even when nobody polls again', async () => {
  const s = store();
  await s.create('session-abandoned0', CLIENT, 0);
  await s.put('session-abandoned0', 'secret-ciphertext', 1);

  s.purge(TTL - 1);
  assert.equal(s.debugRetainedCiphertextCount(), 1);
  s.purge(TTL);
  assert.equal(s.debugRetainedCiphertextCount(), 0);
  assert.equal(s.liveCount(), 0);
  assert.deepEqual(await s.take('session-abandoned0', TTL + 1), { kind: 'expired' });
});

test('RELAY-STORE keeps status-only tombstones for the grace window, then forgets them', async () => {
  const s = store();
  await s.create('session-tomb000000', CLIENT, 0);
  await s.create('session-used000000', CLIENT, 0);
  await s.put('session-used000000', 'opaque', 1);
  await s.take('session-used000000', 10);

  assert.deepEqual(await s.take('session-tomb000000', TTL + GRACE - 1), { kind: 'expired' });
  assert.deepEqual(await s.take('session-tomb000000', TTL + GRACE), { kind: 'missing' });
  assert.deepEqual(await s.take('session-used000000', 10 + GRACE - 1), { kind: 'consumed' });
  assert.deepEqual(await s.take('session-used000000', 10 + GRACE), { kind: 'missing' });
});

test('RELAY-STORE purge forgets tombstones past retention and reports how many', async () => {
  const s = store();
  await s.create('session-old0000000', CLIENT, 0);
  await s.create('session-new0000000', CLIENT, TTL + GRACE);
  assert.equal(s.purge(TTL + GRACE), 1);
  assert.equal(s.liveCount(), 1);
  assert.equal(s.tombstoneCount(), 0);
});

test('RELAY-STORE live capacity excludes tombstones and recovers when sessions expire', async () => {
  const s = store({ maxSessions: 2 });
  assert.deepEqual(await s.create('session-one0000000', 'client-a', 0), { outcome: 'created' });
  assert.deepEqual(await s.create('session-two0000000', 'client-b', 0), { outcome: 'created' });
  assert.deepEqual(await s.create('session-three00000', 'client-c', 1), { outcome: 'full' });

  await s.put('session-one0000000', 'x', 2);
  await s.take('session-one0000000', 3);
  assert.equal(s.tombstoneCount(), 1);
  assert.deepEqual(await s.create('session-three00000', 'client-c', 4), { outcome: 'created' });

  assert.deepEqual(await s.create('session-four000000', 'client-d', 5), { outcome: 'full' });
  assert.deepEqual(await s.create('session-four000000', 'client-d', TTL), { outcome: 'created' });
});

test('RELAY-STORE caps live sessions per client and frees slots on consumption or expiry', async () => {
  const s = store({ maxLiveSessionsPerClient: 2 });
  assert.deepEqual(await s.create('session-client-a01', CLIENT, 0), { outcome: 'created' });
  assert.deepEqual(await s.create('session-client-a02', CLIENT, 0), { outcome: 'created' });
  assert.deepEqual(await s.create('session-client-a03', CLIENT, 1), { outcome: 'client_limit', retryAfterMs: TTL - 1 });
  assert.deepEqual(await s.create('session-client-b01', 'client-b', 1), { outcome: 'created' });

  await s.put('session-client-a01', 'x', 2);
  await s.take('session-client-a01', 3);
  assert.deepEqual(await s.create('session-client-a03', CLIENT, 4), { outcome: 'created' });
  assert.deepEqual(await s.create('session-client-a04', CLIENT, 5), { outcome: 'client_limit', retryAfterMs: TTL - 5 });
  assert.deepEqual(await s.create('session-client-a04', CLIENT, TTL), { outcome: 'created' });
});

test('RELAY-STORE bounds tombstones by evicting the oldest first', async () => {
  const s = store({ maxTombstones: 2 });
  for (const id of ['session-tomb-one00', 'session-tomb-two00', 'session-tomb-three']) {
    await s.create(id, CLIENT, 0);
    await s.put(id, 'x', 1);
    await s.take(id, 2);
  }
  assert.equal(s.tombstoneCount(), 2);
  assert.deepEqual(await s.take('session-tomb-one00', 3), { kind: 'missing' });
  assert.deepEqual(await s.take('session-tomb-three', 3), { kind: 'consumed' });
});

test('RELAY-STORE purge after many sessions still expires everything that is due', async () => {
  const s = store();
  for (let index = 0; index < 50; index += 1) {
    const id = `session-bulk-${String(index).padStart(6, '0')}`;
    await s.create(id, `client-${index}`, index);
    await s.put(id, 'secret', index);
  }
  s.purge(TTL + 24);
  assert.equal(s.liveCount(), 25);
  assert.equal(s.debugRetainedCiphertextCount(), 25);
  s.purge(TTL + 49);
  assert.equal(s.liveCount(), 0);
});

test('RELAY-STORE keeps counting a client whose old sessions were swept by a store-full create', async () => {
  const s = store({ maxSessions: 2, maxLiveSessionsPerClient: 2 });
  assert.deepEqual(await s.create('session-client-x01', 'client-x', 0), { outcome: 'created' });
  assert.deepEqual(await s.create('session-client-y01', 'client-y', 0), { outcome: 'created' });
  // Client x is under its cap, the store is full, and the sweep retires x01 before x02 is recorded.
  assert.deepEqual(await s.create('session-client-x02', 'client-x', TTL), { outcome: 'created' });
  assert.deepEqual(await s.create('session-client-x03', 'client-x', TTL + 1), { outcome: 'created' });
  assert.deepEqual(await s.create('session-client-x04', 'client-x', TTL + 2), { outcome: 'client_limit', retryAfterMs: TTL - 2 });
});
