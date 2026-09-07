import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeLogValue, sanitizeUrlForLog } from '../src/logging/sanitize.js';

void test('redacts credentials and tokens from URLs', () => {
  const raw = 'https://alice:secret@example.com/live/42?username=alice&password=secret&token=abc&quality=hd';
  assert.equal(
    sanitizeUrlForLog(raw),
    'https://example.com/live/42?username=%5BREDACTED%5D&password=%5BREDACTED%5D&token=%5BREDACTED%5D&quality=hd',
  );
});

void test('redacts Xtream credentials embedded in stream paths', () => {
  assert.equal(
    sanitizeUrlForLog('https://example.com/live/alice/secret/42.ts'),
    'https://example.com/live/[REDACTED]/[REDACTED]/42.ts',
  );
});

void test('returns non URLs without throwing', () => {
  assert.equal(sanitizeUrlForLog('not-a-url'), 'not-a-url');
});

void test('sanitizes URL strings inside arrays and plain objects', () => {
  assert.deepEqual(
    sanitizeLogValue({ url: 'https://user:pass@example.com/live?key=secret', values: ['plain'] }),
    { url: 'https://example.com/live?key=%5BREDACTED%5D', values: ['plain'] },
  );
});
