import test from 'node:test';
import assert from 'node:assert/strict';
import type { FocusState } from '../src/domain/actions.js';
import type { Channel } from '../src/domain/models.js';

async function loadPresentation() {
  try {
    return await import('../src/favorites/presentation.js');
  } catch {
    assert.fail('favorites presentation module should be available');
  }
}

async function loadViewModel() {
  try {
    return await import('../src/favorites/view-model.js');
  } catch {
    assert.fail('favorites view-model module should be available');
  }
}

async function loadFocus() {
  try {
    return await import('../src/favorites/focus.js');
  } catch {
    assert.fail('favorites focus module should be available');
  }
}

function channel(providerId: string, id: string, name: string): Channel {
  return {
    providerId,
    id,
    name,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

test('FAV-UI presents add/remove favorite state without a playback intent', async () => {
  const presentation = await loadPresentation();

  assert.deepEqual(presentation.favoriteActionPresentation(false), {
    kind: 'favorite-toggle',
    label: 'Favoriye Ekle',
    selected: false,
  });
  assert.deepEqual(presentation.favoriteActionPresentation(true), {
    kind: 'favorite-toggle',
    label: 'Favorilerden Çıkar',
    selected: true,
  });
});

test('FAV-UI projects the virtual Favorites category by provider-scoped stable favorite order', async () => {
  const viewModel = await loadViewModel();
  const p1c2 = channel('p1', 'c2', 'İki');
  const p1c1 = channel('p1', 'c1', 'Bir');
  const p2c1 = channel('p2', 'c1', 'Başka Sağlayıcı');

  const model = viewModel.buildFavoritesViewModel({
    providerId: 'p1',
    channels: [p1c2, p2c1, p1c1],
    reconciliation: {
      available: [
        { providerId: 'p1', channelId: 'c1', addedAtMs: 10 },
        { providerId: 'p2', channelId: 'c1', addedAtMs: 15 },
        { providerId: 'p1', channelId: 'removed', addedAtMs: 20 },
        { providerId: 'p1', channelId: 'c2', addedAtMs: 30 },
      ],
      missing: [
        { providerId: 'p1', channelId: 'domain-missing', addedAtMs: 40 },
      ],
    },
  });

  assert.equal(model.categoryKey, 'virtual:favorites');
  assert.equal(model.categoryLabel, 'Favoriler');
  assert.equal(model.status, 'ready');
  assert.equal(model.emptyState, null);
  assert.deepEqual(model.channels, [p1c1, p1c2]);
  assert.deepEqual(model.focusItemIds, ['c1', 'c2']);
});

test('FAV-UI exposes an empty presentation without inventing missing-channel entries', async () => {
  const viewModel = await loadViewModel();

  const model = viewModel.buildFavoritesViewModel({
    providerId: 'p1',
    channels: [channel('p1', 'other', 'Diğer')],
    reconciliation: {
      available: [],
      missing: [
        { providerId: 'p1', channelId: 'removed', addedAtMs: 10 },
      ],
    },
  });

  assert.equal(model.status, 'empty');
  assert.deepEqual(model.channels, []);
  assert.deepEqual(model.focusItemIds, []);
  assert.deepEqual(model.emptyState, {
    title: 'Favoriler boş',
    message: 'Favoriye eklediğiniz kanallar burada görünür.',
  });
});

test('FAV-UI focus sync preserves stable focus and reuses existing playing/restore precedence', async () => {
  const focus = await loadFocus();
  const viewModel = await loadViewModel();
  const c1 = channel('p1', 'c1', 'Bir');
  const c2 = channel('p1', 'c2', 'İki');
  const ready = viewModel.buildFavoritesViewModel({
    providerId: 'p1',
    channels: [c2, c1],
    reconciliation: {
      available: [
        { providerId: 'p1', channelId: 'c1', addedAtMs: 10 },
        { providerId: 'p1', channelId: 'c2', addedAtMs: 20 },
      ],
      missing: [],
    },
  });
  const initial: FocusState = {
    screen: 'LIVE_TV',
    zone: 'CHANNEL',
    itemId: 'c2',
    restoreItemId: 'c1',
  };

  assert.equal(focus.syncFavoritesFocus(initial, ready, 'c1').itemId, 'c2');

  const onlyC1 = viewModel.buildFavoritesViewModel({
    providerId: 'p1',
    channels: [c1],
    reconciliation: {
      available: [{ providerId: 'p1', channelId: 'c1', addedAtMs: 10 }],
      missing: [],
    },
  });
  assert.equal(focus.syncFavoritesFocus(initial, onlyC1, 'c1').itemId, 'c1');
});

test('FAV-UI focus movement is remote-first, clamped, and empty-safe without playback actions', async () => {
  const focus = await loadFocus();
  const viewModel = await loadViewModel();
  const c1 = channel('p1', 'c1', 'Bir');
  const c2 = channel('p1', 'c2', 'İki');
  const ready = viewModel.buildFavoritesViewModel({
    providerId: 'p1',
    channels: [c1, c2],
    reconciliation: {
      available: [
        { providerId: 'p1', channelId: 'c1', addedAtMs: 10 },
        { providerId: 'p1', channelId: 'c2', addedAtMs: 20 },
      ],
      missing: [],
    },
  });
  const initial: FocusState = {
    screen: 'LIVE_TV',
    zone: 'CHANNEL',
    itemId: 'c1',
    restoreItemId: 'c1',
  };

  const next = focus.moveFavoritesFocus(initial, ready, 'NEXT');
  assert.equal(next.itemId, 'c2');
  assert.equal(focus.moveFavoritesFocus(next, ready, 'NEXT').itemId, 'c2');

  const empty = viewModel.buildFavoritesViewModel({
    providerId: 'p1',
    channels: [],
    reconciliation: { available: [], missing: [] },
  });
  assert.equal(focus.syncFavoritesFocus(next, empty, null).itemId, null);
});
