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

test('M3U-V never echoes a credential URL through an error message', () => {
  const raw = 'not-a-url?opaque=test-value';
  const result = validateM3uEntry({ playlistUrl: raw });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'INVALID_URL');
  assert.deepEqual(result.input, { playlistUrl: raw });
  assert.equal('message' in result, false);
});

test('M3U-V preserves credential-bearing query data only inside the success credential', () => {
  const result = validateM3uEntry({
    playlistUrl: 'https://example.invalid/list.m3u?opaque=test-value#ignored',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.credential.playlistUrl, 'https://example.invalid/list.m3u?opaque=test-value');
});

test('M3U-V normalizes uppercase HTTP(S) input and trailing whitespace', () => {
  assert.deepEqual(validateM3uEntry({ playlistUrl: '  HTTPS://EXAMPLE.INVALID/LIST.M3U  ' }), {
    ok: true,
    credential: { kind: 'm3u', playlistUrl: 'https://example.invalid/LIST.M3U' },
  });
});

test('M3U-V accepts plain HTTP playlist URLs', () => {
  assert.deepEqual(validateM3uEntry({ playlistUrl: 'http://example.invalid/list.m3u' }), {
    ok: true,
    credential: { kind: 'm3u', playlistUrl: 'http://example.invalid/list.m3u' },
  });
});

test('M3U-V rejects relative URLs without changing the failed input', () => {
  const raw = '/list.m3u';
  assert.deepEqual(validateM3uEntry({ playlistUrl: raw }), {
    ok: false,
    code: 'INVALID_URL',
    input: { playlistUrl: raw },
  });
});

test('M3U-V requires non-whitespace playlist input', () => {
  const raw = '   \t\n  ';
  assert.deepEqual(validateM3uEntry({ playlistUrl: raw }), {
    ok: false,
    code: 'REQUIRED',
    input: { playlistUrl: raw },
  });
});

test('M3U-V rejects unsupported javascript URLs', () => {
  const raw = 'javascript:alert(1)';
  assert.deepEqual(validateM3uEntry({ playlistUrl: raw }), {
    ok: false,
    code: 'UNSUPPORTED_PROTOCOL',
    input: { playlistUrl: raw },
  });
});

test('M3U-V rejects malformed percent encoding in the URL host', () => {
  const raw = 'https://exa%mple.invalid/list.m3u';
  assert.deepEqual(validateM3uEntry({ playlistUrl: raw }), {
    ok: false,
    code: 'INVALID_URL',
    input: { playlistUrl: raw },
  });
});
