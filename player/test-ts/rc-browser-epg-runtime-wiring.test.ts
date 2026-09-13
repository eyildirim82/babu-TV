import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLiveTvProviderEntry,
  createLiveTvRuntime,
} from '../src/live-tv/create-live-tv-runtime.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = 1_800_000_000_000;

function snapshot(providerId: string) {
  return {
    provider: {
      id: providerId,
      kind: 'xtream',
      name: providerId,
      createdAtMs: NOW_MS - DAY_MS,
      lastSuccessfulSyncAtMs: NOW_MS - 1_000,
    },
    categories: [],
    channels: [],
  };
}

function credentials() {
  return {
    isAvailable: () => true,
    load: async () => ({
      kind: 'xtream',
      serverUrl: 'https://provider.invalid',
      username: 'user',
      password: 'password',
    }),
  };
}

test('RC-BROWSER EPG: initial Live TV entry refreshes EPG and reprojects features', async () => {
  const providerId = 'provider-a';
  const cached = snapshot(providerId);
  const epgCalls: Array<{ providerId: string; window: { startMs: number; endMs: number } }> = [];
  const synced: unknown[] = [];

  const result = await createLiveTvRuntime({
    providers: { getActiveProviderId: async () => providerId },
    credentials: credentials(),
    core: {
      loadCacheFirst: async () => ({ cached, refresh: Promise.resolve() }),
      loadCached: async () => cached,
    },
    controller: {
      enter() {},
      syncCatalog(value: unknown) { synced.push(value); },
    },
    epg: {
      refreshInBackground: async (id: string, window: { startMs: number; endMs: number }) => {
        epgCalls.push({ providerId: id, window });
        return { providerId: id, status: 'success', programCount: 1 } as const;
      },
    },
    nowMs: () => NOW_MS,
  } as never);

  assert.equal(result.mode, 'm3');
  if (result.mode !== 'm3') return;
  await result.refresh;

  assert.deepEqual(epgCalls, [{
    providerId,
    window: {
      startMs: NOW_MS - DAY_MS,
      endMs: NOW_MS + DAY_MS,
    },
  }]);
  assert.equal(synced.length, 2, 'catalog is projected once, then projected again after EPG persistence');
});

test('RC-BROWSER EPG: provider re-entry refreshes EPG for the newly entered provider', async () => {
  const providerId = 'provider-b';
  const cached = snapshot(providerId);
  const epgCalls: string[] = [];
  let resolveSecondSync: (() => void) | null = null;
  const secondSync = new Promise<void>((resolve) => { resolveSecondSync = resolve; });
  let syncCount = 0;

  const enterProvider = createLiveTvProviderEntry({
    providers: { getProvider: async () => cached.provider },
    credentials: credentials(),
    core: {
      loadCacheFirst: async () => ({ cached, refresh: Promise.resolve() }),
      loadCached: async () => cached,
    },
    controller: {
      enter() {},
      syncCatalog() {
        syncCount += 1;
        if (syncCount === 2) resolveSecondSync?.();
      },
    },
    epg: {
      refreshInBackground: async (id: string) => {
        epgCalls.push(id);
        return { providerId: id, status: 'success', programCount: 1 } as const;
      },
    },
    nowMs: () => NOW_MS,
  } as never);

  await enterProvider(providerId);
  await Promise.race([
    secondSync,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('EPG reprojection did not complete')), 250)),
  ]);

  assert.deepEqual(epgCalls, [providerId]);
  assert.equal(syncCount, 2);
});
