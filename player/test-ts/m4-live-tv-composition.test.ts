import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Channel, EpgProgram } from '../src/domain/models.js';
import {
  createLiveTvFeatureComposition,
  type LiveTvFeaturePorts,
} from '../src/live-tv/live-tv-feature-composition.js';

function channel(id: string, providerId = 'provider-1', name = `Channel ${id}`): Channel {
  return {
    providerId,
    id,
    name,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

function program(channelId: string, title = `Program ${channelId}`): EpgProgram {
  return {
    channelId,
    startMs: 1_000,
    endMs: 2_000,
    title,
    description: `${title} detail`,
  };
}

const categories: readonly Category[] = [];

function refreshInput(channels: readonly Channel[] = [channel('a')]) {
  return {
    providerId: 'provider-1',
    channels,
    visibleChannels: channels,
    categories,
    highlightedChannelId: channels[0]?.id ?? null,
  };
}

void test('M4-COMP exposes injected feature composition without playback ownership', async () => {
  const calls: string[] = [];
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent(providerId, channelId) {
        calls.push(`epg-current:${providerId}:${channelId}`);
        return null;
      },
      async getNext(providerId, channelId) {
        calls.push(`epg-next:${providerId}:${channelId}`);
        return null;
      },
    },
    favorites: {
      async isFavorite(providerId, channelId) {
        calls.push(`favorite-read:${providerId}:${channelId}`);
        return false;
      },
      async toggle(providerId, channelId) {
        calls.push(`favorite-toggle:${providerId}:${channelId}`);
        return true;
      },
      async reconcile(providerId) {
        calls.push(`favorite-reconcile:${providerId}`);
        return { available: [], missing: [] };
      },
    },
    nowMs: () => 1_000,
  };

  const composition = createLiveTvFeatureComposition(ports);
  const state = await composition.refresh(refreshInput());

  assert.equal(state.layer, 'none');
  assert.equal(state.selectedFavorite, false);
  assert.equal(state.epg.selected?.channelId, 'a');
  assert.deepEqual(state.favorites.channels, []);
  assert.deepEqual(calls, [
    'epg-current:provider-1:a',
    'epg-next:provider-1:a',
    'favorite-reconcile:provider-1',
    'favorite-read:provider-1:a',
  ]);
});

void test('M4-COMP degrades EPG and Favorites failures without leaking raw errors', async () => {
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent() {
        throw new Error('credential-bearing epg failure');
      },
      async getNext() {
        throw new Error('next failure');
      },
    },
    favorites: {
      async isFavorite() {
        throw new Error('favorite read failure');
      },
      async toggle() {
        throw new Error('favorite toggle failure');
      },
      async reconcile() {
        throw new Error('favorite reconciliation failure');
      },
    },
    nowMs: () => 1_000,
  };

  const composition = createLiveTvFeatureComposition(ports);
  const state = await composition.refresh(refreshInput());

  assert.equal(state.epg.channelContext[0]?.current.status, 'unavailable');
  assert.equal(state.epg.selected?.current.status, 'unavailable');
  assert.equal(state.epg.selected?.next.status, 'unavailable');
  assert.equal(state.selectedFavorite, false);
  assert.equal(state.favorites.status, 'empty');
  assert.equal(JSON.stringify(state).includes('credential-bearing'), false);
  assert.equal(JSON.stringify(state).includes('failure'), false);
});

void test('M4-COMP Search preserves provider-scoped stable keys and activation is highlight-only data', async () => {
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent() { return null; },
      async getNext() { return null; },
    },
    favorites: {
      async isFavorite() { return false; },
      async toggle() { return false; },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 1_000,
  };
  const composition = createLiveTvFeatureComposition(ports);
  const channels = [
    channel('same', 'provider-1', 'Haber Bir'),
    channel('same', 'provider-2', 'Haber İki'),
    channel('other', 'provider-1', 'Spor'),
  ];
  const input = refreshInput(channels);
  await composition.refresh(input);

  let state = composition.openSearch(input, 'haber');
  assert.equal(state.layer, 'search');
  assert.deepEqual(state.search.items.map((item) => item.key), ['provider-1:same']);

  const down = composition.handleSearchKeyboard({ key: 'ArrowDown', keyCode: 40 });
  assert.equal(down.handled, true);
  assert.equal(down.activation, null);
  assert.equal(down.state.search.focusedResultKey, 'provider-1:same');

  const activate = composition.handleSearchKeyboard({ key: 'Enter', keyCode: 13 });
  assert.deepEqual(activate.activation, { providerId: 'provider-1', channelId: 'same' });
  assert.equal(activate.state.layer, 'none');
});

void test('M4-COMP Channel Actions map WATCH only to PLAY and keep Program Info as a dismissible nested layer', async () => {
  let favorite = false;
  const calls: string[] = [];
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent(_providerId, channelId) { return program(channelId); },
      async getNext(_providerId, channelId) { return program(channelId, 'Next'); },
    },
    favorites: {
      async isFavorite() { return favorite; },
      async toggle(providerId, channelId) {
        calls.push(`toggle:${providerId}:${channelId}`);
        favorite = !favorite;
        return favorite;
      },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 1_500,
  };
  const composition = createLiveTvFeatureComposition(ports);
  const input = refreshInput();
  await composition.refresh(input);

  let state = composition.openActions(input);
  assert.equal(state.layer, 'actions');
  assert.deepEqual(state.actions?.items.map((item) => [item.id, item.label]), [
    ['WATCH', 'İzle'],
    ['FAVORITE', 'Favoriye Ekle'],
    ['PROGRAM_INFO', 'Program Bilgisi'],
  ]);
  assert.deepEqual(composition.activateFocusedAction(), {
    type: 'PLAY_CHANNEL',
    providerId: 'provider-1',
    channelId: 'a',
  });

  state = composition.moveAction('NEXT');
  assert.equal(state.actions?.state.focusedActionId, 'FAVORITE');
  const favoriteIntent = composition.activateFocusedAction();
  assert.deepEqual(favoriteIntent, {
    type: 'TOGGLE_FAVORITE',
    providerId: 'provider-1',
    channelId: 'a',
  });
  state = await composition.toggleFavorite(input);
  assert.deepEqual(calls, ['toggle:provider-1:a']);
  assert.equal(state.selectedFavorite, true);
  assert.equal(state.actions?.items.find((item) => item.id === 'FAVORITE')?.label, 'Favorilerden Çıkar');

  state = composition.moveAction('NEXT');
  assert.equal(state.actions?.state.focusedActionId, 'PROGRAM_INFO');
  assert.deepEqual(composition.activateFocusedAction(), {
    type: 'SHOW_PROGRAM_INFO',
    providerId: 'provider-1',
    channelId: 'a',
  });
  state = composition.openProgramInfo();
  assert.equal(state.layer, 'program-info');
  assert.equal(state.programInfo?.title, 'Program a');
  assert.equal(composition.closeTopLayer(), true);
  assert.equal(composition.current().layer, 'actions');
  assert.equal(composition.closeTopLayer(), true);
  assert.equal(composition.current().layer, 'none');
});

void test('M4-COMP failed favorite toggle preserves the prior displayed state', async () => {
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent() { return null; },
      async getNext() { return null; },
    },
    favorites: {
      async isFavorite() { return true; },
      async toggle() { throw new Error('toggle failed'); },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 1_000,
  };
  const composition = createLiveTvFeatureComposition(ports);
  const input = refreshInput();
  await composition.refresh(input);
  composition.openActions(input);

  const state = await composition.toggleFavorite(input);
  assert.equal(state.selectedFavorite, true);
  assert.equal(state.actions?.items.find((item) => item.id === 'FAVORITE')?.label, 'Favorilerden Çıkar');
});
