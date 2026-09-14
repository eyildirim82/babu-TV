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
    pressEvent(event) {
      keydownHandler(event);
    },
  };
}

function focusLiveTvSearchInput() {
  globalThis.document.activeElement = {
    tagName: 'INPUT',
    classList: { contains: (name) => name === 'live-tv-search-input' },
  };
}

function pressTracked(fake, key, keyCode = 0) {
  let prevented = false;
  fake.pressEvent({ key, keyCode, preventDefault() { prevented = true; }, stopPropagation() {} });
  return prevented;
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

test('digit mode emits each digit immediately without legacy buffering', async () => {
  const fake = installFakeDocument();
  const actions = [];
  init((...args) => actions.push(args), { numericMode: 'digits' });

  fake.press({ key: '1', keyCode: 49 });
  fake.press({ key: '2', keyCode: 50 });

  assert.deepEqual(actions, [['digit', 1], ['digit', 2]]);

  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.deepEqual(actions, [['digit', 1], ['digit', 2]]);
});

test('destroy clears pending legacy numeric state before a later init', async () => {
  const fake = installFakeDocument();
  const firstActions = [];
  init((...args) => firstActions.push(args));
  fake.press({ key: '1', keyCode: 49 });

  destroy();

  const secondActions = [];
  init((...args) => secondActions.push(args));
  fake.press({ key: '2', keyCode: 50 });

  await new Promise((resolve) => setTimeout(resolve, 550));

  assert.deepEqual(firstActions, []);
  assert.deepEqual(secondActions, [['number', 2]]);
});

test('a focused Live TV Search input keeps text-editing keys', () => {
  const fake = installFakeDocument();
  const actions = [];
  init((...args) => actions.push(args), { numericMode: 'digits' });
  focusLiveTvSearchInput();

  const prevented = [
    pressTracked(fake, 'r', 82),
    pressTracked(fake, 'R', 82),
    pressTracked(fake, '5', 53),
    pressTracked(fake, ' ', 32),
    pressTracked(fake, 'Backspace', 8),
    pressTracked(fake, 'ArrowLeft', 37),
    pressTracked(fake, 'ArrowRight', 39),
    pressTracked(fake, 'ş', 0),
  ];

  assert.deepEqual(actions, []);
  assert.deepEqual(prevented, [false, false, false, false, false, false, false, false]);
});

test('a focused Live TV Search input still routes Search navigation keys to the app', () => {
  const fake = installFakeDocument();
  const actions = [];
  init((...args) => actions.push(args));
  focusLiveTvSearchInput();

  const prevented = [
    pressTracked(fake, 'ArrowUp', 38),
    pressTracked(fake, 'ArrowDown', 40),
    pressTracked(fake, 'Enter', 13),
    pressTracked(fake, 'GoBack', 10009),
    pressTracked(fake, 'Escape', 27),
  ];

  assert.deepEqual(actions, [['up'], ['down'], ['select'], ['back'], ['back']]);
  assert.deepEqual(prevented, [true, true, true, true, true]);
});
