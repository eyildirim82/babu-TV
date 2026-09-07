import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeProvider, FakeProviderError } from '../src/providers/fake-provider.js';
import {
  BASIC_CATEGORIES,
  BASIC_CHANNELS,
  DEMO_CREDENTIALS,
  makeLargeChannelFixture,
} from './fixtures/provider-fixtures.js';

void test('fake provider returns provider-scoped catalog and synthetic stream URLs', async () => {
  const provider = new FakeProvider({
    kind: 'xtream',
    categories: BASIC_CATEGORIES,
    channels: BASIC_CHANNELS,
  });

  const categories = await provider.listCategories('provider-a');
  const channels = await provider.listChannels('provider-a');
  const stream = await provider.resolveStream('provider-a', '42');

  assert.deepEqual(categories[0], { providerId: 'provider-a', id: 'news', name: 'News' });
  assert.equal(channels[0]?.providerId, 'provider-a');
  assert.equal(channels[0]?.id, '42');
  assert.equal(stream.url, 'https://example.com/live/provider-a/42.m3u8');
  assert.equal(stream.url.includes(DEMO_CREDENTIALS.username), false);
  assert.equal(stream.url.includes(DEMO_CREDENTIALS.password), false);
});

for (const status of [401, 403, 404, 500] as const) {
  void test(`fake provider exposes deterministic HTTP ${status} failure`, async () => {
    const provider = new FakeProvider({
      kind: 'xtream',
      categories: BASIC_CATEGORIES,
      channels: BASIC_CHANNELS,
      failure: status,
    });

    await assert.rejects(
      provider.listChannels('provider-a'),
      (error: unknown) => error instanceof FakeProviderError
        && error.code === `HTTP_${status}`
        && error.status === status,
    );
  });
}

void test('fake provider exposes deterministic timeout failure without sleeping', async () => {
  const provider = new FakeProvider({
    kind: 'xtream',
    categories: BASIC_CATEGORIES,
    channels: BASIC_CHANNELS,
    failure: 'timeout',
  });

  await assert.rejects(
    provider.listChannels('provider-a'),
    (error: unknown) => error instanceof FakeProviderError
      && error.code === 'TIMEOUT'
      && error.status === null,
  );
});

void test('fake provider exposes deterministic malformed-response failure', async () => {
  const provider = new FakeProvider({
    kind: 'm3u',
    categories: BASIC_CATEGORIES,
    channels: BASIC_CHANNELS,
    failure: 'malformed',
  });

  await assert.rejects(
    provider.listCategories('provider-a'),
    (error: unknown) => error instanceof FakeProviderError
      && error.code === 'MALFORMED_RESPONSE'
      && error.status === null,
  );
});

void test('fake provider can return duplicate external IDs across providers without collapsing identity', async () => {
  const provider = new FakeProvider({
    kind: 'xtream',
    categories: BASIC_CATEGORIES,
    channels: BASIC_CHANNELS,
  });

  const a = await provider.listChannels('provider-a');
  const b = await provider.listChannels('provider-b');

  assert.equal(a[0]?.id, '42');
  assert.equal(b[0]?.id, '42');
  assert.equal(a[0]?.providerId, 'provider-a');
  assert.equal(b[0]?.providerId, 'provider-b');
});

void test('fake provider supports deterministic large channel lists', async () => {
  const provider = new FakeProvider({
    kind: 'xtream',
    categories: [{ id: 'bulk', name: 'Bulk' }],
    channels: makeLargeChannelFixture(1000),
  });

  const channels = await provider.listChannels('provider-large');

  assert.equal(channels.length, 1000);
  assert.equal(channels[0]?.id, 'channel-1');
  assert.equal(channels[999]?.id, 'channel-1000');
  assert.equal(channels[999]?.providerId, 'provider-large');
});
