import assert from 'node:assert/strict';
import test from 'node:test';

async function loadPresenterModule(): Promise<any> {
  try {
    return await import('../src/provider-management/provider-management-presenter.js');
  } catch {
    assert.fail('provider management presenter module must exist');
  }
}

function provider(id: string, name: string, kind: 'xtream' | 'm3u' = 'xtream') {
  return { id, name, kind };
}

function createOperations(options: {
  providers?: readonly ReturnType<typeof provider>[];
  activeProviderId?: string | null;
  loadError?: Error;
  switchError?: Error;
  deleteError?: Error;
} = {}) {
  const events: string[] = [];
  let providers = [...(options.providers ?? [provider('provider-a', 'Salon'), provider('provider-b', 'Mutfak', 'm3u')])];
  let activeProviderId: string | null = options.activeProviderId === undefined ? 'provider-a' : options.activeProviderId;

  return {
    events,
    setSnapshot(nextProviders: readonly ReturnType<typeof provider>[], nextActiveProviderId: string | null) {
      providers = [...nextProviders];
      activeProviderId = nextActiveProviderId;
    },
    operations: {
      async load() {
        events.push('load');
        if (options.loadError) throw options.loadError;
        return { providers, activeProviderId };
      },
      async switchProvider(providerId: string) {
        events.push(`switch:${providerId}`);
        if (options.switchError) throw options.switchError;
        activeProviderId = providerId;
      },
      requestEditProvider(providerId: string, kind: 'xtream' | 'm3u') {
        events.push(`edit:${providerId}:${kind}`);
      },
      async deleteProvider(providerId: string) {
        events.push(`delete:${providerId}`);
        if (options.deleteError) throw options.deleteError;
        providers = providers.filter((item) => item.id !== providerId);
        if (activeProviderId === providerId) activeProviderId = providers[0]?.id ?? null;
      },
      requestAddProvider() {
        events.push('add');
      },
    },
  };
}

test('projects configured providers and active state with stable switch edit delete focus order and no secret-bearing fields', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations();
  const presenter = new ProviderManagementPresenter(fixture.operations);

  await presenter.load();
  const state = presenter.state;

  assert.equal(state.status, 'ready');
  assert.deepEqual(state.providers.map((item: any) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    isActive: item.isActive,
    editFocusId: item.editFocusId,
  })), [
    { id: 'provider-a', name: 'Salon', kind: 'xtream', isActive: true, editFocusId: 'provider:provider-a:edit' },
    { id: 'provider-b', name: 'Mutfak', kind: 'm3u', isActive: false, editFocusId: 'provider:provider-b:edit' },
  ]);
  assert.deepEqual(state.focusOrder, [
    'provider:provider-a:switch',
    'provider:provider-a:edit',
    'provider:provider-a:delete',
    'provider:provider-b:switch',
    'provider:provider-b:edit',
    'provider:provider-b:delete',
    'add-provider',
  ]);
  assert.equal(JSON.stringify(state).includes('url'), false);
  assert.equal(state.focusedId, 'provider:provider-a:switch');
});

test('moving focus across switch edit and delete never invokes an operation', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations();
  const presenter = new ProviderManagementPresenter(fixture.operations);
  await presenter.load();

  presenter.moveFocus('next');
  assert.equal(presenter.state.focusedId, 'provider:provider-a:edit');
  presenter.moveFocus('next');
  assert.equal(presenter.state.focusedId, 'provider:provider-a:delete');
  presenter.moveFocus('next');

  assert.equal(presenter.state.focusedId, 'provider:provider-b:switch');
  assert.deepEqual(fixture.events, ['load']);
});

test('edit activation emits only the injected provider edit intent and preserves activation state', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations();
  const presenter = new ProviderManagementPresenter(fixture.operations);
  await presenter.load();
  presenter.moveFocus('next');

  await presenter.activateFocused();

  assert.deepEqual(fixture.events, ['load', 'edit:provider-a:xtream']);
  assert.equal(presenter.state.activeProviderId, 'provider-a');
  assert.equal(presenter.state.confirmation, null);
  assert.equal(presenter.state.focusedId, 'provider:provider-a:edit');
});

test('presenter state never prefills stored credential or URL-shaped edit data', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations();
  const presenter = new ProviderManagementPresenter(fixture.operations);
  await presenter.load();

  const serialized = JSON.stringify(presenter.state);
  for (const forbidden of [
    'serverUrl',
    'playlistUrl',
    'username',
    'password',
    'https://credential.example.invalid',
    'secret-password',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.deepEqual(fixture.events, ['load']);
});

test('explicit switch action delegates then reloads authoritative provider state', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations();
  const presenter = new ProviderManagementPresenter(fixture.operations);
  await presenter.load();
  presenter.moveFocus('next');
  presenter.moveFocus('next');
  presenter.moveFocus('next');

  await presenter.activateFocused();

  assert.deepEqual(fixture.events, ['load', 'switch:provider-b', 'load']);
  assert.equal(presenter.state.providers.find((item: any) => item.id === 'provider-b')?.isActive, true);
  assert.equal(presenter.state.focusedId, 'provider:provider-b:switch');
});

test('add-provider entry is an injected presentation intent', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations({ providers: [], activeProviderId: null });
  const presenter = new ProviderManagementPresenter(fixture.operations);
  await presenter.load();

  assert.equal(presenter.state.status, 'empty');
  assert.equal(presenter.state.focusedId, 'add-provider');
  await presenter.activateFocused();

  assert.deepEqual(fixture.events, ['load', 'add']);
});

test('delete action opens confirmation and does not delete before explicit confirm', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations();
  const presenter = new ProviderManagementPresenter(fixture.operations);
  await presenter.load();
  presenter.moveFocus('next');
  presenter.moveFocus('next');

  await presenter.activateFocused();

  assert.equal(presenter.state.confirmation?.providerId, 'provider-a');
  assert.equal(presenter.state.focusedId, 'cancel-delete');
  assert.deepEqual(fixture.events, ['load']);
});

test('cancelling delete closes one layer and restores the delete action focus', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations();
  const presenter = new ProviderManagementPresenter(fixture.operations);
  await presenter.load();
  presenter.moveFocus('next');
  presenter.moveFocus('next');
  await presenter.activateFocused();

  await presenter.activateFocused();

  assert.equal(presenter.state.confirmation, null);
  assert.equal(presenter.state.focusedId, 'provider:provider-a:delete');
  assert.deepEqual(fixture.events, ['load']);
});

test('confirmed delete delegates once then reloads and restores focus to a surviving provider', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations();
  const presenter = new ProviderManagementPresenter(fixture.operations);
  await presenter.load();
  presenter.moveFocus('next');
  presenter.moveFocus('next');
  await presenter.activateFocused();
  presenter.moveFocus('next');

  await presenter.activateFocused();

  assert.deepEqual(fixture.events, ['load', 'delete:provider-a', 'load']);
  assert.equal(presenter.state.confirmation, null);
  assert.equal(presenter.state.focusedId, 'provider:provider-b:switch');
  assert.deepEqual(presenter.state.providers.map((item: any) => item.id), ['provider-b']);
});

test('load failure exposes a sanitized error state', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();
  const fixture = createOperations({ loadError: new Error('https://secret.example/user:pass') });
  const presenter = new ProviderManagementPresenter(fixture.operations);

  await presenter.load();

  assert.equal(presenter.state.status, 'error');
  assert.equal(presenter.state.errorMessage, 'Sağlayıcılar yüklenemedi.');
  assert.equal(JSON.stringify(presenter.state).includes('secret.example'), false);
});

test('switch and delete failures stay sanitized and keep the focused presentation stable', async () => {
  const { ProviderManagementPresenter } = await loadPresenterModule();

  const switchFixture = createOperations({ switchError: new Error('https://secret.example/switch') });
  const switchPresenter = new ProviderManagementPresenter(switchFixture.operations);
  await switchPresenter.load();
  switchPresenter.moveFocus('next');
  switchPresenter.moveFocus('next');
  switchPresenter.moveFocus('next');
  await switchPresenter.activateFocused();
  assert.equal(switchPresenter.state.errorMessage, 'Sağlayıcı değiştirilemedi.');
  assert.equal(switchPresenter.state.focusedId, 'provider:provider-b:switch');
  assert.equal(JSON.stringify(switchPresenter.state).includes('secret.example'), false);

  const deleteFixture = createOperations({ deleteError: new Error('https://secret.example/delete') });
  const deletePresenter = new ProviderManagementPresenter(deleteFixture.operations);
  await deletePresenter.load();
  deletePresenter.moveFocus('next');
  deletePresenter.moveFocus('next');
  await deletePresenter.activateFocused();
  deletePresenter.moveFocus('next');
  await deletePresenter.activateFocused();
  assert.equal(deletePresenter.state.errorMessage, 'Sağlayıcı silinemedi.');
  assert.equal(deletePresenter.state.confirmation?.providerId, 'provider-a');
  assert.equal(deletePresenter.state.focusedId, 'confirm-delete');
  assert.equal(JSON.stringify(deletePresenter.state).includes('secret.example'), false);
});
