import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3u, processStreamUrl } from '../src/utils.js';

test('processStreamUrl moves pipe headers into normalized lowercase headers', () => {
  const result = processStreamUrl('https://example.test/live.m3u8|User-Agent=TV&Referer=https://ref.test');

  assert.equal(result.url, 'https://example.test/live.m3u8');
  assert.deepEqual(result.extraHeaders, {
    'user-agent': 'TV',
    referer: 'https://ref.test',
  });
});

test('processStreamUrl preserves edge-* pipe values as query parameters', () => {
  const result = processStreamUrl('https://example.test/live.m3u8?token=abc|edge-cache=1&User-Agent=TV');

  assert.equal(result.url, 'https://example.test/live.m3u8?token=abc&edge-cache=1');
  assert.deepEqual(result.extraHeaders, { 'user-agent': 'TV' });
});

test('parseM3u preserves group, channel number, ClearKey DRM, user agent, headers, and proxy flags', () => {
  const playlist = `#EXTM3U
#EXTINF:-1 tvg-chno="42" group-title="News" proxy="https://proxy.test/",Example News
#KODIPROP:inputstream.adaptive.license_key=00112233445566778899aabbccddeeff:ffeeddccbbaa99887766554433221100
#EXTVLCOPT:http-user-agent=SamsungTV
#EXTHTTP:{"Referer":"https://portal.test"}
https://stream.test/live.m3u8|Authorization=Bearer%20abc`;

  const [channel] = parseM3u(playlist);

  assert.equal(channel.name, 'Example News');
  assert.equal(channel.group, 'News');
  assert.equal(channel.channelNumber, 42);
  assert.equal(channel.url, 'https://stream.test/live.m3u8');
  assert.deepEqual(channel.drm, {
    keyId: '00112233445566778899aabbccddeeff',
    key: 'ffeeddccbbaa99887766554433221100',
  });
  assert.equal(channel.userAgent, 'SamsungTV');
  assert.deepEqual(channel.customHeaders, {
    Referer: 'https://portal.test',
    authorization: 'Bearer%20abc',
  });
  assert.equal(channel.useProxy, true);
  assert.equal(channel.proxyUrl, 'https://proxy.test/');
});

test('parseM3u uses sequential channel numbers when provider numbers are absent', () => {
  const playlist = `#EXTM3U
#EXTINF:-1,One
https://stream.test/1.m3u8
#EXTINF:-1,Two
https://stream.test/2.m3u8`;

  const channels = parseM3u(playlist);

  assert.deepEqual(channels.map((channel) => channel.channelNumber), [1, 2]);
});
