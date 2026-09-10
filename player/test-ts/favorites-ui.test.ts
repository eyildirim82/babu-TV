import test from 'node:test';
import assert from 'node:assert/strict';

async function loadPresentation() {
  try {
    return await import('../src/favorites/presentation.js');
  } catch {
    assert.fail('favorites presentation module should be available');
  }
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
