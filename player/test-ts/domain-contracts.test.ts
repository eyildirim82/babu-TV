import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChannelKey } from '../src/domain/models.js';

void test('channel identity is provider scoped', () => {
  assert.equal(makeChannelKey('provider-a', '42'), 'provider-a:42');
  assert.equal(makeChannelKey('provider-b', '42'), 'provider-b:42');
});
