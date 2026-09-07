import test from 'node:test';
import assert from 'node:assert/strict';

function installPlatform({ withAvplay = true } = {}) {
  const calls = [];
  const avObject = {
    classList: {
      add(name) { calls.push(['class:add', name]); },
      remove(name) { calls.push(['class:remove', name]); },
    },
  };

  const avplay = {
    stop() { calls.push(['stop']); },
    close() { calls.push(['close']); },
  };

  globalThis.window = withAvplay ? { webapis: { avplay } } : {};
  globalThis.document = {
    getElementById(id) {
      return id === 'avplayer' ? avObject : null;
    },
  };

  return { calls, avplay };
}

async function freshModule() {
  return import(`../src/avplay.js?test=${Date.now()}-${Math.random()}`);
}

test.afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
});

test('reports unavailable outside Tizen', async () => {
  installPlatform({ withAvplay: false });
  const avplayModule = await freshModule();

  assert.equal(avplayModule.isAvailable(), false);
});

test('stop does not call native stop or close before a native session is opened', async () => {
  const { calls } = installPlatform();
  const avplayModule = await freshModule();

  avplayModule.stop();

  assert.equal(calls.some(([name]) => name === 'stop'), false);
  assert.equal(calls.some(([name]) => name === 'close'), false);
});
