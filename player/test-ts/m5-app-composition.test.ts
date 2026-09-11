import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppLiveTvFeaturePorts } from '../src/app/live-tv-feature-ports.js';
import {
  createAppComposition,
  type AppCompositionDependencies,
  type AppProviderManagementCallbacks,
} from '../src/app/app-composition.js';
import type { HomeViewModel } from '../src/home/home-domain.js';
import type { FirstRunCallbacks } from '../src/first-run/first-run-view.js';
import type { XtreamEntryCallbacks } from '../src/xtream-entry.js';
import type { M3uEntryCallbacks } from '../src/m3u-entry.js';
import type { ProviderReentryInput } from '../src/providers/provider-reentry-service.js';

const HOME_MODEL: HomeViewModel = {
  providerSelector: {
    activeProviderId: 'p1',
    options: [{
      providerId: 'p1',
      kind: 'xtream',
      name: 'One',
      isActive: true,
      intent: { type: 'SELECT_PROVIDER', providerId: 'p1' },
    }],
  },
  lastWatched: null,
  liveTv: {
    available: true,
    intent: { type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'all' },
  },
  favorites: { items: [], viewAllIntent: { type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'favorites' } },
  frequentlyWatched: { items: [] },
  settings: { intent: { type: 'OPEN_SETTINGS' } },
  defaultFocus: { kind: 'live-tv' },
};

function requireBound<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`${label} was not bound`);
  return value;
}

function makeDeps(events: string[], providerCount = 1): AppCompositionDependencies {
  let activeProviderId: string | null = providerCount === 0 ? null : 'p1';
  const passive = () => ({
    show() { events.push('view:show'); },
    hide() { events.push('view:hide'); },
    handleAction() {},
  });

  return {
    providers: {
      async listProviders() {
        return providerCount === 0 ? [] : [
          { id: 'p1', kind: 'xtream', name: 'One', createdAtMs: 1, lastSuccessfulSyncAtMs: null },
        ];
      },
      async getActiveProviderId() { return activeProviderId; },
    },
    core: {
      async switchActiveProvider(providerId) {
        events.push(`switch:${providerId}`);
        activeProviderId = providerId;
      },
    },
    homeData: { async load() { events.push('home:load'); return HOME_MODEL; } },
    views: {
      home: () => ({
        show() { events.push('home:show'); },
        setState() { events.push('home:set'); },
        hide() { events.push('home:hide'); },
        handleAction() {},
      }),
      firstRun: () => passive(),
      xtream: () => passive(),
      m3u: () => passive(),
      providerManagement: () => ({
        async show() { events.push('providers:show'); },
        hide() { events.push('providers:hide'); },
        async handleAction() {},
      }),
    },
    onboarding: {
      async connectXtream() { events.push('xtream:connect'); },
      async connectM3u() { events.push('m3u:connect'); },
    },
    reentry: {
      async reenter(input) { events.push(`reentry:${input.providerId}:${input.kind}`); },
    },
    liveTv: {
      async start() {
        events.push('live:start');
        return {
          mode: 'm3' as const,
          controller: {
            openScope(scope) { events.push(`scope:${scope.kind}`); },
            openChannel(channelId) { events.push(`focus:${channelId}`); },
            async playChannel(channelId) { events.push(`play:${channelId}`); },
            async handleInput(input) {
              events.push(input.type === 'DIGIT' ? `digit:${input.digit}` : `input:${input.action}`);
            },
          },
          async enterProvider(providerId: string) { events.push(`enter:${providerId}`); },
        };
      },
    },
    legacy: {
      hidePlayerShell() { events.push('legacy:hide-player'); },
      openPlayer() { events.push('legacy:open-player'); },
      showSettings() { events.push('legacy:settings-show'); },
      hideSettings() { events.push('legacy:settings-hide'); },
      handleRemote(action) { events.push(`legacy:${action}`); },
    },
    exitApp() { events.push('app:exit'); },
  };
}

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

test('M5 application boot selects first-run for zero providers and Home otherwise', async () => {
  const emptyEvents: string[] = [];
  const empty = createAppComposition(makeDeps(emptyEvents, 0));
  await empty.boot();
  assert.deepEqual(empty.route(), { kind: 'first-run' });
  assert.equal(emptyEvents.includes('live:start'), false);

  const configuredEvents: string[] = [];
  const configured = createAppComposition(makeDeps(configuredEvents));
  await configured.boot();
  assert.deepEqual(configured.route(), { kind: 'home' });
  assert.equal(configuredEvents.includes('live:start'), false);
  assert.equal(configuredEvents.includes('play:c1'), false);
});

test('M5 Home intents keep navigation separate from explicit playback', async () => {
  const events: string[] = [];
  const app = createAppComposition(makeDeps(events));
  await app.boot();
  events.length = 0;

  await app.handleHomeIntent({ type: 'SELECT_PROVIDER', providerId: 'p2' });
  assert.deepEqual(events.filter((event) => event.startsWith('switch:')), ['switch:p2']);
  assert.equal(events.some((event) => event.startsWith('play:')), false);
  assert.equal(events.some((event) => event.startsWith('enter:')), false);

  events.length = 0;
  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'all' });
  assert.ok(events.includes('scope:all'));
  assert.equal(events.some((event) => event.startsWith('play:')), false);

  events.length = 0;
  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'favorites' });
  assert.ok(events.includes('scope:favorites'));
  assert.equal(events.some((event) => event.startsWith('play:')), false);

  events.length = 0;
  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'p1', channelId: 'c2' });
  assert.ok(events.includes('focus:c2'));
  assert.equal(events.some((event) => event.startsWith('play:')), false);

  events.length = 0;
  await app.handleHomeIntent({ type: 'PLAY_CHANNEL', providerId: 'p1', channelId: 'c2' });
  assert.deepEqual(events.filter((event) => event === 'play:c2'), ['play:c2']);

  events.length = 0;
  await app.handleHomeIntent({ type: 'OPEN_SETTINGS' });
  assert.deepEqual(app.route(), { kind: 'provider-management' });
  assert.equal(events.some((event) => event.startsWith('play:')), false);
});

test('M5 same-provider Live TV re-entry reuses one runtime and one session owner', async () => {
  const events: string[] = [];
  const deps = makeDeps(events);
  let rootBack: () => void = () => assert.fail('Live TV root Back callback was not bound.');
  let starts = 0;

  deps.liveTv.start = async (onRootBack) => {
    starts += 1;
    rootBack = onRootBack;
    return {
      mode: 'm3' as const,
      controller: {
        openScope(scope) { events.push(`scope:${scope.kind}`); },
        openChannel(channelId) { events.push(`focus:${channelId}`); },
        async playChannel(channelId) { events.push(`play:${channelId}`); },
        async handleInput() {},
      },
      async enterProvider(providerId: string) { events.push(`enter:${providerId}`); },
    };
  };

  const app = createAppComposition(deps);
  await app.boot();
  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'all' });
  assert.equal(starts, 1);

  rootBack();
  assert.deepEqual(app.route(), { kind: 'home' });

  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'favorites' });
  assert.equal(starts, 1);
  assert.equal(events.filter((event) => event === 'scope:favorites').length, 1);
  assert.equal(events.some((event) => event.startsWith('enter:')), false);
});

test('M5 cross-provider navigation reuses one runtime and enters provider context without playback', async () => {
  const events: string[] = [];
  const deps = makeDeps(events);
  let rootBack: () => void = () => assert.fail('Live TV root Back callback was not bound.');
  let starts = 0;
  const controller = {
    openScope(scope: { kind: 'all' } | { kind: 'favorites' }) { events.push(`scope:${scope.kind}`); },
    openChannel(channelId: string) { events.push(`focus:${channelId}`); },
    async playChannel(channelId: string) { events.push(`play:${channelId}`); },
    async handleInput() {},
  };
  const runtime = {
    mode: 'm3' as const,
    controller,
    async enterProvider(providerId: string) { events.push(`enter:${providerId}`); },
  };

  deps.liveTv.start = async (onRootBack) => {
    starts += 1;
    rootBack = onRootBack;
    return runtime;
  };

  const app = createAppComposition(deps);
  await app.boot();
  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'all' });
  assert.equal(starts, 1);

  rootBack();
  assert.deepEqual(app.route(), { kind: 'home' });
  events.length = 0;

  await app.handleHomeIntent({ type: 'SELECT_PROVIDER', providerId: 'p2' });
  assert.equal(starts, 1);
  assert.equal(events.some((event) => event.startsWith('enter:')), false);
  assert.equal(events.some((event) => event.startsWith('play:')), false);

  events.length = 0;
  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p2', scope: 'all' });
  assert.equal(starts, 1);
  assert.deepEqual(events.filter((event) => event.startsWith('enter:')), ['enter:p2']);
  assert.ok(events.includes('scope:all'));
  assert.equal(events.some((event) => event.startsWith('play:')), false);

  events.length = 0;
  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'p2', channelId: 'b1' });
  assert.equal(starts, 1);
  assert.equal(events.some((event) => event.startsWith('enter:')), false);
  assert.ok(events.includes('focus:b1'));
  assert.equal(events.some((event) => event.startsWith('play:')), false);

  events.length = 0;
  await app.handleHomeIntent({ type: 'PLAY_CHANNEL', providerId: 'p2', channelId: 'b1' });
  assert.equal(starts, 1);
  assert.deepEqual(events.filter((event) => event === 'play:b1'), ['play:b1']);

  rootBack();
  events.length = 0;
  await app.handleHomeIntent({ type: 'SELECT_PROVIDER', providerId: 'p1' });
  assert.equal(events.some((event) => event.startsWith('play:')), false);
  events.length = 0;
  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'favorites' });
  assert.equal(starts, 1);
  assert.deepEqual(events.filter((event) => event.startsWith('enter:')), ['enter:p1']);
  assert.equal(events.some((event) => event.startsWith('play:')), false);
});

test('M5 provider-entry failure keeps Home active and does not start playback', async () => {
  const events: string[] = [];
  const deps = makeDeps(events);
  let rootBack: () => void = () => assert.fail('Live TV root Back callback was not bound.');
  let starts = 0;
  const runtime = {
    mode: 'm3' as const,
    controller: {
      openScope(scope: { kind: 'all' } | { kind: 'favorites' }) { events.push(`scope:${scope.kind}`); },
      openChannel(channelId: string) { events.push(`focus:${channelId}`); },
      async playChannel(channelId: string) { events.push(`play:${channelId}`); },
      async handleInput() {},
    },
    async enterProvider(providerId: string) {
      events.push(`enter:${providerId}`);
      throw new Error('LIVE_TV_PROVIDER_UNAVAILABLE');
    },
  };
  deps.liveTv.start = async (onRootBack) => {
    starts += 1;
    rootBack = onRootBack;
    return runtime;
  };

  const app = createAppComposition(deps);
  await app.boot();
  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'all' });
  rootBack();
  await app.handleHomeIntent({ type: 'SELECT_PROVIDER', providerId: 'p2' });
  events.length = 0;

  await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p2', scope: 'all' });
  assert.equal(starts, 1);
  assert.deepEqual(app.route(), { kind: 'home' });
  assert.deepEqual(events.filter((event) => event.startsWith('enter:')), ['enter:p2']);
  assert.equal(events.some((event) => event.startsWith('scope:')), false);
  assert.equal(events.some((event) => event.startsWith('play:')), false);
});

test('M5 add-provider Xtream flow stays explicit add mode and uses onboarding only', async () => {
  const events: string[] = [];
  const deps = makeDeps(events, 0);
  let firstRunCallbacks: FirstRunCallbacks | null = null;
  let xtreamCallbacks: XtreamEntryCallbacks | null = null;
  const reentries: ProviderReentryInput[] = [];

  deps.views.firstRun = (callbacks) => {
    firstRunCallbacks = callbacks;
    return {
      show() { events.push('first-run:show'); },
      hide() {},
      handleAction() {},
    };
  };
  deps.views.xtream = (callbacks) => {
    xtreamCallbacks = callbacks;
    return {
      show() { events.push('xtream:show'); },
      hide() {},
      handleAction() {},
    };
  };
  deps.reentry.reenter = async (input) => { reentries.push(input); };

  const app = createAppComposition(deps);
  await app.boot();
  requireBound(firstRunCallbacks, 'first-run callbacks').onXtreamSelected();
  assert.deepEqual(app.route(), {
    kind: 'xtream-entry',
    returnTo: 'first-run',
    mode: { kind: 'add' },
  });

  await requireBound(xtreamCallbacks, 'Xtream callbacks').onSubmit({
    serverUrl: 'https://add.example',
    username: 'add-user',
    password: 'add-pass',
  });
  assert.deepEqual(reentries, []);
  assert.equal(events.filter((event) => event === 'xtream:connect').length, 1);
  assert.deepEqual(app.route(), { kind: 'home' });
});

test('M5 Xtream edit uses same providerId, no prefill payload, no switch/playback, then refreshes provider management', async () => {
  const events: string[] = [];
  const deps = makeDeps(events);
  let providerCallbacks: AppProviderManagementCallbacks | null = null;
  let xtreamCallbacks: XtreamEntryCallbacks | null = null;
  let xtreamShowArgCount = -1;
  const reentries: ProviderReentryInput[] = [];

  deps.views.providerManagement = (callbacks) => {
    providerCallbacks = callbacks;
    return {
      async show() { events.push('providers:show'); },
      hide() {},
      async handleAction() {},
    };
  };
  deps.views.xtream = (callbacks) => {
    xtreamCallbacks = callbacks;
    return {
      show(...args: unknown[]) { xtreamShowArgCount = args.length; events.push('xtream:show'); },
      hide() {},
      handleAction() {},
    };
  };
  deps.reentry.reenter = async (input) => { reentries.push(input); };

  const app = createAppComposition(deps);
  await app.boot();
  await app.handleHomeIntent({ type: 'OPEN_SETTINGS' });
  events.length = 0;

  requireBound(providerCallbacks, 'provider callbacks').onEditProvider('p1', 'xtream');
  assert.deepEqual(app.route(), {
    kind: 'xtream-entry',
    returnTo: 'provider-management',
    mode: { kind: 'edit', providerId: 'p1' },
  });
  assert.equal(xtreamShowArgCount, 0);
  assert.equal(JSON.stringify(app.route()).includes('serverUrl'), false);
  assert.equal(JSON.stringify(app.route()).includes('username'), false);
  assert.equal(JSON.stringify(app.route()).includes('password'), false);
  assert.equal(events.some((event) => event.startsWith('switch:')), false);
  assert.equal(events.some((event) => event.startsWith('play:')), false);

  await requireBound(xtreamCallbacks, 'Xtream callbacks').onSubmit({
    serverUrl: 'https://candidate.example',
    username: 'candidate-user',
    password: 'candidate-pass',
  });
  assert.deepEqual(reentries, [{
    providerId: 'p1',
    kind: 'xtream',
    serverUrl: 'https://candidate.example',
    username: 'candidate-user',
    password: 'candidate-pass',
  }]);
  assert.equal(events.includes('xtream:connect'), false);
  assert.equal(events.filter((event) => event === 'providers:show').length, 1);
  assert.deepEqual(app.route(), { kind: 'provider-management' });
  assert.equal(events.some((event) => event.startsWith('play:')), false);
});

test('M5 M3U edit uses same providerId and returns to refreshed provider management', async () => {
  const events: string[] = [];
  const deps = makeDeps(events);
  let providerCallbacks: AppProviderManagementCallbacks | null = null;
  let m3uCallbacks: M3uEntryCallbacks | null = null;
  let m3uShowArgCount = -1;
  const reentries: ProviderReentryInput[] = [];

  deps.views.providerManagement = (callbacks) => {
    providerCallbacks = callbacks;
    return {
      async show() { events.push('providers:show'); },
      hide() {},
      async handleAction() {},
    };
  };
  deps.views.m3u = (callbacks) => {
    m3uCallbacks = callbacks;
    return {
      show(...args: unknown[]) { m3uShowArgCount = args.length; events.push('m3u:show'); },
      hide() {},
      handleAction() {},
    };
  };
  deps.reentry.reenter = async (input) => { reentries.push(input); };

  const app = createAppComposition(deps);
  await app.boot();
  await app.handleHomeIntent({ type: 'OPEN_SETTINGS' });
  events.length = 0;

  requireBound(providerCallbacks, 'provider callbacks').onEditProvider('p1', 'm3u');
  assert.deepEqual(app.route(), {
    kind: 'm3u-entry',
    returnTo: 'provider-management',
    mode: { kind: 'edit', providerId: 'p1' },
  });
  assert.equal(m3uShowArgCount, 0);
  assert.equal(JSON.stringify(app.route()).includes('playlistUrl'), false);

  await requireBound(m3uCallbacks, 'M3U callbacks').onSubmit({
    playlistUrl: 'https://candidate.example/list.m3u',
  });
  assert.deepEqual(reentries, [{
    providerId: 'p1',
    kind: 'm3u',
    playlistUrl: 'https://candidate.example/list.m3u',
  }]);
  assert.equal(events.includes('m3u:connect'), false);
  assert.equal(events.filter((event) => event === 'providers:show').length, 1);
  assert.deepEqual(app.route(), { kind: 'provider-management' });
});

test('M5 edit failure stays on entry and Back returns without another write', async () => {
  const events: string[] = [];
  const deps = makeDeps(events);
  let providerCallbacks: AppProviderManagementCallbacks | null = null;
  let xtreamCallbacks: XtreamEntryCallbacks | null = null;
  let attempts = 0;

  deps.views.providerManagement = (callbacks) => {
    providerCallbacks = callbacks;
    return {
      async show() { events.push('providers:show'); },
      hide() {},
      async handleAction() {},
    };
  };
  deps.views.xtream = (callbacks) => {
    xtreamCallbacks = callbacks;
    return {
      show() {},
      hide() {},
      handleAction() {},
    };
  };
  deps.reentry.reenter = async () => {
    attempts += 1;
    throw new Error('candidate failure must remain owned by entry view');
  };

  const app = createAppComposition(deps);
  await app.boot();
  await app.handleHomeIntent({ type: 'OPEN_SETTINGS' });
  events.length = 0;
  requireBound(providerCallbacks, 'provider callbacks').onEditProvider('p1', 'xtream');

  await assert.rejects(() => requireBound(xtreamCallbacks, 'Xtream callbacks').onSubmit({
    serverUrl: 'https://candidate.example',
    username: 'candidate-user',
    password: 'candidate-pass',
  }));
  assert.equal(attempts, 1);
  assert.deepEqual(app.route(), {
    kind: 'xtream-entry',
    returnTo: 'provider-management',
    mode: { kind: 'edit', providerId: 'p1' },
  });
  assert.equal(events.includes('providers:show'), false);
  assert.equal(events.some((event) => event.startsWith('switch:')), false);
  assert.equal(events.some((event) => event.startsWith('play:')), false);

  await app.handleRemote('back');
  assert.equal(attempts, 1);
  assert.deepEqual(app.route(), { kind: 'provider-management' });
  assert.equal(events.filter((event) => event === 'providers:show').length, 1);
});

test('M5 application Back preserves one-layer ownership at app routes', async () => {
  const events: string[] = [];
  const app = createAppComposition(makeDeps(events));
  await app.boot();

  await app.handleHomeIntent({ type: 'OPEN_SETTINGS' });
  await app.handleRemote('back');
  assert.deepEqual(app.route(), { kind: 'home' });

  await app.handleRemote('back');
  assert.ok(events.includes('app:exit'));
});