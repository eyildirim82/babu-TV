import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual(model.channels, [p1c1, p1c2]);
  assert.deepEqual(model.focusItemIds, ['c1', 'c2']);
});
