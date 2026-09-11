import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  PairingRelayCreateSessionRequest,
  PairingRelayPutCiphertextRequest,
  PairingRelayPollResponse,
  PairingRelayRequest,
  PairingRelayTransport,
} from '../src/pairing/relay-contracts.js';
import {
  PairingRelayClient,
  PairingRelayError,
  normalizePairingRelayBaseUrl,
} from '../src/pairing/relay-client.js';

void (null as unknown as PairingRelayCreateSessionRequest);
void (null as unknown as PairingRelayPutCiphertextRequest);
void (null as unknown as PairingRelayPollResponse);
void (null as unknown as PairingRelayTransport);

test('PAIR-R contract suite loads without runtime side effects', () => {
  assert.equal(true, true);
});

test('PAIR-R sends only session metadata and ciphertext through the relay protocol', async () => {
  const requests: PairingRelayRequest[] = [];
  const transport: PairingRelayTransport = {
    async request<T>(request: PairingRelayRequest): Promise<T> {
      requests.push(request);
      if (request.method === 'GET') return { status: 'pending' } as T;
      return { ok: true } as T;
    },
  };

  const client = new PairingRelayClient('https://relay.example.invalid/base/', transport, 5000);
  await client.createSession({ sessionId: 's1', expiresAtMs: 123 });
  await client.putCiphertext({ sessionId: 's1', ciphertext: 'opaque-ciphertext' });
  await client.poll('s1');

  assert.deepEqual(requests.map((request) => [request.method, new URL(request.url).pathname]), [
    ['POST', '/base/v1/pairing/sessions'],
    ['POST', '/base/v1/pairing/sessions/s1/ciphertext'],
    ['GET', '/base/v1/pairing/sessions/s1/ciphertext'],
  ]);
  assert.deepEqual(requests.map((request) => request.timeoutMs), [5000, 5000, 5000]);

  assert.deepEqual(requests[0]?.body, { sessionId: 's1', expiresAtMs: 123 });
  assert.deepEqual(requests[1]?.body, { ciphertext: 'opaque-ciphertext' });
  assert.equal(requests[2]?.body, undefined);

  const serialized = JSON.stringify(requests);
  for (const forbidden of [
    'provider',
    'credential',
    'username',
    'password',
    'playlistUrl',
    'serverUrl',
    'token',
    'plaintext',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden relay surface key: ${forbidden}`);
  }
});

test('PAIR-R URL-encodes session IDs in path segments', async () => {
  const requests: PairingRelayRequest[] = [];
  const transport: PairingRelayTransport = {
    async request<T>(request: PairingRelayRequest): Promise<T> {
      requests.push(request);
      return { status: 'pending' } as T;
    },
  };
  const client = new PairingRelayClient('https://relay.example.invalid', transport, 1000);

  await client.poll('session/with ?unsafe#chars');

  assert.equal(
    new URL(requests[0]!.url).pathname,
    '/v1/pairing/sessions/session%2Fwith%20%3Funsafe%23chars/ciphertext',
  );
  assert.equal(new URL(requests[0]!.url).search, '');
  assert.equal(new URL(requests[0]!.url).hash, '');
});

test('PAIR-R normalizes HTTPS base URLs without carrying query or hash', () => {
  assert.equal(
    normalizePairingRelayBaseUrl('  https://relay.example.invalid/base///?ignored=yes#fragment  '),
    'https://relay.example.invalid/base',
  );
});

test('PAIR-R rejects non-HTTPS, URL user-info, invalid URLs, and invalid timeouts with sanitized errors', () => {
  for (const raw of [
    'http://relay.example.invalid',
    'https://user@relay.example.invalid',
    'https://user:pass@relay.example.invalid',
    'not-a-url',
  ]) {
    assert.throws(
      () => normalizePairingRelayBaseUrl(raw),
      (error: unknown) =>
        error instanceof PairingRelayError &&
        error.code === 'UNAVAILABLE' &&
        error.message === 'Pairing relay is unavailable.',
    );
  }

  const transport: PairingRelayTransport = {
    async request<T>(): Promise<T> {
      return {} as T;
    },
  };
  for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => new PairingRelayClient('https://relay.example.invalid', transport, timeoutMs),
      (error: unknown) =>
        error instanceof PairingRelayError &&
        error.code === 'UNAVAILABLE' &&
        error.message === 'Pairing relay is unavailable.',
    );
  }
});

test('PAIR-R sanitizes transport failures without leaking caught text', async () => {
  const transport: PairingRelayTransport = {
    async request<T>(): Promise<T> {
      throw new Error('https://secret.invalid/?payload=plaintext');
    },
  };
  const client = new PairingRelayClient('https://relay.example.invalid', transport, 5000);

  await assert.rejects(
    client.poll('sensitive-session'),
    (error: unknown) =>
      error instanceof PairingRelayError &&
      error.code === 'NETWORK' &&
      error.message === 'Pairing relay request failed.' &&
      !error.message.includes('secret') &&
      !error.message.includes('sensitive-session') &&
      !error.message.includes('plaintext'),
  );
});

test('PAIR-R preserves already-sanitized PairingRelayError instances', async () => {
  const expected = new PairingRelayError('UNAVAILABLE');
  const transport: PairingRelayTransport = {
    async request<T>(): Promise<T> {
      throw expected;
    },
  };
  const client = new PairingRelayClient('https://relay.example.invalid', transport, 5000);

  await assert.rejects(client.poll('s1'), (error: unknown) => error === expected);
});

test('PAIR-R accepts only frozen poll response shapes', async () => {
  const validResponses: PairingRelayPollResponse[] = [
    { status: 'pending' },
    { status: 'ready', ciphertext: 'opaque' },
    { status: 'expired' },
    { status: 'consumed' },
  ];

  for (const response of validResponses) {
    const transport: PairingRelayTransport = {
      async request<T>(): Promise<T> {
        return response as T;
      },
    };
    const client = new PairingRelayClient('https://relay.example.invalid', transport, 5000);
    assert.deepEqual(await client.poll('s1'), response);
  }
});

test('PAIR-R rejects malformed relay responses with a fixed sanitized error', async () => {
  const malformedResponses: unknown[] = [
    { status: 'ready' },
    { status: 'ready', ciphertext: 123 },
    { status: 'unknown' },
    { status: 'pending', ciphertext: 'unexpected' },
    { status: 'expired', ciphertext: 'unexpected' },
    { status: 'consumed', ciphertext: 'unexpected' },
    [],
    null,
    { plaintext: 'secret' },
  ];

  for (const response of malformedResponses) {
    const transport: PairingRelayTransport = {
      async request<T>(): Promise<T> {
        return response as T;
      },
    };
    const client = new PairingRelayClient('https://relay.example.invalid', transport, 5000);

    await assert.rejects(
      client.poll('s1'),
      (error: unknown) =>
        error instanceof PairingRelayError &&
        error.code === 'MALFORMED' &&
        error.message === 'Pairing relay response was malformed.' &&
        !error.message.includes(JSON.stringify(response)),
    );
  }
});
