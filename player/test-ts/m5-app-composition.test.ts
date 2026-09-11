import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppLiveTvFeaturePorts } from '../src/app/live-tv-feature-ports.js';
import {
  createAppComposition,
  type AppCompositionDependencies,
} from '../src/app/app-composition.js';
import type { HomeViewModel } from '../src/home/home-domain.js';

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

function makeDeps(events: string[], providerCount = 1): AppCompositionDependencies {
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
      async getActiveProviderId() { return providerCount === 0 ? null : 'p1'; },
    },
    core: {
      async switchActiveProvider(providerId) { events.push(`switch:${providerId}`); },
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
