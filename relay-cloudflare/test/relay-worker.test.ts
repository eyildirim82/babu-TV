import { env, evictAllDurableObjects, evictDurableObject, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { PairingRelayClient } from '../../player/src/pairing/relay-client.js';
import { FetchPairingRelayTransport } from '../../player/src/pairing/fetch-relay-transport.js';
import { DEFAULT_RELAY_LIMITS } from '../../relay/src/limits.js';
import type { MemoryRelaySessionStore } from '../../relay/src/memory-session-store.js';
import type { RelayShard } from '../src/relay-shard.js';
import { CLOUDFLARE_RATE_LIMIT_MAX_KEYS, CLOUDFLARE_RELAY_LIMITS } from '../src/limits.js';

const BASE = 'https://relay.example.invalid';
const SESSIONS = `${BASE}/v1/pairing/sessions`;
const TTL = DEFAULT_RELAY_LIMITS.sessionTtlMs;

function ciphertextUrl(sessionId: string): string {
  return `${SESSIONS}/${sessionId}/ciphertext`;
}

function post(url: string, body: unknown, clientIp: string, headers: Record<string, string> = {}): Promise<Response> {
  return SELF.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': clientIp, ...headers },
    body: JSON.stringify(body),
  });
}

function poll(sessionId: string, clientIp: string): Promise<Response> {
  return SELF.fetch(ciphertextUrl(sessionId), { headers: { 'CF-Connecting-IP': clientIp } });
}

function shard(): DurableObjectStub<RelayShard> {
  return env.RELAY.getByName('shard-0');
}

function storeOf(instance: RelayShard): MemoryRelaySessionStore {
  return (instance as unknown as { store: MemoryRelaySessionStore }).store;
}

beforeEach(async () => {
  await evictAllDurableObjects();
});

describe('RELAY-CF Worker', () => {
  it('completes a pairing exchange with privacy and CORS headers', async () => {
    const sessionId = 'WorkerFlowSessionAbcde';
    expect((await post(SESSIONS, { sessionId, expiresAtMs: 1 }, '203.0.113.10')).status).toBe(204);

    const pending = await poll(sessionId, '203.0.113.10');
    expect(pending.status).toBe(200);
    expect(await pending.json()).toEqual({ status: 'pending' });

    expect((await post(ciphertextUrl(sessionId), { ciphertext: 'opaque' }, '198.51.100.20')).status).toBe(204);

    const ready = await poll(sessionId, '203.0.113.10');
    expect(ready.headers.get('cache-control')).toBe('no-store');
    expect(ready.headers.get('access-control-allow-origin')).toBe('*');
    expect(ready.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await ready.json()).toEqual({ status: 'ready', ciphertext: 'opaque' });

    expect(await (await poll(sessionId, '203.0.113.10')).json()).toEqual({ status: 'consumed' });
  });

  it('pairs the merged TV and phone clients over the real fetch transport', async () => {
    const transport = new FetchPairingRelayTransport(((input: RequestInfo | URL, init?: RequestInit) => SELF.fetch(input, init)) as typeof fetch);
    const tv = new PairingRelayClient(BASE, transport, 5_000);
    const phone = new PairingRelayClient(BASE, transport, 5_000);

    await tv.createSession({ sessionId: 'WorkerCompatSessionAbc', expiresAtMs: Date.now() + TTL });
    expect(await tv.poll('WorkerCompatSessionAbc')).toEqual({ status: 'pending' });
    await phone.putCiphertext({ sessionId: 'WorkerCompatSessionAbc', ciphertext: '{"version":1}' });
    expect(await tv.poll('WorkerCompatSessionAbc')).toEqual({ status: 'ready', ciphertext: '{"version":1}' });
    expect(await tv.poll('WorkerCompatSessionAbc')).toEqual({ status: 'consumed' });
  });

  it('keys clients by CF-Connecting-IP and ignores X-Forwarded-For', async () => {
    for (let index = 0; index < DEFAULT_RELAY_LIMITS.rateLimits.create.limit; index += 1) {
      const response = await post(SESSIONS, { sessionId: `KeyedSession${String(index).padStart(10, '0')}`, expiresAtMs: 1 }, '203.0.113.30', {
        'X-Forwarded-For': `198.51.100.${index}`,
      });
      expect(response.status).toBe(204);
    }
    const limited = await post(SESSIONS, { sessionId: 'KeyedSessionLimited000', expiresAtMs: 1 }, '203.0.113.30', {
      'X-Forwarded-For': '198.51.100.250',
    });
    expect(limited.status).toBe(429);
    expect((await post(SESSIONS, { sessionId: 'KeyedSessionOtherIp000', expiresAtMs: 1 }, '203.0.113.31')).status).toBe(204);
  });

  it('schedules an expiry alarm and purges abandoned ciphertext when it runs', async () => {
    const clock = { now: Date.now() };
    await runInDurableObject(shard(), (instance: RelayShard) => {
      instance.nowMs = () => clock.now;
    });

    const sessionId = 'AlarmSessionAbcdefghij';
    await post(SESSIONS, { sessionId, expiresAtMs: 1 }, '203.0.113.40');
    await post(ciphertextUrl(sessionId), { ciphertext: 'abandoned' }, '203.0.113.41');

    const alarmAt = await runInDurableObject(shard(), (_instance: RelayShard, state) => state.storage.getAlarm());
    expect(alarmAt).not.toBeNull();
    expect(alarmAt as number).toBeGreaterThanOrEqual(clock.now + TTL);
    expect(alarmAt as number).toBeLessThanOrEqual(clock.now + TTL + 10_000);

    clock.now += TTL + 1;
    expect(await runDurableObjectAlarm(shard())).toBe(true);
    const retained = await runInDurableObject(shard(), (instance: RelayShard) => storeOf(instance).debugRetainedCiphertextCount());
    expect(retained).toBe(0);
    expect(await (await poll(sessionId, '203.0.113.40')).json()).toEqual({ status: 'expired' });
  });

  it('re-arms the expiry alarm for sessions that outlive the one it purged', async () => {
    const clock = { now: Date.now() };
    await runInDurableObject(shard(), (instance: RelayShard) => {
      instance.nowMs = () => clock.now;
    });
    const firstCreatedAt = clock.now;
    await post(SESSIONS, { sessionId: 'RearmFirstSessionAbcde', expiresAtMs: 1 }, '203.0.113.60');
    clock.now += 200_000;
    const secondCreatedAt = clock.now;
    await post(SESSIONS, { sessionId: 'RearmSecondSessionAbcd', expiresAtMs: 1 }, '203.0.113.61');
    expect(await runInDurableObject(shard(), (_instance: RelayShard, state) => state.storage.getAlarm())).toBe(
      Math.ceil((firstCreatedAt + TTL) / 10_000) * 10_000,
    );

    clock.now = firstCreatedAt + TTL + 10_000;
    expect(await runDurableObjectAlarm(shard())).toBe(true);
    expect(await runInDurableObject(shard(), (_instance: RelayShard, state) => state.storage.getAlarm())).toBe(
      Math.ceil((secondCreatedAt + TTL) / 10_000) * 10_000,
    );
  });

  it('runs the relay with memory limits sized for a 128 MB Durable Object', async () => {
    const limits = await runInDurableObject(shard(), (instance: RelayShard) => {
      const internals = instance as unknown as {
        store: { limits: Record<string, number> };
        rateLimiter: { maxKeys: number };
      };
      return {
        maxSessions: internals.store.limits.maxSessions,
        maxTombstones: internals.store.limits.maxTombstones,
        maxRetainedCiphertextChars: internals.store.limits.maxRetainedCiphertextChars,
        rateLimitKeys: internals.rateLimiter.maxKeys,
      };
    });
    expect(limits).toEqual({
      maxSessions: CLOUDFLARE_RELAY_LIMITS.maxSessions,
      maxTombstones: CLOUDFLARE_RELAY_LIMITS.maxTombstones,
      maxRetainedCiphertextChars: CLOUDFLARE_RELAY_LIMITS.maxRetainedCiphertextChars,
      rateLimitKeys: CLOUDFLARE_RATE_LIMIT_MAX_KEYS,
    });
    expect(CLOUDFLARE_RELAY_LIMITS.maxSessions).toBeLessThanOrEqual(2_000);
    expect(CLOUDFLARE_RELAY_LIMITS.maxRetainedCiphertextChars).toBeLessThanOrEqual(4_000_000);
  });

  it('loses in-flight sessions when the Durable Object is evicted', async () => {
    const sessionId = 'EvictedSessionAbcdefgh';
    expect((await post(SESSIONS, { sessionId, expiresAtMs: 1 }, '203.0.113.50')).status).toBe(204);
    await evictDurableObject(shard());
    expect((await poll(sessionId, '203.0.113.50')).status).toBe(404);
  });
});
