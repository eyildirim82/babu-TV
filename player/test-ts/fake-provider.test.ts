import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeProvider, FakeProviderError } from '../src/providers/fake-provider.js';
import {
  BASIC_CATEGORIES,
  BASIC_CHANNELS,
  DEMO_CREDENTIALS,
  makeLargeChannelFixture,
} from './fixtures/provider-fixtures.js';

void test('fake provider binds provider identity once and returns provider-scoped catalog', async () => {
  const provider = new FakeProvider('provider-a', {
    kind: 'xtream',
    categories: BASIC_CATEGORIES,
    channels: BASIC_CHANNELS,
  });

  const profile = await provider.getProfile();
  const categories = await provider.listCategories();
  const channels = await provider.listChannels();
  const stream = await provider.resolveStream('42');

  assert.equal(provider.providerId, 'provider-a');
  assert.equal(provider.kind, 'xtream');
  assert.deepEqual(profile, {
    providerId: 'provider-a',
    kind: 'xtream',
    accountName: 'Synthetic Account',
    expiresAtMs: null,
    maxConnections: 1,
  });
  assert.deepEqual(categories[0], { providerId: 'provider-a', id: 'news', name: 'News' });
  assert.equal(channels[0]?.providerId, 'provider-a');
  assert.equal(channels[0]?.id, '42');
  assert.equal(stream.url, 'https://example.com/live/provider-a/42.m3u8');
  assert.equal(stream.url.includes(DEMO_CREDENTIALS.username), false);
  assert.equal(stream.url.includes(DEMO_CREDENTIALS.password), false);
});

for (const status of [401, 403, 404, 500] as const) {
  void test(`fake provider exposes deterministic HTTP ${status} failure`, async () => {
    const provider = new FakeProvider('provider-a', {
      kind: 'xtream',
      categories: BASIC_CATEGORIES,
      channels: BASIC_CHANNELS,
      failure: status,
    });

    await assert.rejects(
      provider.listChannels(),
      (error: unknown) => error instanceof FakeProviderError
        && error.code === `HTTP_${status}`
        && error.status === status,
    );
  });
}

void test('fake provider exposes deterministic timeout failure without sleeping', async () => {
  const provider = new FakeProvider('provider-a', {
    kind: 'xtream',
    categories: BASIC_CATEGORIES,
    channels: BASIC_CHANNELS,
    failure: 'timeout',
  });

  await assert.rejects(
    provider.listChannels(),
    (error: unknown) => error instanceof FakeProviderError
      && error.code === 'TIMEOUT'
      && error.status === null,
  );
});

void test('fake provider exposes deterministic malformed-response failure', async () => {
  const provider = new FakeProvider('provider-a', {
    kind: 'm3u',
    categories: BASIC_CATEGORIES,
    channels: BASIC_CHANNELS,
    failure: 'malformed',
  });

  await assert.rejects(
    provider.listCategories(),
    (error: unknown) => error instanceof FakeProviderError
      && error.code === 'MALFORMED_RESPONSE'
      && error.status === null,
  );
});

void test('two fake adapters keep identical external channel IDs provider-scoped', async () => {
  const providerA = new FakeProvider('provider-a', {
    kind: 'xtream',
    categories: BASIC_CATEGORIES,
    channels: BASIC_CHANNELS,
  });
  const providerB = new FakeProvider('provider-b', {
    kind: 'xtream',
    categories: BASIC_CATEGORIES,
    channels: BASIC_CHANNELS,
  });

  const a = await providerA.listChannels();
  const b = await providerB.listChannels();

  assert.equal(a[0]?.id, '42');
  assert.equal(b[0]?.id, '42');
  assert.equal(a[0]?.providerId, 'provider-a');
  assert.equal(b[0]?.providerId, 'provider-b');
});

void test('fake provider supports deterministic large channel lists', async () => {
  const provider = new FakeProvider('provider-large', {
    kind: 'xtream',
    categories: [{ id: 'bulk', name: 'Bulk' }],
    channels: makeLargeChannelFixture(1000),
  });

  const channels = await provider.listChannels();

  assert.equal(channels.length, 1000);
  assert.equal(channels[0]?.id, 'channel-1');
  assert.equal(channels[999]?.id, 'channel-1000');
  assert.equal(channels[999]?.providerId, 'provider-large');
});
