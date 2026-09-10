import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeXtreamEpgResponse } from '../src/epg/xtream-source.js';

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
