import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingRelayError } from '../src/pairing/relay-client.js';
import { FetchPairingRelayTransport } from '../src/pairing/fetch-relay-transport.js';

test('PAIR-I-WIRE browser transport sends POST JSON and GET without a body', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const transport = new FetchPairingRelayTransport(fetchImpl);

  await transport.request({
    method: 'POST',
    url: 'https://relay.example.invalid/v1/pairing/sessions',
    body: { sessionId: 'public-session', expiresAtMs: 123 },
    timeoutMs: 1000,
  });
  await transport.request({
    method: 'GET',
    url: 'https://relay.example.invalid/v1/pairing/sessions/public-session/ciphertext',
    timeoutMs: 1000,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.init?.method, 'POST');
  assert.equal(calls[0]!.init?.body, JSON.stringify({ sessionId: 'public-session', expiresAtMs: 123 }));
  assert.equal(new Headers(calls[0]!.init?.headers).get('content-type'), 'application/json');
  assert.ok(calls[0]!.init?.signal instanceof AbortSignal);
  assert.equal(calls[1]!.init?.method, 'GET');
  assert.equal(calls[1]!.init?.body, undefined);
  assert.equal(new Headers(calls[1]!.init?.headers).has('content-type'), false);
});

test('PAIR-I-WIRE browser transport returns null for an empty success response', async () => {
  const fetchImpl = (async () => new Response(null, { status: 204 })) as typeof fetch;
  const transport = new FetchPairingRelayTransport(fetchImpl);
  const result = await transport.request<unknown>({
    method: 'GET',
    url: 'https://relay.example.invalid/v1/pairing/sessions/s1/ciphertext',
    timeoutMs: 1000,
  });
  assert.equal(result, null);
});

test('PAIR-I-WIRE browser transport aborts at request timeout with sanitized NETWORK error', async () => {
  let observedSignal: AbortSignal | undefined;
  const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
    observedSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('secret-timeout-body')));
    });
  }) as typeof fetch;
  const transport = new FetchPairingRelayTransport(fetchImpl);

  await assert.rejects(
    transport.request({
      method: 'GET',
      url: 'https://relay.example.invalid/v1/pairing/sessions/sensitive-session/ciphertext',
      timeoutMs: 5,
    }),
    (error: unknown) => error instanceof PairingRelayError
      && error.code === 'NETWORK'
      && error.message === 'Pairing relay request failed.'
      && !error.message.includes('secret')
      && !error.message.includes('sensitive-session'),
  );
  assert.equal(observedSignal?.aborted, true);
});

test('PAIR-I-WIRE browser transport maps non-2xx and malformed JSON to fixed errors without console output', async () => {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const output: unknown[] = [];
  console.log = (...args: unknown[]) => { output.push(args); };
  console.warn = (...args: unknown[]) => { output.push(args); };
  console.error = (...args: unknown[]) => { output.push(args); };
  try {
    const network = new FetchPairingRelayTransport((async () => new Response('credential=secret', { status: 503 })) as typeof fetch);
    await assert.rejects(
      network.request({ method: 'GET', url: 'https://relay.example.invalid/fail', timeoutMs: 1000 }),
      (error: unknown) => error instanceof PairingRelayError
        && error.code === 'NETWORK'
        && error.message === 'Pairing relay request failed.'
        && !error.message.includes('credential')
        && !error.message.includes('secret'),
    );

    const malformed = new FetchPairingRelayTransport((async () => new Response('{not-json', { status: 200 })) as typeof fetch);
    await assert.rejects(
      malformed.request({ method: 'GET', url: 'https://relay.example.invalid/malformed', timeoutMs: 1000 }),
      (error: unknown) => error instanceof PairingRelayError
        && error.code === 'MALFORMED'
        && error.message === 'Pairing relay response was malformed.'
        && !error.message.includes('not-json'),
    );
    assert.deepEqual(output, []);
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
});
