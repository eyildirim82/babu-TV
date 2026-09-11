import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppLiveTvFeaturePorts } from '../src/app/live-tv-feature-ports.js';

test('M5 Live TV feature ports delegate to frozen EPG and Favorites seams', async () => {
  const events: string[] = [];
  const ports = createAppLiveTvFeaturePorts({
    epg: {
      async getCurrent() { events.push('current'); return null; },
      async getNext() { events.push('next'); return null; },
    },
    favorites: {
      async isFavorite() { events.push('favorite'); return false; },
      async toggle() { return true; },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 123,
  });

  assert.equal(ports.nowMs(), 123);
  await ports.epg.getCurrent('p1', 'c1', 123);
  await ports.favorites.isFavorite('p1', 'c1');
  assert.deepEqual(events, ['current', 'favorite']);
});
