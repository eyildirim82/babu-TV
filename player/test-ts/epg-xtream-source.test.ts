import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderError } from '../src/providers/errors.js';
import type { ProviderHttpClient } from '../src/providers/http/contracts.js';
import {
  decodeXtreamEpgResponse,
  loadXtreamChannelEpg,
} from '../src/epg/xtream-source.js';

test('EPG-X decodes Xtream listings into source programs', () => {
  const rows = decodeXtreamEpgResponse({
    epg_listings: [{
      stream_id: '42',
      channel_id: 'trt1.tr',
      title: 'SGFiZXJsZXI=',
      description: 'R8O8bsO8biDDtnpldGk=',
      start_timestamp: '100',
      stop_timestamp: 200,
    }],
  }, '42');

  assert.deepEqual(rows, [{
    sourceChannel: { providerChannelId: '42', tvgId: 'trt1.tr', name: null },
    startMs: 100000,
    endMs: 200000,
    title: 'Haberler',
    description: 'Günün özeti',
  }]);
});

test('EPG-X skips malformed rows while valid siblings survive', () => {
  const rows = decodeXtreamEpgResponse({
    epg_listings: [
      {
        stream_id: '41',
        channel_id: 'bad-time',
        title: 'SGFiZXJsZXI=',
        start_timestamp: 'not-a-time',
        stop_timestamp: 200,
      },
      {
        stream_id: '42',
        channel_id: 'bad-title',
        title: '%%%',
        start_timestamp: 100,
        stop_timestamp: 200,
      },
      {
        epg_id: 'fallback.epg',
        title: 'SGFiZXJsZXI=',
        start_timestamp: 300,
        stop_timestamp: '400',
      },
      {
        stream_id: 43,
        channel_id: 'desc.invalid',
        title: 'SGFiZXJsZXI=',
        description: '%%%',
        start_timestamp: 500,
        stop_timestamp: 600,
      },
    ],
  }, '42');

  assert.deepEqual(rows, [
    {
      sourceChannel: { providerChannelId: '42', tvgId: 'fallback.epg', name: null },
      startMs: 300000,
      endMs: 400000,
      title: 'Haberler',
      description: null,
    },
    {
      sourceChannel: { providerChannelId: '43', tvgId: 'desc.invalid', name: null },
      startMs: 500000,
      endMs: 600000,
      title: 'Haberler',
      description: null,
    },
  ]);
});

test('EPG-X rejects malformed listing containers and accepts an empty listing array', () => {
  assert.throws(
    () => decodeXtreamEpgResponse({}, '42'),
    (error: unknown) => error instanceof ProviderError && error.code === 'MALFORMED',
  );
  assert.throws(
    () => decodeXtreamEpgResponse({ epg_listings: '' }, '42'),
    (error: unknown) => error instanceof ProviderError && error.code === 'MALFORMED',
  );
  assert.deepEqual(decodeXtreamEpgResponse({ epg_listings: [] }, '42'), []);
});

test('EPG-X preserves ProviderError classification and sanitizes unknown failures', async () => {
  const authHttp: ProviderHttpClient = {
    async getJson<T>() { throw new ProviderError('AUTH', 401, 'Provider authentication failed.'); },
    async getText() { return ''; },
  };
  await assert.rejects(
    () => loadXtreamChannelEpg(authHttp, 'https://synthetic.invalid/redacted', '42'),
    (error: unknown) => error instanceof ProviderError && error.code === 'AUTH',
  );

  const unknownHttp: ProviderHttpClient = {
    async getJson<T>() { throw new Error('https://secret.invalid/?username=u&password=p'); },
    async getText() { return ''; },
  };
  await assert.rejects(
    () => loadXtreamChannelEpg(unknownHttp, 'https://synthetic.invalid/redacted', '42'),
    (error: unknown) => error instanceof ProviderError
      && error.code === 'NETWORK'
      && !error.message.includes('secret.invalid'),
  );
});
