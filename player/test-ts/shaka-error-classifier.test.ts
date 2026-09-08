import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyShakaFailure } from '../src/playback/shaka-error-classifier.js';

void test('classifies inherited Shaka network and HTTP failures into M3 playback errors', () => {
  assert.equal(classifyShakaFailure({ code: 1001, data: [null, 401] }), 'AUTH');
  assert.equal(classifyShakaFailure({ code: 1001, data: [null, 403] }), 'AUTH');
  assert.equal(classifyShakaFailure({ code: 1001, data: [null, 404] }), 'STREAM_NOT_FOUND');
  assert.equal(classifyShakaFailure({ code: 1001, data: [null, 408] }), 'TIMEOUT');
  assert.equal(classifyShakaFailure({ code: 1001, data: [null, 500] }), 'NETWORK');
  assert.equal(classifyShakaFailure({ code: 1002 }), 'NETWORK');
  assert.equal(classifyShakaFailure({ code: 1003 }), 'TIMEOUT');
});

void test('classifies inherited Shaka media and native failures into M3 playback errors', () => {
  assert.equal(classifyShakaFailure({ code: 4032 }), 'UNSUPPORTED_CODEC');
  assert.equal(classifyShakaFailure({ code: 3018 }), 'ENGINE_FAILURE');
  assert.equal(classifyShakaFailure({ code: 3014 }), 'ENGINE_FAILURE');
  assert.equal(classifyShakaFailure({ code: 3015 }), 'ENGINE_FAILURE');
  assert.equal(classifyShakaFailure({ code: 3016 }), 'ENGINE_FAILURE');
  assert.equal(classifyShakaFailure(new TypeError('native player crash')), 'ENGINE_FAILURE');
  assert.equal(classifyShakaFailure({ code: 9999 }), 'UNKNOWN');
  assert.equal(classifyShakaFailure(null), 'UNKNOWN');
});
