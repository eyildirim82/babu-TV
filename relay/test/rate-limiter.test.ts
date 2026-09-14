import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRelayRateLimiter } from '../src/memory-rate-limiter.js';
import { DEFAULT_RELAY_LIMITS } from '../src/limits.js';

test('RELAY-RATE defaults follow the design limits', () => {
  assert.deepEqual(DEFAULT_RELAY_LIMITS.rateLimits, {
    create: { limit: 10, windowMs: 60_000 },
    put: { limit: 20, windowMs: 60_000 },
    poll: { limit: 120, windowMs: 60_000 },
    miss: { limit: 30, windowMs: 600_000 },
  });
});

test('RELAY-RATE consume allows up to the limit per window, then reports Retry-After', async () => {
  const limiter = new MemoryRelayRateLimiter({ ...DEFAULT_RELAY_LIMITS.rateLimits, create: { limit: 2, windowMs: 1_000 } });
  assert.deepEqual(await limiter.consume('create', 'client-a', 0), { allowed: true });
  assert.deepEqual(await limiter.consume('create', 'client-a', 100), { allowed: true });
  assert.deepEqual(await limiter.consume('create', 'client-a', 250), { allowed: false, retryAfterSeconds: 1 });
  assert.deepEqual(await limiter.consume('create', 'client-a', 1_000), { allowed: true });
});

test('RELAY-RATE rounds Retry-After up to whole seconds', async () => {
  const limiter = new MemoryRelayRateLimiter({ ...DEFAULT_RELAY_LIMITS.rateLimits, miss: { limit: 1, windowMs: 600_000 } });
  await limiter.consume('miss', 'client-a', 0);
  assert.deepEqual(await limiter.consume('miss', 'client-a', 1_500), { allowed: false, retryAfterSeconds: 599 });
});

test('RELAY-RATE isolates clients and buckets', async () => {
  const limiter = new MemoryRelayRateLimiter({ ...DEFAULT_RELAY_LIMITS.rateLimits, put: { limit: 1, windowMs: 1_000 } });
  assert.equal((await limiter.consume('put', 'client-a', 0)).allowed, true);
  assert.equal((await limiter.consume('put', 'client-a', 1)).allowed, false);
  assert.equal((await limiter.consume('put', 'client-b', 1)).allowed, true);
  assert.equal((await limiter.consume('poll', 'client-a', 1)).allowed, true);
});

test('RELAY-RATE peek does not consume and reflects an exhausted bucket', async () => {
  const limiter = new MemoryRelayRateLimiter({ ...DEFAULT_RELAY_LIMITS.rateLimits, miss: { limit: 2, windowMs: 1_000 } });
  assert.deepEqual(await limiter.peek('miss', 'client-a', 0), { allowed: true });
  await limiter.consume('miss', 'client-a', 0);
  assert.deepEqual(await limiter.peek('miss', 'client-a', 1), { allowed: true });
  await limiter.consume('miss', 'client-a', 2);
  assert.deepEqual(await limiter.peek('miss', 'client-a', 3), { allowed: false, retryAfterSeconds: 1 });
});

test('RELAY-RATE a full key table evicts the oldest window instead of denying new clients', async () => {
  const limiter = new MemoryRelayRateLimiter({ ...DEFAULT_RELAY_LIMITS.rateLimits, create: { limit: 1, windowMs: 60_000 } }, 2);
  await limiter.consume('create', 'client-a', 0);
  await limiter.consume('create', 'client-b', 1);
  assert.equal((await limiter.consume('create', 'client-c', 2)).allowed, true);
  assert.equal(limiter.size(), 2);
  assert.equal((await limiter.consume('create', 'client-b', 3)).allowed, false);
  assert.equal((await limiter.consume('create', 'client-a', 4)).allowed, true);
});

test('RELAY-RATE purge forgets finished windows', async () => {
  const limiter = new MemoryRelayRateLimiter(DEFAULT_RELAY_LIMITS.rateLimits);
  await limiter.consume('create', 'client-a', 0);
  await limiter.consume('miss', 'client-a', 0);
  assert.equal(limiter.purge(60_000), 1);
  assert.equal(limiter.size(), 1);
});
