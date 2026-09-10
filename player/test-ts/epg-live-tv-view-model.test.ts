import test from 'node:test';
import assert from 'node:assert/strict';

void test('EPG-UI exposes an isolated Live TV EPG view-model builder', async () => {
  let module: Record<string, unknown> | null = null;
  try {
    module = await import('../src/live-tv/epg-live-tv-view-model.js') as Record<string, unknown>;
  } catch {
    module = null;
  }

  assert.equal(typeof module?.buildEpgLiveTvViewModel, 'function');
});
