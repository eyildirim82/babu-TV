import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpgProgram, normalizeEpgPrograms } from '../src/epg/normalize.js';

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

test('EPG-N rejects invalid intervals and blank titles', () => {
  const base = {
    sourceChannel: { providerChannelId: null, tvgId: null, name: null },
    description: null,
  };
  assert.equal(normalizeEpgProgram('c1', { ...base, startMs: 10, endMs: 10, title: 'X' }), null);
  assert.equal(normalizeEpgProgram('c1', { ...base, startMs: Number.NaN, endMs: 20, title: 'X' }), null);
  assert.equal(normalizeEpgProgram('c1', { ...base, startMs: 10, endMs: 20, title: '   ' }), null);
});

test('EPG-N removes exact duplicates and sorts deterministically', () => {
  const ref = { providerChannelId: null, tvgId: null, name: null };
  const rows = normalizeEpgPrograms('c1', [
    { sourceChannel: ref, startMs: 20, endMs: 30, title: 'B', description: null },
    { sourceChannel: ref, startMs: 10, endMs: 20, title: 'A', description: null },
    { sourceChannel: ref, startMs: 10, endMs: 20, title: 'A', description: null },
  ]);
  assert.deepEqual(rows.map((row) => row.title), ['A', 'B']);
});
