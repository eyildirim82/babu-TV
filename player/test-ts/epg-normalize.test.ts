import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpgProgram } from '../src/epg/normalize.js';

test('EPG-N normalizes one valid source program', () => {
  assert.deepEqual(
    normalizeEpgProgram('c1', {
      sourceChannel: { providerChannelId: null, tvgId: 'tv-1', name: ' Kanal ' },
      startMs: 100,
      endMs: 200,
      title: '  Haberler  ',
      description: '  Günün özeti  ',
    }),
    {
      channelId: 'c1',
      startMs: 100,
      endMs: 200,
      title: 'Haberler',
      description: 'Günün özeti',
    },
  );
});
