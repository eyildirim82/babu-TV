import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingRelayClient, PairingRelayError } from '../../player/src/pairing/relay-client.js';
import type { PairingRelayRequest, PairingRelayTransport } from '../../player/src/pairing/relay-contracts.js';
import { createRelayCore, type RelayCore } from '../src/relay-core.js';
import { MemoryRelaySessionStore } from '../src/memory-session-store.js';
import { MemoryRelayRateLimiter } from '../src/memory-rate-limiter.js';
import { DEFAULT_RELAY_LIMITS } from '../src/limits.js';

const BASE_URL = 'https://relay.example.invalid/relay/';

// Mirrors FetchPairingRelayTransport semantics (non-2xx -> NETWORK, empty body -> null)
// while calling the relay core in-process, because the client only accepts https URLs.
class InProcessTransport implements PairingRelayTransport {
  constructor(private readonly core: RelayCore, private readonly clientKey: string) {}

  async request<T>(request: PairingRelayRequest): Promise<T> {
    const url = new URL(request.url);
    const response = await this.core.handle({
      method: request.method,
      path: url.pathname,
      clientKey: this.clientKey,
      body: request.body === undefined ? null : JSON.stringify(request.body),
    });
    if (response.status < 200 || response.status > 299) throw new PairingRelayError('NETWORK');
    if (response.body === null || response.body.length === 0) return null as T;
    return JSON.parse(response.body) as T;
  }
}

function relay(clock: { now: number }): RelayCore {
  return createRelayCore({
    store: new MemoryRelaySessionStore(DEFAULT_RELAY_LIMITS),
    rateLimiter: new MemoryRelayRateLimiter(DEFAULT_RELAY_LIMITS.rateLimits),
    nowMs: () => clock.now,
    basePath: '/relay',
  });
}

test('RELAY-COMPAT merged TV and phone clients complete a pairing against the relay', async () => {
  const clock = { now: 0 };
  const core = relay(clock);
  const tv = new PairingRelayClient(BASE_URL, new InProcessTransport(core, 'tv'), 5_000);
  const phone = new PairingRelayClient(BASE_URL, new InProcessTransport(core, 'phone'), 5_000);

  await tv.createSession({ sessionId: 'CompatSessionAbcdefghi', expiresAtMs: 300_000 });
  assert.deepEqual(await tv.poll('CompatSessionAbcdefghi'), { status: 'pending' });
  await phone.putCiphertext({ sessionId: 'CompatSessionAbcdefghi', ciphertext: '{"version":1}' });
  assert.deepEqual(await tv.poll('CompatSessionAbcdefghi'), { status: 'ready', ciphertext: '{"version":1}' });
  assert.deepEqual(await tv.poll('CompatSessionAbcdefghi'), { status: 'consumed' });
});

test('RELAY-COMPAT clients observe expiry and a rejected late phone submit', async () => {
  const clock = { now: 0 };
  const core = relay(clock);
  const tv = new PairingRelayClient(BASE_URL, new InProcessTransport(core, 'tv'), 5_000);
  const phone = new PairingRelayClient(BASE_URL, new InProcessTransport(core, 'phone'), 5_000);

  await tv.createSession({ sessionId: 'ExpirySessionAbcdefghi', expiresAtMs: 300_000 });
  clock.now = DEFAULT_RELAY_LIMITS.sessionTtlMs;
  assert.deepEqual(await tv.poll('ExpirySessionAbcdefghi'), { status: 'expired' });
  await assert.rejects(
    phone.putCiphertext({ sessionId: 'ExpirySessionAbcdefghi', ciphertext: 'late' }),
    (error: unknown) => error instanceof PairingRelayError && error.code === 'NETWORK',
  );
});
