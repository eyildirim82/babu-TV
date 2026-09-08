import test from 'node:test';
import assert from 'node:assert/strict';
import type { XtreamCredential } from '../src/credentials/contracts.js';
import { ProviderError } from '../src/providers/errors.js';
import type { ProviderHttpClient } from '../src/providers/http/contracts.js';
import { XtreamProvider } from '../src/providers/xtream/xtream-provider.js';
import {
  XTREAM_ACTIVE_PROFILE,
  XTREAM_AUTH_DENIED,
  XTREAM_CATEGORIES,
  XTREAM_CHANNELS,
  XTREAM_EXPIRED_PROFILE,
} from './fixtures/xtream-fixtures.js';

class FakeProviderHttpClient implements ProviderHttpClient {
  readonly calls: string[] = [];

  constructor(private readonly respond: (url: string) => unknown) {}

  async getJson<T>(url: string): Promise<T> {
    this.calls.push(url);
    return this.respond(url) as T;
  }

  async getText(): Promise<string> {
    throw new Error('Xtream tests do not use text transport.');
  }
}

const credential: XtreamCredential = {
  kind: 'xtream',
  serverUrl: 'https://example.com/iptv///',
  username: 'demo-user',
  password: 'demo-pass',
};

function action(url: string): string | null {
  return new URL(url).searchParams.get('action');
}

function adapterFor(respond: (url: string) => unknown): {
  adapter: XtreamProvider;
  http: FakeProviderHttpClient;
} {
  const http = new FakeProviderHttpClient(respond);
  return {
    adapter: new XtreamProvider('provider-a', credential, http),
    http,
  };
}

function assertSafeProviderError(error: unknown, code: string): boolean {
  assert.ok(error instanceof ProviderError);
  assert.equal(error.code, code);
  assert.equal(error.message.includes('demo-user'), false);
  assert.equal(error.message.includes('demo-pass'), false);
  return true;
}

void test('Xtream validates account and returns normalized profile without copying credential username', async () => {
  const { adapter, http } = adapterFor(() => XTREAM_ACTIVE_PROFILE);

  const profile = await adapter.getProfile();

  assert.deepEqual(profile, {
    providerId: 'provider-a',
    kind: 'xtream',
    accountName: 'Demo Account',
    expiresAtMs: 1_893_456_000_000,
    maxConnections: 2,
  });
  assert.equal(JSON.stringify(profile).includes('demo-user'), false);
  assert.equal(JSON.stringify(profile).includes('demo-pass'), false);

  assert.equal(http.calls.length, 1);
  const requestUrl = new URL(http.calls[0] ?? '');
  assert.equal(requestUrl.origin + requestUrl.pathname, 'https://example.com/iptv/player_api.php');
  assert.equal(requestUrl.searchParams.get('username'), 'demo-user');
  assert.equal(requestUrl.searchParams.get('password'), 'demo-pass');
  assert.equal(requestUrl.searchParams.get('action'), null);
});

void test('Xtream maps auth=0 to sanitized AUTH error', async () => {
  const { adapter } = adapterFor(() => XTREAM_AUTH_DENIED);

  await assert.rejects(adapter.getProfile(), (error: unknown) => assertSafeProviderError(error, 'AUTH'));
});

void test('Xtream maps an explicitly expired account status to sanitized AUTH error', async () => {
  const { adapter } = adapterFor(() => XTREAM_EXPIRED_PROFILE);

  await assert.rejects(adapter.getProfile(), (error: unknown) => assertSafeProviderError(error, 'AUTH'));
});

void test('Xtream profile uses null for invalid optional account fields', async () => {
  const { adapter } = adapterFor(() => ({
    user_info: {
      auth: 1,
      status: 'Active',
      username: 'demo-user',
      exp_date: 'not-a-date',
      max_connections: '0',
    },
  }));

  assert.deepEqual(await adapter.getProfile(), {
    providerId: 'provider-a',
    kind: 'xtream',
    accountName: null,
    expiresAtMs: null,
    maxConnections: null,
  });
});

void test('Xtream maps live categories into normalized provider-scoped categories and skips malformed items', async () => {
  const { adapter } = adapterFor((url) => {
    assert.equal(action(url), 'get_live_categories');
    return XTREAM_CATEGORIES;
  });

  assert.deepEqual(await adapter.listCategories(), [
    { providerId: 'provider-a', id: '7', name: 'News' },
    { providerId: 'provider-a', id: '8', name: 'Sports' },
  ]);
});

void test('Xtream accepts an empty live category array', async () => {
  const { adapter } = adapterFor(() => []);

  assert.deepEqual(await adapter.listCategories(), []);
});

void test('Xtream rejects a non-array live category response as MALFORMED', async () => {
  const { adapter } = adapterFor(() => ({ categories: [] }));

  await assert.rejects(adapter.listCategories(), (error: unknown) => assertSafeProviderError(error, 'MALFORMED'));
});

void test('Xtream maps live streams into normalized Channels, skips malformed rows, and keeps first duplicate ID', async () => {
  const { adapter } = adapterFor((url) => {
    assert.equal(action(url), 'get_live_streams');
    return XTREAM_CHANNELS;
  });

  const channels = await adapter.listChannels();

  assert.deepEqual(channels, [
    {
      providerId: 'provider-a',
      id: '42',
      name: 'Example News',
      categoryId: '7',
      logoUrl: 'https://example.com/logo.png',
      number: 1,
    },
    {
      providerId: 'provider-a',
      id: '43',
      name: 'Example Sports',
      categoryId: '8',
      logoUrl: null,
      number: 2,
    },
    {
      providerId: 'provider-a',
      id: '44',
      name: 'Unsafe Extension',
      categoryId: null,
      logoUrl: null,
      number: null,
    },
  ]);
  assert.equal(JSON.stringify(channels).includes('demo-pass'), false);
});

void test('Xtream rejects a non-array live stream response as MALFORMED', async () => {
  const { adapter } = adapterFor(() => ({ streams: [] }));

  await assert.rejects(adapter.listChannels(), (error: unknown) => assertSafeProviderError(error, 'MALFORMED'));
});

void test('Xtream resolves live URLs transiently using first duplicate extension and safe extension fallback', async () => {
  const { adapter } = adapterFor(() => XTREAM_CHANNELS);
  await adapter.listChannels();

  assert.deepEqual(await adapter.resolveStream('42'), {
    url: 'https://example.com/iptv/live/demo-user/demo-pass/42.m3u8',
  });
  assert.deepEqual(await adapter.resolveStream('44'), {
    url: 'https://example.com/iptv/live/demo-user/demo-pass/44.ts',
  });
});

void test('Xtream percent-encodes credentials and channel ID in transient live stream paths', async () => {
  const http = new FakeProviderHttpClient(() => [{
    stream_id: 'channel/5',
    name: 'Encoded',
    container_extension: 'ts',
  }]);
  const adapter = new XtreamProvider('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo user',
    password: 'p/a ss',
  }, http);
  await adapter.listChannels();

  assert.deepEqual(await adapter.resolveStream('channel/5'), {
    url: 'https://example.com/live/demo%20user/p%2Fa%20ss/channel%2F5.ts',
  });
});

void test('Xtream resolves an uncached channel by loading live streams once', async () => {
  const { adapter, http } = adapterFor(() => XTREAM_CHANNELS);

  assert.deepEqual(await adapter.resolveStream('43'), {
    url: 'https://example.com/iptv/live/demo-user/demo-pass/43.ts',
  });
  assert.equal(http.calls.length, 1);
  assert.equal(action(http.calls[0] ?? ''), 'get_live_streams');
});

void test('Xtream returns sanitized NOT_FOUND for an unknown channel after catalog load', async () => {
  const { adapter } = adapterFor(() => XTREAM_CHANNELS);

  await assert.rejects(adapter.resolveStream('missing'), (error: unknown) => {
    assertSafeProviderError(error, 'NOT_FOUND');
    assert.ok(error instanceof ProviderError);
    assert.equal(error.status, null);
    return true;
  });
});

void test('Xtream rejects non-http server schemes without exposing credentials', () => {
  assert.throws(
    () => new XtreamProvider('provider-a', {
      kind: 'xtream',
      serverUrl: 'ftp://demo-user:demo-pass@example.com',
      username: 'demo-user',
      password: 'demo-pass',
    }, new FakeProviderHttpClient(() => XTREAM_ACTIVE_PROFILE)),
    (error: unknown) => assertSafeProviderError(error, 'UNAVAILABLE'),
  );
});
