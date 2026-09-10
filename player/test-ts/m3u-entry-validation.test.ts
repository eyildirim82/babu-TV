import test from 'node:test';
import assert from 'node:assert/strict';
import { validateM3uEntry } from '../src/providers/m3u/m3u-entry-validation.js';

test('M3U-V validates HTTP(S) playlist input and preserves failed input', () => {
  assert.deepEqual(validateM3uEntry({ playlistUrl: '  https://example.invalid/list.m3u  ' }), {
    ok: true,
    credential: { kind: 'm3u', playlistUrl: 'https://example.invalid/list.m3u' },
  });

  assert.deepEqual(validateM3uEntry({ playlistUrl: '  ftp://example.invalid/list.m3u  ' }), {
    ok: false,
    code: 'UNSUPPORTED_PROTOCOL',
    input: { playlistUrl: '  ftp://example.invalid/list.m3u  ' },
  });
});
