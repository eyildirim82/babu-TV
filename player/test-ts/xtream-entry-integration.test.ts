import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SamsungWidgetDataCredentialStore } from '../src/credentials/samsung-widgetdata-credential-store.js';
import { ProviderAdapterFactoryImpl } from '../src/providers/provider-adapter-factory.js';
import { ProviderCoreService } from '../src/providers/provider-core-service.js';
import { ProviderSyncService } from '../src/providers/provider-sync-service.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import {
  createBrowserProviderRuntime,
} from '../src/providers/create-browser-provider-runtime.js';
import {
  createXtreamEntryCallbacks,
  routeXtreamEntryAction,
} from '../src/xtream-entry-integration.js';

const settingsUrl = new URL('../src/settings.js', import.meta.url);
const mainUrl = new URL('../src/main.js', import.meta.url);
const liveTvRuntimeUrl = new URL('../src/live-tv/create-live-tv-runtime.ts', import.meta.url);

test('shared browser provider runtime wires the Provider Core persistence boundaries used by onboarding and M3', () => {
  const runtime = createBrowserProviderRuntime({
    indexedDb: null,
    widgetData: null,
    fetchImpl: (async () => { throw new Error('not called'); }) as typeof fetch,
  });

  assert.ok(runtime.providers instanceof StructuredProviderRepository);
  assert.ok(runtime.catalog instanceof StructuredCatalogRepository);
  assert.ok(runtime.credentials instanceof SamsungWidgetDataCredentialStore);
  assert.ok(runtime.adapters instanceof ProviderAdapterFactoryImpl);
  assert.ok(runtime.sync instanceof ProviderSyncService);
  assert.ok(runtime.core instanceof ProviderCoreService);
});

test('successful Xtream submit awaits onboarding before reload', async () => {
  const events: string[] = [];
  const callbacks = createXtreamEntryCallbacks({
    onboarding: {
      async connect() {
        events.push('connect');
        return {} as never;
      },
    },
    reload: () => events.push('reload'),
    onBack: () => events.push('back'),
  });

  await callbacks.onSubmit({
    serverUrl: 'https://demo.invalid',
    username: 'demo-user',
    password: 'demo-pass',
  });

  assert.deepEqual(events, ['connect', 'reload']);
});

test('failed Xtream submit rejects without reload', async () => {
  let reloads = 0;
  const expected = new Error('safe failure');
  const callbacks = createXtreamEntryCallbacks({
    onboarding: {
      async connect() { throw expected; },
    },
    reload: () => { reloads += 1; },
    onBack: () => {},
  });

  await assert.rejects(
    callbacks.onSubmit({
      serverUrl: 'https://demo.invalid',
      username: 'demo-user',
      password: 'demo-pass',
    }),
    (error: unknown) => error === expected,
  );
  assert.equal(reloads, 0);
});

test('remote actions route to a visible Xtream entry before Settings handling', () => {
  const routed: string[] = [];
  const visibleView = {
    isVisible: () => true,
    handleAction: (action: 'up' | 'down' | 'select' | 'back') => routed.push(action),
  };

  assert.equal(routeXtreamEntryAction(visibleView, 'up'), true);
  assert.equal(routeXtreamEntryAction(visibleView, 'down'), true);
  assert.equal(routeXtreamEntryAction(visibleView, 'select'), true);
  assert.equal(routeXtreamEntryAction(visibleView, 'back'), true);
  assert.deepEqual(routed, ['up', 'down', 'select', 'back']);

  assert.equal(routeXtreamEntryAction({ ...visibleView, isVisible: () => false }, 'select'), false);
});

test('unsupported remote actions are consumed while Xtream entry is visible without mutating it', () => {
  let calls = 0;
  const view = {
    isVisible: () => true,
    handleAction: () => { calls += 1; },
  };

  assert.equal(routeXtreamEntryAction(view, 'left'), true);
  assert.equal(routeXtreamEntryAction(view, 'channelUp'), true);
  assert.equal(calls, 0);
});

test('Settings exposes only an Xtream request action and never handles credential fields', async () => {
  const source = await readFile(settingsUrl, 'utf8');

  assert.match(source, /onXtreamRequested/);
  assert.match(source, /id="settings-xtream-btn"/);
  assert.match(source, /UI_COPY\.xtreamEntry\.title/);
  assert.match(source, /onXtreamRequested\(\)/);

  assert.doesNotMatch(source, /xtream-server-url|xtream-username|xtream-password/);
  assert.doesNotMatch(source, /serverUrl\s*:|username\s*:|password\s*:/);
});

test('M3 startup and onboarding share browser Provider Core construction', async () => {
  const source = await readFile(liveTvRuntimeUrl, 'utf8');

  assert.match(source, /createBrowserProviderRuntime/);
  assert.doesNotMatch(source, /new IndexedDbStructuredStore/);
  assert.doesNotMatch(source, /new SamsungWidgetDataCredentialStore/);
  assert.doesNotMatch(source, /new ProviderCoreService/);
});

test('main wires Xtream Settings entry, prioritizes its remote route, and reloads through callbacks', async () => {
  const source = await readFile(mainUrl, 'utf8');

  assert.match(source, /import \{ XtreamEntryView \} from '\.\/xtream-entry\.ts';/);
  assert.match(source, /import '\.\/ui\/xtream-entry\.css';/);
  assert.match(source, /XtreamOnboardingService/);
  assert.match(source, /createBrowserProviderRuntime/);
  assert.match(source, /createXtreamEntryCallbacks/);
  assert.match(source, /routeXtreamEntryAction/);
  assert.match(source, /onXtreamRequested/);
  assert.match(source, /window\.location\.reload\(\)/);

  const routeIndex = source.indexOf('routeXtreamEntryAction');
  const settingsIndex = source.indexOf('if (settings.isVisible())');
  assert.ok(routeIndex >= 0 && settingsIndex >= 0 && routeIndex < settingsIndex);
});
