import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProviderManagementPresenter,
  type ProviderManagementOperations,
  type ProviderManagementSnapshot,
} from '../src/provider-management/provider-management-presenter.js';

test('provider-management re-entry ignores stale add-provider focus and restores active-provider focus', async () => {
  let snapshot: ProviderManagementSnapshot = {
    providers: [],
    activeProviderId: null,
  };

  const operations: ProviderManagementOperations = {
    async load() {
      return snapshot;
    },
    async switchProvider() {},
    requestEditProvider() {},
    async deleteProvider() {},
    requestAddProvider() {},
  };

  const presenter = new ProviderManagementPresenter(operations);

  await presenter.load();
  assert.equal(presenter.state.focusedId, 'add-provider');

  snapshot = {
    providers: [
      { id: 'provider-a', kind: 'xtream', name: 'Provider A' },
      { id: 'provider-b', kind: 'm3u', name: 'Provider B' },
    ],
    activeProviderId: 'provider-b',
  };

  await presenter.load();

  assert.equal(presenter.state.focusedId, 'provider:provider-b:switch');
});
