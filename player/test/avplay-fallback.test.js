import test from 'node:test';
import assert from 'node:assert/strict';

function installPlatform({ available = true, prepareSucceeds = true, emitFirstFrame = false } = {}) {
  const calls = [];
  let listener = null;

  const avObject = {
    classList: {
      add(name) { calls.push(['class:add', name]); },
      remove(name) { calls.push(['class:remove', name]); },
    },
  };

  const avplay = {
    setStreamingProperty(name, value) { calls.push(['property', name, value]); },
    setListener(value) { listener = value; calls.push(['listener']); },
    open(url) { calls.push(['open', url]); },
    setDisplayRect(x, y, width, height) { calls.push(['rect', x, y, width, height]); },
    prepareAsync(onSuccess, onFailure) {
      calls.push(['prepare']);
      if (prepareSucceeds) onSuccess();
      else onFailure();
    },
    play() {
      calls.push(['play']);
      if (emitFirstFrame && listener?.oncurrentplaytime) listener.oncurrentplaytime(1000);
    },
    stop() { calls.push(['stop']); },
    close() { calls.push(['close']); },
  };

  globalThis.window = available ? { webapis: { avplay } } : {};
  globalThis.document = {
    getElementById(id) {
      return id === 'avplayer' ? avObject : null;
    },
  };

  return { calls };
}

async function freshModule() {
  return import(`../src/avplay.js?fallback-test=${Date.now()}-${Math.random()}`);
}

test.afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
});

test('native play resolves false when AVPlay is unavailable', async () => {
  installPlatform({ available: false });
  const avplay = await freshModule();

  assert.equal(await avplay.play('https://example.test/live.m3u8'), false);
});

test('native play resolves false when prepareAsync fails', async () => {
  installPlatform({ prepareSucceeds: false });
  const avplay = await freshModule();

  assert.equal(await avplay.play('https://example.test/live.m3u8'), false);
});

test('native play resolves true on first playback frame and active stop closes the session', async () => {
  const { calls } = installPlatform({ emitFirstFrame: true });
  const avplay = await freshModule();

  assert.equal(await avplay.play('https://example.test/live.m3u8'), true);
  avplay.stop();

  assert.equal(calls.some(([name]) => name === 'stop'), true);
  assert.equal(calls.some(([name]) => name === 'close'), true);
});
