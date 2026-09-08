import test from 'node:test';
import assert from 'node:assert/strict';
import {
  M3uParseError,
  parseM3uDocument,
} from '../src/providers/m3u/m3u-parser.js';
import {
  M3U_COMPLEX_PLAYLIST,
  M3U_MALFORMED_ROWS,
  NOT_M3U_DOCUMENT,
} from './fixtures/m3u-fixtures.js';

void test('M3U parser preserves quoted commas and normalizes display metadata', () => {
  const entries = parseM3uDocument(M3U_COMPLEX_PLAYLIST);

  assert.equal(entries.length, 4);
  assert.deepEqual(entries[0], {
    tvgId: 'news.intl',
    name: 'News, International',
    group: 'News, International',
    logoUrl: 'https://example.com/news.png',
    channelNumber: 7,
    streamUrl: 'https://stream.example.com/live/news.m3u8?edge-token=abc123',
    userAgent: 'BabusTV-Test/1.0',
    headers: {
      Referer: 'https://example.com/',
      'X-Test': 'from-ext-http',
      authorization: 'Bearer%20demo',
      'x-test': 'from-pipe',
    },
    drm: { keyId: 'ABCDEF01', key: '1234ABCD' },
    useProxy: true,
    proxyUrl: 'https://proxy.example.com/fetch',
  });
});

void test('M3U parser accepts channel-number and URL ClearKey fallback', () => {
  const entries = parseM3uDocument(M3U_COMPLEX_PLAYLIST);

  assert.deepEqual(entries[1], {
    tvgId: 'sports-1',
    name: 'Sports One',
    group: 'Sports',
    logoUrl: null,
    channelNumber: 12,
    streamUrl: 'https://stream.example.com/live/sports.ts?drmLicense=AABBCCDD:EEFF0011',
    userAgent: null,
    headers: {},
    drm: { keyId: 'aabbccdd', key: 'eeff0011' },
    useProxy: false,
    proxyUrl: null,
  });
});

void test('M3U parser preserves explicit false proxy and nullable optional metadata', () => {
  const entries = parseM3uDocument(M3U_COMPLEX_PLAYLIST);

  assert.equal(entries[2]?.name, 'Sports Two');
  assert.equal(entries[2]?.useProxy, false);
  assert.equal(entries[2]?.proxyUrl, null);

  assert.deepEqual(entries[3], {
    tvgId: 'music-1',
    name: 'Music',
    group: null,
    logoUrl: 'https://example.com/music.png',
    channelNumber: null,
    streamUrl: 'https://stream.example.com/music.ts',
    userAgent: null,
    headers: {},
    drm: null,
    useProxy: false,
    proxyUrl: null,
  });
});

void test('M3U parser skips malformed entries and malformed EXTHTTP without rejecting the playlist', () => {
  const entries = parseM3uDocument(M3U_MALFORMED_ROWS);

  assert.deepEqual(entries, [{
    tvgId: 'valid',
    name: 'Valid Channel',
    group: 'General',
    logoUrl: null,
    channelNumber: null,
    streamUrl: 'https://stream.example.com/valid.ts',
    userAgent: null,
    headers: {},
    drm: null,
    useProxy: false,
    proxyUrl: null,
  }]);
});

void test('M3U parser rejects documents that are not recognizable as M3U', () => {
  assert.throws(
    () => parseM3uDocument(NOT_M3U_DOCUMENT),
    (error: unknown) => {
      assert.ok(error instanceof M3uParseError);
      assert.equal(error.message, 'M3U document is malformed.');
      return true;
    },
  );
});

void test('M3U parser accepts CRLF documents', () => {
  const playlist = '#EXTM3U\r\n#EXTINF:-1 tvg-id="one",One\r\nhttps://stream.example.com/one.ts\r\n';

  assert.equal(parseM3uDocument(playlist)[0]?.tvgId, 'one');
});
