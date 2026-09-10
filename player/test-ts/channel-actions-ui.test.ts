import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateChannelAction,
  buildChannelActions,
  createChannelActionsState,
  reduceChannelActions,
} from '../src/channel-actions/channel-actions-model.js';

const providerId = 'provider-1';
const channelId = 'channel-1';

test('builds watch and favorite actions with favorite label derived from state', () => {
  assert.deepEqual(
    buildChannelActions({ providerId, channelId, isFavorite: false, programInfoAvailable: false }),
    [
      { id: 'WATCH', label: 'İzle' },
      { id: 'FAVORITE', label: 'Favoriye Ekle' },
    ],
  );

  assert.deepEqual(
    buildChannelActions({ providerId, channelId, isFavorite: true, programInfoAvailable: false }),
    [
      { id: 'WATCH', label: 'İzle' },
      { id: 'FAVORITE', label: 'Favorilerden Çıkar' },
    ],
  );
});

test('includes program info only when it is available', () => {
  assert.deepEqual(
    buildChannelActions({ providerId, channelId, isFavorite: false, programInfoAvailable: true }),
    [
      { id: 'WATCH', label: 'İzle' },
      { id: 'FAVORITE', label: 'Favoriye Ekle' },
      { id: 'PROGRAM_INFO', label: 'Program Bilgisi' },
    ],
  );
});

test('moving focus changes only the focused action and never emits an intent', () => {
  const actions = buildChannelActions({
    providerId,
    channelId,
    isFavorite: false,
    programInfoAvailable: true,
  });
  const initial = createChannelActionsState(actions);
  const moved = reduceChannelActions(initial, { type: 'MOVE', direction: 'NEXT', actions });

  assert.equal(initial.focusedActionId, 'WATCH');
  assert.deepEqual(moved, { open: true, focusedActionId: 'FAVORITE' });
});

test('focus stays stable by action id when the visible action list changes', () => {
  const withInfo = buildChannelActions({
    providerId,
    channelId,
    isFavorite: false,
    programInfoAvailable: true,
  });
  const state = { open: true, focusedActionId: 'FAVORITE' as const };
  const withoutInfo = buildChannelActions({
    providerId,
    channelId,
    isFavorite: false,
    programInfoAvailable: false,
  });

  assert.deepEqual(reduceChannelActions(state, { type: 'SYNC', actions: withoutInfo }), state);
  assert.equal(withInfo[1]?.id, 'FAVORITE');
});

test('back closes only the channel action layer', () => {
  const actions = buildChannelActions({
    providerId,
    channelId,
    isFavorite: false,
    programInfoAvailable: false,
  });
  const state = createChannelActionsState(actions);

  assert.deepEqual(reduceChannelActions(state, { type: 'BACK' }), {
    open: false,
    focusedActionId: 'WATCH',
  });
});

test('only watch activation emits a play intent', () => {
  assert.deepEqual(activateChannelAction('WATCH', { providerId, channelId }), {
    type: 'PLAY_CHANNEL',
    providerId,
    channelId,
  });

  assert.deepEqual(activateChannelAction('FAVORITE', { providerId, channelId }), {
    type: 'TOGGLE_FAVORITE',
    providerId,
    channelId,
  });

  assert.deepEqual(activateChannelAction('PROGRAM_INFO', { providerId, channelId }), {
    type: 'SHOW_PROGRAM_INFO',
    providerId,
    channelId,
  });
});
