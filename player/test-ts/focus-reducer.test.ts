import test from 'node:test';
import assert from 'node:assert/strict';
import type { FocusState } from '../src/domain/actions.js';
import { reduceFocus } from '../src/focus/focus-reducer.js';

function state(overrides: Partial<FocusState> = {}): FocusState {
  return {
    screen: 'LIVE_TV',
    zone: 'CHANNEL',
    itemId: null,
    restoreItemId: null,
    ...overrides,
  };
}

void test('sync focuses the currently playing channel when there is no current focus', () => {
  const next = reduceFocus(state(), {
    type: 'SYNC_ITEMS',
    itemIds: ['a', 'b', 'c'],
    playingItemId: 'b',
  });

  assert.equal(next.itemId, 'b');
});

void test('sync preserves current stable item ID across order changes', () => {
  const next = reduceFocus(state({ itemId: 'b' }), {
    type: 'SYNC_ITEMS',
    itemIds: ['c', 'b', 'a'],
    playingItemId: 'a',
  });

  assert.equal(next.itemId, 'b');
});

void test('sync restores the saved target when current and playing targets are unavailable', () => {
  const next = reduceFocus(state({ restoreItemId: 'c' }), {
    type: 'SYNC_ITEMS',
    itemIds: ['a', 'b', 'c'],
    playingItemId: null,
  });

  assert.equal(next.itemId, 'c');
});

void test('sync falls back to first item when focused and restore targets were removed', () => {
  const next = reduceFocus(state({ itemId: 'removed', restoreItemId: 'also-removed' }), {
    type: 'SYNC_ITEMS',
    itemIds: ['a', 'b'],
    playingItemId: 'not-present',
  });

  assert.equal(next.itemId, 'a');
});

void test('sync clears focus when the list becomes empty', () => {
  const next = reduceFocus(state({ itemId: 'a' }), {
    type: 'SYNC_ITEMS',
    itemIds: [],
    playingItemId: 'a',
  });

  assert.equal(next.itemId, null);
});

void test('move changes focus by one item without wrapping at list boundaries', () => {
  const itemIds = ['a', 'b', 'c'];

  assert.equal(reduceFocus(state({ itemId: 'a' }), {
    type: 'MOVE_ITEM', itemIds, direction: 'PREVIOUS',
  }).itemId, 'a');

  assert.equal(reduceFocus(state({ itemId: 'a' }), {
    type: 'MOVE_ITEM', itemIds, direction: 'NEXT',
  }).itemId, 'b');

  assert.equal(reduceFocus(state({ itemId: 'c' }), {
    type: 'MOVE_ITEM', itemIds, direction: 'NEXT',
  }).itemId, 'c');
});
