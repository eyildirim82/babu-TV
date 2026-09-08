import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderError,
  type ProviderErrorCode,
} from '../src/providers/errors.js';
import {
  FetchProviderHttpClient,
  type ProviderHttpTimers,
} from '../src/providers/http/fetch-provider-http-client.js';

type FetchLike = typeof fetch;

function response(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeClient(fetchImpl: FetchLike): FetchProviderHttpClient {
  return new FetchProviderHttpClient(fetchImpl);
}

async function expectProviderError(
  promise: Promise<unknown>,
  code: ProviderErrorCode,
  status: number | null,
): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return error;
  }
  assert.fail(`Expected ProviderError(${code})`);
}

void test('provider http returns parsed JSON for a successful response', async () => {
  const client = makeClient(async () => response('{"ok":true}'));

  assert.deepEqual(await client.getJson<{ ok: boolean }>('https://example.com/data'), { ok: true });
});

void test('provider http returns text for a successful response', async () => {
  const client = makeClient(async () => new Response('#EXTM3U\n#EXTINF:-1,Example'));

  assert.equal(
    await client.getText('https://example.com/list.m3u'),
    '#EXTM3U\n#EXTINF:-1,Example',
  );
});

for (const status of [401, 403] as const) {
  void test(`provider http maps HTTP ${status} to AUTH without leaking request secrets`, async () => {
    const client = makeClient(async () => response('{}', status));
    const secretUrl = `https://example.com/player_api.php?username=demo-user&password=demo-pass&status=${status}`;

    const error = await expectProviderError(client.getJson(secretUrl), 'AUTH', status);

    assert.equal(error.message.includes('demo-user'), false);
    assert.equal(error.message.includes('demo-pass'), false);
    assert.equal(error.message.includes(secretUrl), false);
  });
}

void test('provider http maps HTTP 404 to NOT_FOUND', async () => {
  const client = makeClient(async () => response('{}', 404));

  await expectProviderError(client.getJson('https://example.com/missing'), 'NOT_FOUND', 404);
});

void test('provider http maps HTTP 500 to SERVER', async () => {
  const client = makeClient(async () => response('{}', 500));

  await expectProviderError(client.getJson('https://example.com/broken'), 'SERVER', 500);
});

void test('provider http maps a rejected fetch to NETWORK without exposing the native error', async () => {
  const client = makeClient(async () => {
    throw new Error('network failed for demo-user:demo-pass');
  });

  const error = await expectProviderError(
    client.getText('https://demo-user:demo-pass@example.com/list.m3u'),
    'NETWORK',
    null,
  );

  assert.equal(error.message.includes('demo-user'), false);
  assert.equal(error.message.includes('demo-pass'), false);
});

void test('provider http maps response body read failures to sanitized NETWORK errors', async () => {
  const brokenResponse = {
    ok: true,
    status: 200,
    async text() {
      throw new Error('body read failed for demo-user:demo-pass');
    },
  } as Response;
  const client = makeClient(async () => brokenResponse);

  const error = await expectProviderError(
    client.getText('https://example.com/list.m3u?password=demo-pass'),
    'NETWORK',
    null,
  );

  assert.equal(error.message.includes('demo-user'), false);
  assert.equal(error.message.includes('demo-pass'), false);
});

void test('provider http maps malformed JSON to MALFORMED', async () => {
  const client = makeClient(async () => response('{not-json'));

  await expectProviderError(client.getJson('https://example.com/data'), 'MALFORMED', 200);
});

void test('provider http timeout is deterministic and does not sleep', async () => {
  let timeoutMs: number | null = null;
  const timers: ProviderHttpTimers = {
    setTimeout(callback, delayMs) {
      timeoutMs = delayMs;
      callback();
      return 1;
    },
    clearTimeout() {},
  };
  const fetchImpl: FetchLike = async (_input, init) => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    throw new Error('expected injected timer to abort before fetch');
  };
  const client = new FetchProviderHttpClient(fetchImpl, timers);

  await expectProviderError(client.getJson('https://example.com/slow', 1234), 'TIMEOUT', null);
  assert.equal(timeoutMs, 1234);
});

void test('provider http keeps timeout active while consuming the response body', async () => {
  let timeoutCallback: (() => void) | null = null;
  const timers: ProviderHttpTimers = {
    setTimeout(callback) {
      timeoutCallback = callback;
      return 1;
    },
    clearTimeout() {},
  };
  const slowBodyResponse = {
    ok: true,
    status: 200,
    async text() {
      timeoutCallback?.();
      throw new DOMException('aborted', 'AbortError');
    },
  } as Response;
  const client = new FetchProviderHttpClient(async () => slowBodyResponse, timers);

  await expectProviderError(client.getText('https://example.com/slow-body', 2500), 'TIMEOUT', null);
});

void test('provider http maps other non-success responses to UNAVAILABLE with safe message', async () => {
  const client = makeClient(async () => response('{}', 429));
  const secretUrl = 'https://example.com/data?token=demo-pass';

  const error = await expectProviderError(client.getJson(secretUrl), 'UNAVAILABLE', 429);

  assert.equal(error.message.includes('demo-pass'), false);
  assert.equal(error.message.includes(secretUrl), false);
});
