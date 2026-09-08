import test from 'node:test';
import assert from 'node:assert/strict';
import type { M3uCredential } from '../src/credentials/contracts.js';
import { ProviderError } from '../src/providers/errors.js';
import type { ProviderHttpClient } from '../src/providers/http/contracts.js';
import {
  fnv1a32,
  makeM3uChannelId,
} from '../src/providers/m3u/m3u-identity.js';
import { M3uProvider } from '../src/providers/m3u/m3u-provider.js';
import { M3U_COMPLEX_PLAYLIST } from './fixtures/m3u-fixtures.js';

class FakeProviderHttpClient implements ProviderHttpClient {
  readonly textCalls: string[] = [];

  constructor(private readonly loadText: (url: string) => string | Promise<string>) {}

  async getJson<T>(): Promise<T> {
    throw new Error('M3U provider tests do not use JSON transport.');
  }

  async getText(url: string): Promise<string> {
    this.textCalls.push(url);
    return this.loadText(url);
  }
}

const credential: M3uCredential = {
  kind: 'm3u',
  playlistUrl: 'https://example.com/list.m3u?username=demo-user&password=demo-pass',
};

function adapterFor(text: string): { adapter: M3uProvider; http: FakeProviderHttpClient } {
  const http = new FakeProviderHttpClient(() => text);
  return {
    adapter: new M3uProvider('provider-a', credential, http),
    http,
  };
}

function playlist(...entries: string[]): string {
  return `#EXTM3U\n${entries.join('\n')}\n`;
}

function entry(attributes: string, name: string, url: string): string {
  return `#EXTINF:-1 ${attributes},${name}\n${url}`;
}

function assertSafeProviderError(error: unknown, code: string): boolean {
  assert.ok(error instanceof ProviderError);
  assert.equal(error.code, code);
  assert.equal(error.message.includes('demo-user'), false);
  assert.equal(error.message.includes('demo-pass'), false);
  assert.equal(error.message.includes(credential.playlistUrl), false);
  return true;
}

void test('M3U identity uses deterministic FNV-1a and does not expose fallback stream URLs', () => {
  assert.equal(fnv1a32('hello'), '4f9f2cab');

  const id = makeM3uChannelId({
    tvgId: null,
    name: ' Example Channel ',
    group: ' News ',
    streamUrl: 'https://user:pass@example.com/live/1.ts',
  });

  assert.match(id, /^fallback:[0-9a-f]{8}$/);
  assert.equal(id.includes('user'), false);
  assert.equal(id.includes('pass'), false);
  assert.equal(id.includes('example.com'), false);
});

void test('M3U provider validates once and returns normalized provider-scoped profile, categories, and channels', async () => {
  const { adapter, http } = adapterFor(M3U_COMPLEX_PLAYLIST);

  assert.deepEqual(await adapter.getProfile(), {
    providerId: 'provider-a',
    kind: 'm3u',
    accountName: null,
    expiresAtMs: null,
    maxConnections: null,
  });

  const categories = await adapter.listCategories();
  assert.deepEqual(categories.map((category) => category.name), ['News, International', 'Sports']);
  assert.equal(categories.every((category) => category.providerId === 'provider-a'), true);

  const channels = await adapter.listChannels();
  assert.equal(channels.length, 4);
  assert.deepEqual(channels[0], {
    providerId: 'provider-a',
    id: 'tvg:news.intl',
    name: 'News, International',
    categoryId: categories[0]?.id ?? null,
    logoUrl: 'https://example.com/news.png',
    number: 7,
  });
  assert.equal(JSON.stringify(channels).includes('stream.example.com'), false);
  assert.equal(JSON.stringify(channels).includes('demo-pass'), false);
  assert.equal(http.textCalls.length, 1);
  assert.equal(http.textCalls[0], credential.playlistUrl);
});

void test('M3U fallback identity is stable across playlist reorder', async () => {
  const one = entry('', 'Alpha', 'https://stream.example.com/a.ts');
  const two = entry('', 'Beta', 'https://stream.example.com/b.ts');
  const first = adapterFor(playlist(one, two)).adapter;
  const second = adapterFor(playlist(two, one)).adapter;

  const firstIds = new Map((await first.listChannels()).map((channel) => [channel.name, channel.id]));
  const secondIds = new Map((await second.listChannels()).map((channel) => [channel.name, channel.id]));

  assert.equal(firstIds.get('Alpha'), secondIds.get('Alpha'));
  assert.equal(firstIds.get('Beta'), secondIds.get('Beta'));
});

void test('M3U same-name channels with different stream identities do not collapse', async () => {
  const text = playlist(
    entry('', 'Same Name', 'https://stream.example.com/a.ts'),
    entry('', 'Same Name', 'https://stream.example.com/b.ts'),
  );

  const channels = await adapterFor(text).adapter.listChannels();

  assert.equal(channels.length, 2);
  assert.notEqual(channels[0]?.id, channels[1]?.id);
});

void test('M3U duplicate tvg-id keeps the first valid entry deterministically', async () => {
  const text = playlist(
    entry('tvg-id="duplicate" group-title="One"', 'First', 'https://stream.example.com/first.ts'),
    entry('tvg-id="duplicate" group-title="Two"', 'Second', 'https://stream.example.com/second.ts'),
  );

  const channels = await adapterFor(text).adapter.listChannels();

  assert.deepEqual(channels.map((channel) => [channel.id, channel.name]), [['tvg:duplicate', 'First']]);
});

void test('M3U provider resolves transient stream metadata without copying it into Channel', async () => {
  const { adapter } = adapterFor(M3U_COMPLEX_PLAYLIST);
  const channel = (await adapter.listChannels())[0];
  assert.ok(channel);

  const request = await adapter.resolveStream(channel.id);

  assert.deepEqual(request, {
    url: 'https://stream.example.com/live/news.m3u8?edge-token=abc123',
    userAgent: 'BabusTV-Test/1.0',
    headers: {
      Referer: 'https://example.com/',
      'X-Test': 'from-ext-http',
      authorization: 'Bearer%20demo',
      'x-test': 'from-pipe',
    },
    drm: { keyId: 'ABCDEF01', key: '1234ABCD' },
    useProxy: true,
    proxyUrl: 'https://proxy.example.com/fetch',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(channel, 'url'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(channel, 'streamUrl'), false);
});

void test('M3U provider maps an unrecognizable playlist to sanitized MALFORMED', async () => {
  const { adapter } = adapterFor('{"not":"m3u"}');

  await assert.rejects(adapter.getProfile(), (error: unknown) => assertSafeProviderError(error, 'MALFORMED'));
});

void test('M3U provider sanitizes unexpected transport failures that contain the credential URL', async () => {
  const http = new FakeProviderHttpClient(() => {
    throw new Error(`failed to load ${credential.playlistUrl}`);
  });
  const adapter = new M3uProvider('provider-a', credential, http);

  await assert.rejects(adapter.listChannels(), (error: unknown) => assertSafeProviderError(error, 'NETWORK'));
});

void test('M3U provider returns sanitized NOT_FOUND for unknown channel identity', async () => {
  const { adapter } = adapterFor(M3U_COMPLEX_PLAYLIST);

  await assert.rejects(adapter.resolveStream('missing'), (error: unknown) => {
    assertSafeProviderError(error, 'NOT_FOUND');
    assert.ok(error instanceof ProviderError);
    assert.equal(error.status, null);
    return true;
  });
});

void test('M3U provider handles a deterministic 1000-channel list with unique stable IDs', async () => {
  const rows: string[] = [];
  for (let index = 0; index < 1000; index += 1) {
    rows.push(entry('', `Channel ${index}`, `https://stream.example.com/${index}.ts`));
  }
  const { adapter } = adapterFor(playlist(...rows));

  const channels = await adapter.listChannels();

  assert.equal(channels.length, 1000);
  assert.equal(new Set(channels.map((channel) => channel.id)).size, 1000);
});

void test('M3U channel identity remains provider scoped through Channel.providerId', async () => {
  const text = playlist(entry('tvg-id="shared"', 'Shared', 'https://stream.example.com/shared.ts'));
  const http = new FakeProviderHttpClient(() => text);
  const a = new M3uProvider('provider-a', credential, http);
  const b = new M3uProvider('provider-b', credential, http);

  const channelA = (await a.listChannels())[0];
  const channelB = (await b.listChannels())[0];

  assert.equal(channelA?.id, channelB?.id);
  assert.equal(channelA?.providerId, 'provider-a');
  assert.equal(channelB?.providerId, 'provider-b');
});
