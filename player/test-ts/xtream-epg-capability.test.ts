import assert from 'node:assert/strict';
import test from 'node:test';
import type { Channel } from '../src/domain/models.js';
import { ProviderError } from '../src/providers/errors.js';
import type { ProviderHttpClient } from '../src/providers/http/contracts.js';
import { XtreamProvider } from '../src/providers/xtream/xtream-provider.js';

const credential = {
  kind: 'xtream' as const,
  serverUrl: 'https://synthetic.invalid/base',
  username: 'synthetic-user',
  password: 'synthetic-password',
};

function liveChannel(providerId: string, id: string, name: string): Channel {
  return { providerId, id, name, categoryId: null, logoUrl: null, number: null };
}

test('EPG-PI attaches a provider-scoped Xtream EPG source using the bounded EPG-X loader', async () => {
  const requests: Array<{ action: string | null; streamId: string | null }> = [];
  const http: ProviderHttpClient = {
    async getJson<T>(url: string): Promise<T> {
      const parsed = new URL(url);
      requests.push({
        action: parsed.searchParams.get('action'),
        streamId: parsed.searchParams.get('stream_id'),
      });
      return {
        epg_listings: [{
          stream_id: parsed.searchParams.get('stream_id'),
          title: 'QnVsbGV0aW4=',
          description: 'U3ludGhldGljIHN1bW1hcnk=',
          start_timestamp: 120,
          stop_timestamp: 180,
        }],
      } as T;
    },
    async getText(): Promise<string> { return ''; },
  };

  const provider = new XtreamProvider('p1', credential, http);
  assert.ok(provider.epg);

  const channels = [
    liveChannel('p1', 'c1', 'News'),
    liveChannel('p2', 'c1', 'Other Provider'),
  ];
  assert.deepEqual(provider.epg.describeChannels(channels), [{
    providerId: 'p1',
    channelId: 'c1',
    name: 'News',
    epgIds: ['c1'],
  }]);

  const source = provider.epg.createSource(channels);
  assert.equal(source.providerId, 'p1');
  assert.deepEqual(await source.listPrograms({ startMs: 100_000, endMs: 200_000 }), [{
    sourceChannel: { providerChannelId: 'c1', tvgId: null, name: null },
    startMs: 120_000,
    endMs: 180_000,
    title: 'Bulletin',
    description: 'Synthetic summary',
  }]);
  assert.deepEqual(requests, [{ action: 'get_short_epg', streamId: 'c1' }]);
});

test('EPG-PI keeps credential-bearing Xtream EPG request details out of errors', async () => {
  const http: ProviderHttpClient = {
    async getJson(): Promise<never> {
      throw new Error('transport detail https://synthetic.invalid/?username=synthetic-user&password=synthetic-password');
    },
    async getText(): Promise<string> { return ''; },
  };
  const provider = new XtreamProvider('p1', credential, http);
  assert.ok(provider.epg);

  await assert.rejects(
    () => provider.epg!.createSource([liveChannel('p1', 'c1', 'News')])
      .listPrograms({ startMs: 100_000, endMs: 200_000 }),
    (error: unknown) => error instanceof ProviderError
      && error.code === 'NETWORK'
      && !error.message.includes('synthetic-user')
      && !error.message.includes('synthetic-password')
      && !error.message.includes('synthetic.invalid'),
  );
});
