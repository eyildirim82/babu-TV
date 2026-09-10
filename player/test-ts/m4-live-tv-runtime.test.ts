import test from 'node:test';
import assert from 'node:assert/strict';
import type { Platform } from '../src/platform/contracts.js';
import type { LegacyPlayerPort } from '../src/playback/shaka-adapter.js';
import type { LegacyAvplayPort } from '../src/playback/avplay-adapter.js';
import type {
  BrowserLiveTvRuntimeDependencies,
} from '../src/live-tv/create-live-tv-runtime.js';
import type { LiveTvFeaturePorts } from '../src/live-tv/live-tv-feature-composition.js';

function featurePorts(): LiveTvFeaturePorts {
  return {
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
}

void test('M4-COMP browser runtime accepts injected feature ports without repository wiring', () => {
  const ports = featurePorts();
  const deps = {
    indexedDb: null,
    widgetData: null,
    fetchImpl: globalThis.fetch,
    platform: {} as Platform,
    document: {} as Document,
    legacyPlayer: {} as LegacyPlayerPort,
    legacyAvplay: {} as LegacyAvplayPort,
    featurePorts: ports,
  } satisfies BrowserLiveTvRuntimeDependencies;

  assert.equal(deps.featurePorts, ports);
});
