import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelayCore, type RelayHttpRequest, type RelayHttpResponse } from '../src/relay-core.js';
import { MemoryRelaySessionStore } from '../src/memory-session-store.js';
import { MemoryRelayRateLimiter } from '../src/memory-rate-limiter.js';
import { DEFAULT_RELAY_LIMITS, type RelayLimits, type RelayRateLimitRules } from '../src/limits.js';

const SESSION = 'AbCdEfGhIjKlMnOpQrStUv';
const SESSIONS_PATH = '/v1/pairing/sessions';
const CIPHERTEXT_PATH = `/v1/pairing/sessions/${SESSION}/ciphertext`;

interface Harness {
  handle(request: Partial<RelayHttpRequest> & Pick<RelayHttpRequest, 'method' | 'path'>): Promise<RelayHttpResponse>;
  clock: { now: number };
}

function harness(options: { limits?: Partial<RelayLimits>; rateLimits?: Partial<RelayRateLimitRules>; basePath?: string } = {}): Harness {
  const clock = { now: 1_000_000 };
  const limits: RelayLimits = {
    ...DEFAULT_RELAY_LIMITS,
    ...options.limits,
    rateLimits: { ...DEFAULT_RELAY_LIMITS.rateLimits, ...options.rateLimits },
  };
  const core = createRelayCore({
    store: new MemoryRelaySessionStore(limits),
    rateLimiter: new MemoryRelayRateLimiter(limits.rateLimits),
    nowMs: () => clock.now,
    limits,
    basePath: options.basePath,
  });
  return {
    clock,
    handle: (request) => core.handle({ clientKey: 'client-a', body: null, ...request }),
  };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

async function createSession(h: Harness, sessionId = SESSION): Promise<RelayHttpResponse> {
  return h.handle({ method: 'POST', path: SESSIONS_PATH, body: json({ sessionId, expiresAtMs: 123 }) });
}

test('RELAY-CORE full pairing exchange follows the frozen client protocol', async () => {
  const h = harness();
  assert.equal((await createSession(h)).status, 204);

  const pending = await h.handle({ method: 'GET', path: CIPHERTEXT_PATH });
  assert.equal(pending.status, 200);
  assert.equal(pending.body, json({ status: 'pending' }));

  const put = await h.handle({ method: 'POST', path: CIPHERTEXT_PATH, body: json({ ciphertext: 'opaque' }) });
  assert.equal(put.status, 204);
  assert.equal(put.body, null);

  const ready = await h.handle({ method: 'GET', path: CIPHERTEXT_PATH });
  assert.equal(ready.status, 200);
  assert.equal(ready.body, json({ status: 'ready', ciphertext: 'opaque' }));

  const consumed = await h.handle({ method: 'GET', path: CIPHERTEXT_PATH });
  assert.equal(consumed.body, json({ status: 'consumed' }));
});

test('RELAY-CORE maps state conflicts to fixed HTTP statuses', async () => {
  const h = harness();
  await createSession(h);
  assert.equal((await createSession(h)).status, 409);
  await h.handle({ method: 'POST', path: CIPHERTEXT_PATH, body: json({ ciphertext: 'one' }) });
  assert.equal((await h.handle({ method: 'POST', path: CIPHERTEXT_PATH, body: json({ ciphertext: 'two' }) })).status, 409);

  h.clock.now += DEFAULT_RELAY_LIMITS.sessionTtlMs;
  const expired = await h.handle({ method: 'GET', path: CIPHERTEXT_PATH });
  assert.equal(expired.status, 200);
  assert.equal(expired.body, json({ status: 'expired' }));

  await createSession(h, 'OtherSessionAbcdefghij');
  h.clock.now += DEFAULT_RELAY_LIMITS.sessionTtlMs;
  const late = await h.handle({
    method: 'POST',
    path: '/v1/pairing/sessions/OtherSessionAbcdefghij/ciphertext',
    body: json({ ciphertext: 'late' }),
  });
  assert.equal(late.status, 410);
});

test('RELAY-CORE answers a client over its live-session cap with 429', async () => {
  const h = harness({ limits: { maxLiveSessionsPerClient: 1 } });
  assert.equal((await createSession(h)).status, 204);
  const limited = await createSession(h, 'SecondSessionAbcdefghi');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '300');
  h.clock.now += 200_000;
  assert.equal((await createSession(h, 'ThirdSessionAbcdefghij')).headers['retry-after'], '100');
  assert.equal(limited.body, json({ error: 'rate_limited' }));
  const other = await h.handle({
    method: 'POST',
    path: SESSIONS_PATH,
    clientKey: 'client-b',
    body: json({ sessionId: 'SecondSessionAbcdefghi', expiresAtMs: 1 }),
  });
  assert.equal(other.status, 204);
});

test('RELAY-CORE accepts a phone retry that repeats the same ciphertext', async () => {
  const h = harness();
  await createSession(h);
  const body = json({ ciphertext: 'same-envelope' });
  assert.equal((await h.handle({ method: 'POST', path: CIPHERTEXT_PATH, body })).status, 204);
  assert.equal((await h.handle({ method: 'POST', path: CIPHERTEXT_PATH, body })).status, 204);
  const ready = await h.handle({ method: 'GET', path: CIPHERTEXT_PATH });
  assert.equal(ready.body, json({ status: 'ready', ciphertext: 'same-envelope' }));
});

test('RELAY-CORE answers 503 when the ciphertext memory budget is exhausted', async () => {
  const h = harness({ limits: { maxRetainedCiphertextChars: 5 } });
  await createSession(h);
  const response = await h.handle({ method: 'POST', path: CIPHERTEXT_PATH, body: json({ ciphertext: '123456' }) });
  assert.equal(response.status, 503);
  assert.equal(response.body, json({ error: 'unavailable' }));
  assert.equal((await h.handle({ method: 'GET', path: CIPHERTEXT_PATH })).body, json({ status: 'pending' }));
});

test('RELAY-CORE returns 404 for unknown sessions and 503 when the store is full', async () => {
  const h = harness({ limits: { maxSessions: 1 } });
  assert.equal((await h.handle({ method: 'GET', path: CIPHERTEXT_PATH })).status, 404);
  assert.equal((await h.handle({ method: 'POST', path: CIPHERTEXT_PATH, body: json({ ciphertext: 'x' }) })).status, 404);
  assert.equal((await createSession(h)).status, 204);
  assert.equal((await createSession(h, 'SecondSessionAbcdefghi')).status, 503);
});

test('RELAY-CORE validates bodies strictly and never trusts the client expiry', async () => {
  // Rate limiting runs before body parsing, so this many requests need a wider create bucket.
  const h = harness({ rateLimits: { create: { limit: 100, windowMs: 60_000 } } });
  const bad: Array<string | null> = [
    null,
    '',
    'not-json',
    '[]',
    'null',
    json({ sessionId: SESSION }),
    json({ sessionId: SESSION, expiresAtMs: 'soon' }),
    json({ sessionId: SESSION, expiresAtMs: 1, provider: 'x' }),
    json({ sessionId: 'short', expiresAtMs: 1 }),
    json({ sessionId: 'has spaces in the identifier', expiresAtMs: 1 }),
    json({ sessionId: 'x'.repeat(65), expiresAtMs: 1 }),
  ];
  for (const body of bad) {
    const response = await h.handle({ method: 'POST', path: SESSIONS_PATH, body });
    assert.equal(response.status, 400, `create body ${String(body)}`);
    assert.equal(response.body, json({ error: 'bad_request' }));
  }

  const farPast = await h.handle({ method: 'POST', path: SESSIONS_PATH, body: json({ sessionId: SESSION, expiresAtMs: 0 }) });
  assert.equal(farPast.status, 204);
  const stillPending = await h.handle({ method: 'GET', path: CIPHERTEXT_PATH });
  assert.equal(stillPending.body, json({ status: 'pending' }));

  const badPut: Array<string | null> = [
    null,
    json({}),
    json({ ciphertext: '' }),
    json({ ciphertext: 42 }),
    json({ ciphertext: 'x', sessionId: SESSION }),
    json({ ciphertext: 'x'.repeat(DEFAULT_RELAY_LIMITS.maxCiphertextLength + 1) }),
  ];
  for (const body of badPut) {
    const response = await h.handle({ method: 'POST', path: CIPHERTEXT_PATH, body });
    assert.equal(response.status, 400, `put body ${String(body).slice(0, 40)}`);
  }
  assert.equal(
    (await h.handle({ method: 'POST', path: CIPHERTEXT_PATH, body: json({ ciphertext: 'x'.repeat(DEFAULT_RELAY_LIMITS.maxCiphertextLength) }) })).status,
    204,
  );
});

test('RELAY-CORE rejects oversized bodies with 413', async () => {
  const h = harness({ limits: { maxBodyBytes: 64 } });
  const response = await h.handle({ method: 'POST', path: SESSIONS_PATH, body: json({ sessionId: SESSION, expiresAtMs: 1, pad: 'ü'.repeat(40) }) });
  assert.equal(response.status, 413);
  assert.equal(response.body, json({ error: 'payload_too_large' }));
});

test('RELAY-CORE routes: unknown paths 404, wrong methods 405, preflight 204', async () => {
  const h = harness();
  assert.equal((await h.handle({ method: 'GET', path: '/' })).status, 404);
  assert.equal((await h.handle({ method: 'GET', path: '/v1/pairing/sessions/extra/segments/here' })).status, 404);
  assert.equal((await h.handle({ method: 'GET', path: SESSIONS_PATH })).status, 405);
  assert.equal((await h.handle({ method: 'DELETE', path: CIPHERTEXT_PATH })).status, 405);

  const preflight = await h.handle({ method: 'OPTIONS', path: CIPHERTEXT_PATH });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
  assert.equal(preflight.headers['access-control-allow-headers'], 'Content-Type');
  assert.equal(preflight.headers['access-control-max-age'], '600');
});

test('RELAY-CORE supports an operator base path', async () => {
  const h = harness({ basePath: '/relay/' });
  assert.equal((await h.handle({ method: 'POST', path: '/relay/v1/pairing/sessions', body: json({ sessionId: SESSION, expiresAtMs: 1 }) })).status, 204);
  assert.equal((await h.handle({ method: 'GET', path: `/relay${CIPHERTEXT_PATH}` })).status, 200);
  assert.equal((await h.handle({ method: 'GET', path: CIPHERTEXT_PATH })).status, 404);
});

test('RELAY-CORE sets privacy, cache and CORS headers on every response', async () => {
  const h = harness();
  const responses = [
    await createSession(h),
    await h.handle({ method: 'GET', path: CIPHERTEXT_PATH }),
    await h.handle({ method: 'GET', path: '/nope' }),
    await h.handle({ method: 'POST', path: SESSIONS_PATH, body: 'bad' }),
  ];
  for (const response of responses) {
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.equal(response.headers['access-control-allow-origin'], '*');
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
    if (response.body !== null) {
      assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
    }
  }
});

test('RELAY-CORE rate limits each bucket with 429 and Retry-After', async () => {
  const h = harness({ rateLimits: { create: { limit: 1, windowMs: 60_000 }, poll: { limit: 1, windowMs: 60_000 } } });
  assert.equal((await createSession(h)).status, 204);
  const limited = await createSession(h, 'AnotherSessionAbcdefgh');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '60');
  assert.equal(limited.body, json({ error: 'rate_limited' }));

  assert.equal((await h.handle({ method: 'GET', path: CIPHERTEXT_PATH })).status, 200);
  assert.equal((await h.handle({ method: 'GET', path: CIPHERTEXT_PATH })).status, 429);
  const otherClient = await h.handle({ method: 'GET', path: CIPHERTEXT_PATH, clientKey: 'client-b' });
  assert.equal(otherClient.status, 200);
});

test('RELAY-CORE throttles session-ID probing through the miss bucket', async () => {
  const h = harness({ rateLimits: { miss: { limit: 2, windowMs: 600_000 } } });
  await createSession(h);
  assert.equal((await h.handle({ method: 'GET', path: '/v1/pairing/sessions/UnknownSessionAbcdefgh/ciphertext' })).status, 404);
  assert.equal((await h.handle({ method: 'GET', path: '/v1/pairing/sessions/bad%20id/ciphertext' })).status, 404);
  const blocked = await h.handle({ method: 'GET', path: CIPHERTEXT_PATH });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['retry-after'], '600');
  assert.equal((await h.handle({ method: 'GET', path: CIPHERTEXT_PATH, clientKey: 'client-b' })).status, 200);
});

test('RELAY-CORE error bodies never echo request data', async () => {
  const h = harness();
  const secret = 'provider-password-canary';
  const responses = [
    await h.handle({ method: 'POST', path: SESSIONS_PATH, body: json({ sessionId: secret, expiresAtMs: secret }) }),
    await h.handle({ method: 'POST', path: `/v1/pairing/sessions/${secret}-xxxxxxxx/ciphertext`, body: json({ ciphertext: secret }) }),
    await h.handle({ method: 'GET', path: `/${secret}` }),
  ];
  for (const response of responses) {
    assert.equal(JSON.stringify(response).includes(secret), false);
  }
});

test('RELAY-CORE converts store failures into a fixed 500', async () => {
  const core = createRelayCore({
    store: {
      create: async () => { throw new Error('store exploded with provider-password-canary'); },
      put: async () => 'missing' as const,
      take: async () => ({ kind: 'missing' }),
    },
    rateLimiter: new MemoryRelayRateLimiter(DEFAULT_RELAY_LIMITS.rateLimits),
    nowMs: () => 0,
  });
  const response = await core.handle({ method: 'POST', path: SESSIONS_PATH, clientKey: 'c', body: json({ sessionId: SESSION, expiresAtMs: 1 }) });
  assert.equal(response.status, 500);
  assert.equal(response.body, json({ error: 'internal' }));
});
