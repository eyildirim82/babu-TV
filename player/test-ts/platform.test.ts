import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserPlatform } from '../src/platform/browser-platform.js';
import {
  createPlatform,
  LEGACY_OPTIONAL_TIZEN_KEYS,
  M3_NUMERIC_TIZEN_KEYS,
} from '../src/platform/create-platform.js';

const EXPECTED_LEGACY_KEYS = [
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaFastForward',
  'MediaRewind',
  'MediaTrackNext',
  'MediaTrackPrevious',
  'ChannelUp',
  'ChannelDown',
] as const;

const EXPECTED_M3_NUMERIC_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

void test('preserves the inherited optional Tizen key registration list', () => {
  assert.deepEqual(LEGACY_OPTIONAL_TIZEN_KEYS, EXPECTED_LEGACY_KEYS);
});

void test('keeps M3 numeric Tizen keys separate from the inherited registration list', () => {
  const numericKeys = new Set<string>(EXPECTED_M3_NUMERIC_KEYS);
  assert.deepEqual(M3_NUMERIC_TIZEN_KEYS, EXPECTED_M3_NUMERIC_KEYS);
  assert.equal(LEGACY_OPTIONAL_TIZEN_KEYS.some((key) => numericKeys.has(key)), false);
});

void test('browser platform is safe and reports no Tizen-only capabilities', () => {
  const platform = new BrowserPlatform();

  assert.deepEqual(platform.capabilities(), {
    tizen: false,
    optionsKey: false,
    channelKeys: false,
    numericKeys: false,
  });
  assert.doesNotThrow(() => platform.registerOptionalKeys(EXPECTED_LEGACY_KEYS));
  assert.doesNotThrow(() => platform.exitApp());
});

void test('Tizen platform registers optional keys, detects supported keys, and exits the app', () => {
  const registered: string[] = [];
  let exitCalls = 0;
  const fakeWindow = {
    tizen: {
      tvinputdevice: {
        registerKey(key: string) {
          registered.push(key);
        },
        getSupportedKeys() {
          return [
            { name: 'Tools' },
            { name: 'ChannelUp' },
            { name: 'ChannelDown' },
            { name: '0' },
            { name: '1' },
          ];
        },
      },
      application: {
        getCurrentApplication() {
          return {
            exit() {
              exitCalls += 1;
            },
          };
        },
      },
    },
  };

  const platform = createPlatform(fakeWindow);

  assert.deepEqual(platform.capabilities(), {
    tizen: true,
    optionsKey: true,
    channelKeys: true,
    numericKeys: true,
  });

  platform.registerOptionalKeys(LEGACY_OPTIONAL_TIZEN_KEYS);
  assert.deepEqual(registered, EXPECTED_LEGACY_KEYS);

  platform.registerOptionalKeys(M3_NUMERIC_TIZEN_KEYS);
  assert.deepEqual(registered, [...EXPECTED_LEGACY_KEYS, ...EXPECTED_M3_NUMERIC_KEYS]);

  platform.exitApp();
  assert.equal(exitCalls, 1);
});
