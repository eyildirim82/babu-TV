import test from 'node:test';
import assert from 'node:assert/strict';
import type { M3uCredential, XtreamCredential } from '../src/credentials/contracts.js';
import type { ProviderRecord } from '../src/domain/models.js';
import { ProviderError } from '../src/providers/errors.js';
import type { ProviderHttpClient } from '../src/providers/http/contracts.js';
import { M3uProvider } from '../src/providers/m3u/m3u-provider.js';
import { ProviderAdapterFactoryImpl } from '../src/providers/provider-adapter-factory.js';
import { XtreamProvider } from '../src/providers/xtream/xtream-provider.js';

class FakeHttpClient implements ProviderHttpClient {
  readonly jsonCalls: string[] = [];
  readonly textCalls: string[] = [];

  async getJson<T>(url: string): Promise<T> {
    this.jsonCalls.push(url);
    return [{ category_id: '7', category_name: 'News' }] as T;
  }

  async getText(url: string): Promise<string> {
    this.textCalls.push(url);
    return '#EXTM3U\n#EXTINF:-1 tvg-id="one" group-title="General",One\nhttps://stream.example.com/one.ts\n';
  }
}

function record(id: string, kind: 'xtream' | 'm3u'): ProviderRecord {
  return {
    id,
    kind,
    name: id,
    createdAtMs: 1_788_806_400_000,
    lastSuccessfulSyncAtMs: null,
  };
}

const xtreamCredential: XtreamCredential = {
  kind: 'xtream',
  serverUrl: 'https://example.com',
  username: 'demo-user',
  password: 'demo-pass',
};

const m3uCredential: M3uCredential = {
  kind: 'm3u',
  playlistUrl: 'https://example.com/list.m3u?token=demo-secret',
};

void test('provider adapter factory creates a provider-scoped Xtream adapter using the shared HTTP client', async () => {
  const http = new FakeHttpClient();
  const factory = new ProviderAdapterFactoryImpl(http);

  const adapter = factory.create(record('provider-x', 'xtream'), xtreamCredential);

  assert.ok(adapter instanceof XtreamProvider);
  assert.equal(adapter.providerId, 'provider-x');
  assert.equal(adapter.kind, 'xtream');
  const categories = await adapter.listCategories();
  assert.deepEqual(categories, [{ providerId: 'provider-x', id: '7', name: 'News' }]);
  assert.equal(http.jsonCalls.length, 1);
});

void test('provider adapter factory creates a provider-scoped M3U adapter using the shared HTTP client', async () => {
  const http = new FakeHttpClient();
  const factory = new ProviderAdapterFactoryImpl(http);

  const adapter = factory.create(record('provider-m', 'm3u'), m3uCredential);

  assert.ok(adapter instanceof M3uProvider);
  assert.equal(adapter.providerId, 'provider-m');
  assert.equal(adapter.kind, 'm3u');
  const channels = await adapter.listChannels();
  assert.equal(channels[0]?.name, 'One');
  assert.equal(channels[0]?.providerId, 'provider-m');
  assert.equal(http.textCalls.length, 1);
});

void test('provider adapter factory rejects kind mismatch with a sanitized configuration error', () => {
  const factory = new ProviderAdapterFactoryImpl(new FakeHttpClient());

  assert.throws(
    () => factory.create(record('provider-x', 'xtream'), m3uCredential),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, 'MALFORMED');
      assert.equal(error.status, null);
      assert.equal(error.message, 'Provider configuration is invalid.');
      const serialized = String(error) + JSON.stringify(error);
      assert.equal(serialized.includes('demo-secret'), false);
      assert.equal(serialized.includes(m3uCredential.playlistUrl), false);
      return true;
    },
  );

  assert.throws(
    () => factory.create(record('provider-m', 'm3u'), xtreamCredential),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      const serialized = String(error) + JSON.stringify(error);
      assert.equal(serialized.includes('demo-user'), false);
      assert.equal(serialized.includes('demo-pass'), false);
      assert.equal(serialized.includes(xtreamCredential.serverUrl), false);
      return true;
    },
  );
});
