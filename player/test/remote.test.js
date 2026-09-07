import test from 'node:test';
import assert from 'node:assert/strict';
import { init, destroy } from '../src/remote.js';

function installFakeDocument() {
  let keydownHandler = null;

  globalThis.document = {
    activeElement: null,
    addEventListener(type, handler) {
      if (type === 'keydown') keydownHandler = handler;
    },
    removeEventListener(type, handler) {
      if (type === 'keydown' && keydownHandler === handler) keydownHandler = null;
    },
    getElementById() {
      return null;
    },
  };

  return {
    press({ key, keyCode = 0 }) {
      const event = {
        key,
        keyCode,
        preventDefault() {},
        stopPropagation() {},
      };
      keydownHandler(event);
    },
  };
}

test.afterEach(() => {
  destroy();
  delete globalThis.document;
});

test('normalizes the six core remote controls', () => {
  const fake = installFakeDocument();
  const actions = [];
  init((...args) => actions.push(args));

  fake.press({ key: 'ArrowUp', keyCode: 38 });
  fake.press({ key: 'ArrowDown', keyCode: 40 });
  fake.press({ key: 'ArrowLeft', keyCode: 37 });
  fake.press({ key: 'ArrowRight', keyCode: 39 });
  fake.press({ key: 'Enter', keyCode: 13 });
  fake.press({ key: 'GoBack', keyCode: 10009 });

  assert.deepEqual(actions, [
    ['up'],
    ['down'],
    ['left'],
    ['right'],
    ['select'],
    ['back'],
  ]);
});

test('normalizes optional Samsung channel and color keys', () => {
  const fake = installFakeDocument();
  const actions = [];
  init((...args) => actions.push(args));

  fake.press({ key: 'ChannelUp' });
  fake.press({ key: 'ChannelDown' });
  fake.press({ key: 'ColorF0Red' });
  fake.press({ key: 'ColorF3Blue' });

  assert.deepEqual(actions, [
    ['channelUp'],
    ['channelDown'],
    ['red'],
    ['blue'],
  ]);
});

test('buffers numeric input and emits a channel number after 500ms', async () => {
  const fake = installFakeDocument();
  const actions = [];
  init((...args) => actions.push(args));

  fake.press({ key: '1', keyCode: 49 });
  fake.press({ key: '2', keyCode: 50 });
  fake.press({ key: '4', keyCode: 52 });

  await new Promise((resolve) => setTimeout(resolve, 550));

  assert.deepEqual(actions, [['number', 124]]);
});
