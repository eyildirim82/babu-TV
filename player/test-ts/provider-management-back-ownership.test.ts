import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAppComposition,
  type AppCompositionDependencies,
} from '../src/app/app-composition.js';

function dependencies(
  events: string[],
  shouldConsumeProviderBack: () => boolean,
): AppCompositionDependencies {
  return {
    providers: {
      async listProviders() { return []; },
      async getActiveProviderId() { return null; },
    },
    core: {
      async switchActiveProvider() {},
    },
    homeData: {
      async load() { return {} as never; },
    },
    views: {
      home(_callbacks) {
        return {
          show() {},
          setState() {},
          hide() {},
          handleAction() {},
        };
      },
      firstRun(_callbacks) {
        return {
          show() {},
          hide() {},
          handleAction() {},
        };
      },
      xtream(_callbacks) {
        return {
          show() {},
          hide() {},
          handleAction() {},
        };
      },
      m3u(_callbacks) {
        return {
          show() {},
          hide() {},
          handleAction() {},
        };
      },
      providerManagement(callbacks) {
        return {
          async show() {},
          hide() {},
          async handleAction(action) {
            events.push(`provider:${action}`);
            if (action === 'back' && !shouldConsumeProviderBack()) {
              callbacks.onBack();
            }
          },
        };
      },
    },
    onboarding: {
      async connectXtream() {},
      async connectM3u() {},
    },
    reentry: {
      async reenter() {},
    },
    liveTv: {
      async start() { return { mode: 'legacy' }; },
    },
    legacy: {
      hidePlayerShell() {},
      showPlayerShell() {},
      openPlayer() {},
      showSettings() {},
      hideSettings() {},
      handleRemote() {},
    },
    exitApp() {},
  };
}

test('provider-management Back is offered to the surface before route fallback', async () => {
  const events: string[] = [];
  let consumeProviderBack = true;
  const app = createAppComposition(dependencies(events, () => consumeProviderBack));

  await app.handleHomeIntent({ type: 'OPEN_SETTINGS' });
  assert.equal(app.route().kind, 'provider-management');

  await app.handleRemote('back');
  assert.deepEqual(events, ['provider:back']);
  assert.equal(app.route().kind, 'provider-management');

  consumeProviderBack = false;
  await app.handleRemote('back');
  assert.deepEqual(events, ['provider:back', 'provider:back']);
  assert.equal(app.route().kind, 'home');
});
