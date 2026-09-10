import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Channel } from '../src/domain/models.js';
import {
  createLiveTvFeatureComposition,
  type LiveTvFeaturePorts,
} from '../src/live-tv/live-tv-feature-composition.js';

function channel(id: string, providerId = 'provider-1'): Channel {
  return {
    providerId,
    id,
    name: `Channel ${id}`,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

const categories: readonly Category[] = [];

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
  const state = await composition.refresh({
    providerId: 'provider-1',
    channels: [channel('a')],
    visibleChannels: [channel('a')],
    categories,
    highlightedChannelId: 'a',
  });

  assert.equal(state.layer, 'none');
  assert.equal(state.selectedFavorite, false);
  assert.equal(state.epg.selected?.channelId, 'a');
  assert.deepEqual(state.favorites.channels, []);
  assert.deepEqual(calls, [
    'epg-current:provider-1:a',
    'epg-next:provider-1:a',
    'favorite-read:provider-1:a',
    'favorite-reconcile:provider-1',
  ]);
});
