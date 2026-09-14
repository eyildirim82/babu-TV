import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ProviderRecord } from '../src/domain/models.js';
import { orderProvidersForDisplay } from '../src/domain/provider-display.js';

function provider(id: string, name: string, createdAtMs: number, kind: ProviderRecord['kind'] = 'm3u'): ProviderRecord {
  return { id, kind, name, createdAtMs, lastSuccessfulSyncAtMs: null };
}

test('providers are ordered by creation time, then stable id', () => {
  const ordered = orderProvidersForDisplay([
    provider('p-b', 'B', 20),
    provider('p-c', 'C', 10),
    provider('p-a', 'A', 10),
  ]);

  assert.deepEqual(ordered.map((item) => item.id), ['p-a', 'p-c', 'p-b']);
});

test('same-named providers get a creation-order sequence number; unique names stay unchanged', () => {
  const ordered = orderProvidersForDisplay([
    provider('m3u-late', 'M3U', 30),
    provider('xtream-1', 'lists.invalid:8080', 15, 'xtream'),
    provider('m3u-first', 'M3U', 10),
    provider('m3u-middle', 'M3U', 20),
  ]);

  assert.deepEqual(ordered.map((item) => [item.id, item.name]), [
    ['m3u-first', 'M3U'],
    ['xtream-1', 'lists.invalid:8080'],
    ['m3u-middle', 'M3U 2'],
    ['m3u-late', 'M3U 3'],
  ]);
});

test('display ordering never mutates the stored provider records', () => {
  const stored = [provider('m3u-2', 'M3U', 20), provider('m3u-1', 'M3U', 10)];
  const snapshot = JSON.stringify(stored);

  orderProvidersForDisplay(stored);

  assert.equal(JSON.stringify(stored), snapshot);
});

test('Provider Management loads providers through the shared display ordering', () => {
  const source = readFileSync(new URL('../src/app/browser-app-dependencies.ts', import.meta.url), 'utf8');
  assert.match(source, /providers:\s*orderProvidersForDisplay\(await runtime\.providers\.listProviders\(\)\)/);
});
