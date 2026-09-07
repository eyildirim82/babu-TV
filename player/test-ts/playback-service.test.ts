import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackService } from '../src/playback/playback-service.js';
import { createAvplayAdapter } from '../src/playback/avplay-adapter.js';

void test('playback service preserves legacy channel objects while routing through the primary adapter', async () => {
  const loaded: unknown[] = [];
  let stops = 0;
  const legacyPlayer = {
    async initPlayer() { return true; },
    async loadChannel(channel: unknown) { loaded.push(channel); return true; },
    stop() { stops += 1; },
    togglePlay() {},
    reloadChannel() {},
    onBuffering() {},
    onTrackChange() {},
    onChannelAdvance() {},
    onProxySuggestion() {},
    getActiveHeight() { return 1080; },
    getActiveBandwidth() { return 4_000_000; },
    getBufferingPercent() { return 75; },
    getPlayer() { return { kind: 'legacy' }; },
    getResolutions() { return [720, 1080]; },
    selectResolution() {},
    getPlaybackEngine() { return 'avplay' as const; },
  };
  const service = createPlaybackService(legacyPlayer);
  const channel = { url: 'https://example.test/live/42', name: 'Example', drm: { keyId: 'id', key: 'key' } };

  assert.equal(await service.loadChannel(channel), true);
  assert.equal(loaded[0], channel);

  const result = await service.play({
    url: 'https://example.test/live/99',
    userAgent: 'BabusTV-Test',
    referer: 'https://example.test/',
    headers: { Origin: 'https://example.test' },
  });

  assert.deepEqual(loaded[1], {
    url: 'https://example.test/live/99',
    userAgent: 'BabusTV-Test',
    customHeaders: {
      Origin: 'https://example.test',
      Referer: 'https://example.test/',
    },
  });
  assert.deepEqual(result, { ok: true, engine: 'avplay', error: null });

  service.stop();
  assert.equal(stops, 1);
  assert.equal(service.getActiveHeight(), 1080);
  assert.deepEqual(service.getResolutions(), [720, 1080]);
});

void test('playback service reports a failed legacy load without inventing an engine', async () => {
  const legacyPlayer = {
    async initPlayer() { return true; },
    async loadChannel() { return false; },
    stop() {},
    togglePlay() {},
    reloadChannel() {},
    onBuffering() {},
    onTrackChange() {},
    onChannelAdvance() {},
    onProxySuggestion() {},
    getActiveHeight() { return null; },
    getActiveBandwidth() { return null; },
    getBufferingPercent() { return 0; },
    getPlayer() { return null; },
    getResolutions() { return []; },
    selectResolution() {},
    getPlaybackEngine() { return null; },
  };
  const service = createPlaybackService(legacyPlayer);

  assert.deepEqual(
    await service.play({ url: 'https://example.test/broken' }),
    { ok: false, engine: null, error: 'UNKNOWN' },
  );
});

void test('AVPlay adapter preserves the inherited native API shape', async () => {
  const calls: unknown[][] = [];
  const legacyAvplay = {
    isAvailable() { return true; },
    onBuffering(callback: unknown) { calls.push(['buffering', callback]); },
    onError(callback: unknown) { calls.push(['error', callback]); },
    async play(url: string, options: unknown) { calls.push(['play', url, options]); return true; },
    pause() { calls.push(['pause']); },
    resume() { calls.push(['resume']); },
    stop() { calls.push(['stop']); },
  };
  const adapter = createAvplayAdapter(legacyAvplay);

  assert.equal(adapter.isAvailable(), true);
  assert.equal(await adapter.play('https://example.test/native', { userAgent: 'UA', referer: 'https://ref.test' }), true);
  adapter.pause();
  adapter.resume();
  adapter.stop();

  assert.deepEqual(calls.slice(0, 4), [
    ['play', 'https://example.test/native', { userAgent: 'UA', referer: 'https://ref.test' }],
    ['pause'],
    ['resume'],
    ['stop'],
  ]);
});
