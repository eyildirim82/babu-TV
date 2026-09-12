import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { FocusState } from '../src/domain/actions.js';
import type { Category, Channel, ProviderSummary } from '../src/domain/models.js';
import { makeChannelKey } from '../src/domain/models.js';
import type { Platform, PlatformCapabilities } from '../src/platform/contracts.js';
import type { ProviderSnapshot } from '../src/providers/provider-core-service.js';
import { reduceFocus } from '../src/focus/focus-reducer.js';
import { HomeView } from '../src/home/home-view.js';
import type { HomeViewModel } from '../src/home/home-domain.js';
import { FirstRunView } from '../src/first-run/first-run-view.js';
import {
  ProviderManagementPresenter,
  type ProviderManagementOperations,
} from '../src/provider-management/provider-management-presenter.js';
import { ProviderManagementSurface } from '../src/app/provider-management-surface.js';
import {
  handleSearchKeyboard,
  type SearchFocusState,
} from '../src/search/search-input-boundary.js';
import {
  createInitialLiveTvState,
  reduceLiveTv,
} from '../src/live-tv/live-tv-state.js';
import {
  LiveTvController,
  type ChannelIntentPort,
  type LiveTvView,
  type LiveTvViewModel,
} from '../src/live-tv/live-tv-controller.js';
import { createLiveTvFeatureComposition } from '../src/live-tv/live-tv-feature-composition.js';
import { buildEpgLiveTvViewModel } from '../src/live-tv/epg-live-tv-view-model.js';
import { presentEpgLiveTv } from '../src/live-tv/epg-live-tv-presentation.js';
import type { PairingPhoneController } from '../src/pairing/phone-controller.js';
import { PairingPhoneView } from '../src/pairing/phone-view.js';
import type { PairingTvBootstrapV1 } from '../src/pairing/tv-controller.js';
import { PairingTvView } from '../src/pairing/tv-view.js';

class FakeElement {
  id = '';
  tagName: string;
  textContent = '';
  className = '';
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  attributes = new Map<string, string>();
  ownerDocument: FakeDocument;
  disabled = false;
  value = '';
  type = '';
  autocomplete = '';
  src = '';
  alt = '';
  private readonly listeners = new Map<string, Array<() => void | Promise<void>>>();

  constructor(tag: string, document: FakeDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
  }

  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement): FakeElement {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parentElement = null;
    return child;
  }

  remove(): void {
    this.parentElement?.removeChild(this);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  scrollIntoView(): void {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, callback: () => void | Promise<void>): void {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  async dispatch(type: string): Promise<void> {
    for (const callback of this.listeners.get(type) ?? []) {
      await callback();
    }
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  body = new FakeElement('body', this);

  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }

  getElementById(id: string): FakeElement | null {
    return findElement(this.body, (element) => element.id === id);
  }
}

function findElement(
  node: FakeElement,
  predicate: (element: FakeElement) => boolean,
): FakeElement | null {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findElement(child, predicate);
    if (found !== null) return found;
  }
  return null;
}

function asDocument(document: FakeDocument): Document {
  return document as unknown as Document;
}

function focusState(overrides: Partial<FocusState> = {}): FocusState {
  return {
    screen: 'LIVE_TV',
    zone: 'CHANNEL',
    itemId: null,
    restoreItemId: null,
    ...overrides,
  };
}

function channel(providerId: string, id: string, categoryId: string | null = null): Channel {
  return {
    providerId,
    id,
    name: `${providerId}-${id}`,
    categoryId,
    logoUrl: null,
    number: null,
  };
}

function category(providerId: string, id: string): Category {
  return { providerId, id, name: id };
}

function snapshot(
  providerId: string,
  channels: readonly Channel[] = [channel(providerId, 'one'), channel(providerId, 'two')],
): ProviderSnapshot {
  return {
    provider: {
      id: providerId,
      kind: 'xtream',
      name: providerId,
      createdAtMs: 1,
      lastSuccessfulSyncAtMs: null,
    },
    categories: [category(providerId, 'news')],
    channels,
  };
}

function homeModel(providerIds: readonly string[]): HomeViewModel {
  const activeProviderId = providerIds[0] ?? null;
  return {
    providerSelector: {
      activeProviderId,
      options: providerIds.map((providerId, index) => ({
        providerId,
        kind: index % 2 === 0 ? 'xtream' as const : 'm3u' as const,
        name: providerId,
        isActive: providerId === activeProviderId,
        intent: { type: 'SELECT_PROVIDER' as const, providerId },
      })),
    },
    lastWatched: null,
    liveTv: { available: false, intent: null },
    favorites: { items: [], viewAllIntent: null },
    frequentlyWatched: { items: [] },
    settings: { intent: { type: 'OPEN_SETTINGS' } },
    defaultFocus: { kind: 'provider-selector' },
  };
}

class ProviderOperations implements ProviderManagementOperations {
  providers: ProviderSummary[] = [
    { id: 'provider-a', kind: 'xtream', name: 'A' },
    { id: 'provider-b', kind: 'm3u', name: 'B' },
  ];
  activeProviderId: string | null = 'provider-a';
  readonly calls: string[] = [];

  async load() {
    return { providers: [...this.providers], activeProviderId: this.activeProviderId };
  }

  async switchProvider(providerId: string): Promise<void> {
    this.calls.push(`switch:${providerId}`);
    this.activeProviderId = providerId;
  }

  async requestEditProvider(providerId: string): Promise<void> {
    this.calls.push(`edit:${providerId}`);
  }

  async deleteProvider(providerId: string): Promise<void> {
    this.calls.push(`delete:${providerId}`);
    this.providers = this.providers.filter((provider) => provider.id !== providerId);
    if (this.activeProviderId === providerId) this.activeProviderId = this.providers[0]?.id ?? null;
  }

  async requestAddProvider(): Promise<void> {
    this.calls.push('add');
  }
}

class FakeIntent implements ChannelIntentPort {
  readonly requests: Array<{ providerId: string; channelId: string; previousChannelId: string | null }> = [];

  async requestChannel(input: {
    providerId: string;
    channelId: string;
    previousChannelId: string | null;
  }): Promise<'playing'> {
    this.requests.push(input);
    return 'playing';
  }
}

class FakePlatform implements Platform {
  exits = 0;

  capabilities(): PlatformCapabilities {
    return { tizen: true, optionsKey: true, channelKeys: true, numericKeys: true };
  }

  registerOptionalKeys(): void {}

  exitApp(): void {
    this.exits += 1;
  }
}

class RecordingView implements LiveTvView {
  readonly renders: Array<{ providerId: string; highlightedChannelId: string | null; overlayOpen: boolean }> = [];

  render(state: ReturnType<LiveTvController['state']>, _model: LiveTvViewModel): void {
    this.renders.push({
      providerId: state.providerId,
      highlightedChannelId: state.highlightedChannelId,
      overlayOpen: state.overlayOpen,
    });
  }
}

void test('M7 NAV focus preserves stable identity through reorder, removal, empty and repeated sync', () => {
  const itemIds = ['one', 'two', 'three'];
  const initial = reduceFocus(focusState(), {
    type: 'SYNC_ITEMS',
    itemIds,
    playingItemId: 'two',
  });
  assert.equal(initial.itemId, 'two');

  const reordered = reduceFocus(initial, {
    type: 'SYNC_ITEMS',
    itemIds: ['three', 'two', 'one'],
    playingItemId: 'one',
  });
  assert.strictEqual(reordered, initial, 'an unchanged stable focus should not churn state');

  const moved = reduceFocus(reordered, {
    type: 'MOVE_ITEM',
    itemIds: ['three', 'two', 'one'],
    direction: 'NEXT',
  });
  assert.equal(moved.itemId, 'one');

  const removed = reduceFocus(focusState({ itemId: 'gone', restoreItemId: 'also-gone' }), {
    type: 'SYNC_ITEMS',
    itemIds: ['survivor'],
    playingItemId: null,
  });
  assert.equal(removed.itemId, 'survivor');

  const empty = reduceFocus(removed, {
    type: 'SYNC_ITEMS',
    itemIds: [],
    playingItemId: 'survivor',
  });
  assert.equal(empty.itemId, null);
});

void test('M7 NAV focus provider partition distinguishes the same channelId in two providers', () => {
  const providerAKey = makeChannelKey('provider-a', 'shared-channel');
  const providerBKey = makeChannelKey('provider-b', 'shared-channel');
  assert.notEqual(providerAKey, providerBKey);

  const next = reduceFocus(focusState({ itemId: providerAKey, restoreItemId: providerAKey }), {
    type: 'SYNC_ITEMS',
    itemIds: [providerBKey],
    playingItemId: null,
  });
  assert.equal(next.itemId, providerBKey);
});

void test('M7 NAV focus Home highlight and provider rerender require explicit activation', () => {
  const document = new FakeDocument();
  const intents: unknown[] = [];
  const view = new HomeView(asDocument(document), {
    onIntent: (intent) => { intents.push(intent); },
    onBack: () => {},
  });

  view.show({ kind: 'ready', model: homeModel(['provider-a', 'provider-b']) });
  assert.equal(document.activeElement?.getAttribute('data-home-focus-key'), 'home-provider:provider-a');

  view.handleAction('right');
  assert.equal(document.activeElement?.getAttribute('data-home-focus-key'), 'home-provider:provider-b');
  assert.deepEqual(intents, [], 'highlight alone must not switch providers');

  view.setState({ kind: 'ready', model: homeModel(['provider-b', 'provider-a']) });
  assert.equal(document.activeElement?.getAttribute('data-home-focus-key'), 'home-provider:provider-b');
  assert.deepEqual(intents, []);

  view.setState({ kind: 'ready', model: homeModel(['provider-a']) });
  assert.equal(document.activeElement?.getAttribute('data-home-focus-key'), 'home-provider:provider-a');
  assert.deepEqual(intents, []);

  view.handleAction('select');
  assert.deepEqual(intents, [{ type: 'SELECT_PROVIDER', providerId: 'provider-a' }]);
});

void test('M7 NAV Back First Run focus movement never chooses provider or pairing until select', () => {
  const document = new FakeDocument();
  let xtream = 0;
  let m3u = 0;
  let pairing = 0;
  let backs = 0;
  const view = new FirstRunView(asDocument(document), {
    onXtreamSelected: () => { xtream += 1; },
    onM3uSelected: () => { m3u += 1; },
    onPairingSelected: () => { pairing += 1; },
    onBack: () => { backs += 1; },
  });

  view.show();
  view.handleAction('right');
  view.handleAction('right');
  assert.equal(document.activeElement?.id, 'first-run-pairing');
  assert.deepEqual({ xtream, m3u, pairing, backs }, { xtream: 0, m3u: 0, pairing: 0, backs: 0 });

  view.handleAction('down');
  assert.equal(document.activeElement?.id, 'first-run-back');
  view.handleAction('up');
  assert.equal(document.activeElement?.id, 'first-run-pairing');
  assert.equal(pairing, 0);

  view.handleAction('select');
  assert.equal(pairing, 1);
  view.handleAction('back');
  assert.equal(backs, 1);
  assert.equal(pairing, 1);
});

void test('M7 NAV provider highlight add re-entry switch and delete require explicit activation', async () => {
  const operations = new ProviderOperations();
  const presenter = new ProviderManagementPresenter(operations);
  await presenter.load();

  assert.equal(presenter.state.focusedId, 'provider:provider-a:switch');
  presenter.moveFocus('next');
  assert.equal(presenter.state.focusedId, 'provider:provider-a:edit');
  assert.deepEqual(operations.calls, []);
  await presenter.activateFocused();
  assert.deepEqual(operations.calls, ['edit:provider-a']);

  presenter.moveFocus('next');
  assert.equal(presenter.state.focusedId, 'provider:provider-a:delete');
  assert.deepEqual(operations.calls, ['edit:provider-a']);
  await presenter.activateFocused();
  assert.equal(presenter.state.confirmation?.providerId, 'provider-a');
  assert.deepEqual(operations.calls, ['edit:provider-a'], 'opening confirmation must not delete');

  presenter.moveFocus('next');
  assert.equal(presenter.state.focusedId, 'confirm-delete');
  assert.deepEqual(operations.calls, ['edit:provider-a']);
  await presenter.activateFocused();
  assert.deepEqual(operations.calls, ['edit:provider-a', 'delete:provider-a']);
  assert.equal(presenter.state.focusedId, 'provider:provider-b:switch');

  presenter.moveFocus('next');
  presenter.moveFocus('next');
  presenter.moveFocus('next');
  assert.equal(presenter.state.focusedId, 'add-provider');
  assert.deepEqual(operations.calls, ['edit:provider-a', 'delete:provider-a']);
  await presenter.activateFocused();
  assert.deepEqual(operations.calls, ['edit:provider-a', 'delete:provider-a', 'add']);
});

void test('M7 NAV provider refresh preserves reordered focus and falls back after deletion', async () => {
  const operations = new ProviderOperations();
  const presenter = new ProviderManagementPresenter(operations);
  await presenter.load('provider:provider-b:edit');
  assert.equal(presenter.state.focusedId, 'provider:provider-b:edit');

  operations.providers.reverse();
  await presenter.load();
  assert.equal(presenter.state.focusedId, 'provider:provider-b:edit');

  operations.providers = operations.providers.filter((provider) => provider.id !== 'provider-b');
  operations.activeProviderId = 'provider-a';
  await presenter.load();
  assert.equal(presenter.state.focusedId, 'provider:provider-a:switch');
});

void test('M7 NAV Back closes Provider Management delete confirmation before parent surface', async () => {
  const operations = new ProviderOperations();
  const presenter = new ProviderManagementPresenter(operations);
  const document = new FakeDocument();
  let parentBacks = 0;
  const surface = new ProviderManagementSurface(asDocument(document), presenter, {
    onBack: () => { parentBacks += 1; },
    onOpenLegacySettings: () => {},
  });

  await surface.show();
  await surface.handleAction('down');
  await surface.handleAction('down');
  assert.equal(presenter.state.focusedId, 'provider:provider-a:delete');
  await surface.handleAction('select');
  assert.equal(presenter.state.confirmation?.providerId, 'provider-a');
  assert.equal(presenter.state.focusedId, 'cancel-delete');

  await surface.handleAction('down');
  assert.equal(presenter.state.focusedId, 'confirm-delete');
  await surface.handleAction('back');
  assert.equal(presenter.state.confirmation, null);
  assert.equal(presenter.state.focusedId, 'provider:provider-a:delete');
  assert.equal(parentBacks, 0);
  assert.deepEqual(operations.calls, []);

  await surface.handleAction('back');
  assert.equal(parentBacks, 1);
  assert.deepEqual(operations.calls, []);
});

void test('M7 NAV Back Search moves focus without activation and closes without result intent', () => {
  const providerA = makeChannelKey('provider-a', 'shared');
  const providerB = makeChannelKey('provider-b', 'shared');
  let state: SearchFocusState = { zone: 'input', focusedResultKey: null, restoreResultKey: null };

  const firstMove = handleSearchKeyboard({
    state,
    resultKeys: [providerA, providerB],
    event: { key: 'ArrowDown' },
  });
  assert.equal(firstMove.state.focusedResultKey, providerA);
  assert.equal(firstMove.intent, null);

  const secondMove = handleSearchKeyboard({
    state: firstMove.state,
    resultKeys: [providerA, providerB],
    event: { key: 'ArrowDown' },
  });
  assert.equal(secondMove.state.focusedResultKey, providerB);
  assert.equal(secondMove.intent, null);

  const close = handleSearchKeyboard({
    state: secondMove.state,
    resultKeys: [providerA, providerB],
    event: { key: 'GoBack' },
  });
  assert.deepEqual(close.intent, { type: 'CLOSE_SEARCH' });

  const activate = handleSearchKeyboard({
    state: secondMove.state,
    resultKeys: [providerA, providerB],
    event: { key: 'Enter' },
  });
  assert.deepEqual(activate.intent, { type: 'ACTIVATE_RESULT', resultKey: providerB });

  state = { zone: 'results', focusedResultKey: providerA, restoreResultKey: providerA };
  const stale = handleSearchKeyboard({
    state,
    resultKeys: [providerB],
    event: { key: 'ArrowDown' },
  });
  assert.equal(stale.state.focusedResultKey, providerB);
  assert.equal(stale.intent, null);
});

void test('M7 NAV refresh Live TV favorites handles reorder, deletion, empty and single item without playback', () => {
  const channels = [channel('provider-a', 'one'), channel('provider-a', 'two')];
  let state = reduceLiveTv(createInitialLiveTvState('provider-a'), {
    type: 'ENTER',
    channels,
  });
  assert.equal(state.highlightedChannelId, 'one');
  assert.equal(state.playingChannelId, null);

  state = reduceLiveTv(state, {
    type: 'MOVE_HIGHLIGHT',
    direction: 'NEXT',
    channels,
  });
  assert.equal(state.highlightedChannelId, 'two');
  assert.equal(state.playingChannelId, null);

  state = reduceLiveTv(state, {
    type: 'SYNC_CHANNELS',
    channels: [channels[1]!, channels[0]!],
  });
  assert.equal(state.highlightedChannelId, 'two');

  state = reduceLiveTv(state, {
    type: 'SYNC_FAVORITES',
    channelIds: ['two'],
    channels,
  });
  state = reduceLiveTv(state, {
    type: 'SET_SCOPE',
    scope: { kind: 'favorites' },
    channels,
  });
  assert.equal(state.highlightedChannelId, 'two');

  state = reduceLiveTv(state, {
    type: 'SYNC_FAVORITES',
    channelIds: [],
    channels,
  });
  assert.equal(state.highlightedChannelId, null);
  assert.equal(state.playingChannelId, null);

  state = reduceLiveTv(state, {
    type: 'SET_SCOPE',
    scope: { kind: 'all' },
    channels: [channels[0]!],
  });
  assert.equal(state.highlightedChannelId, 'one');
  assert.equal(state.playingChannelId, null);
});

void test('M7 NAV provider Live TV switch partitions same channelId and highlight remains non-playback', async () => {
  const intent = new FakeIntent();
  const platform = new FakePlatform();
  const controller = new LiveTvController({ intent, platform, view: new RecordingView() });

  controller.enter(snapshot('provider-a', [channel('provider-a', 'shared'), channel('provider-a', 'other')]));
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  assert.equal(controller.state().highlightedChannelId, 'other');
  assert.deepEqual(intent.requests, []);

  controller.enter(snapshot('provider-b', [channel('provider-b', 'shared')]));
  assert.equal(controller.state().providerId, 'provider-b');
  assert.equal(controller.state().highlightedChannelId, 'shared');
  assert.equal(controller.state().playingChannelId, null);
  assert.deepEqual(intent.requests, []);

  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.deepEqual(intent.requests, [{
    providerId: 'provider-b',
    channelId: 'shared',
    previousChannelId: null,
  }]);
});

void test('M7 NAV Back closes one Live TV layer at a time across repeated overlay cycles', async () => {
  const intent = new FakeIntent();
  const platform = new FakePlatform();
  const controller = new LiveTvController({ intent, platform, view: new RecordingView() });
  controller.enter(snapshot('provider-a'));

  await controller.handleInput({ type: 'ACTION', action: 'OPTIONS' });
  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(controller.state().overlayOpen, true, 'first Back closes options only');
  assert.equal(platform.exits, 0);
  assert.deepEqual(intent.requests, []);

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(controller.state().overlayOpen, false, 'second Back closes overlay only');
  assert.equal(platform.exits, 0);

  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  assert.equal(controller.state().overlayOpen, true, 'navigation reopens overlay');
  assert.deepEqual(intent.requests, [], 'reopening/highlighting must not play');
  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(controller.state().overlayOpen, false);
  assert.equal(platform.exits, 0);

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(platform.exits, 1, 'Back exits only after owned layers are closed');
});

void test('M7 NAV refresh EPG present missing present keeps program-info layer closure one-at-a-time', async () => {
  const selectedChannel = channel('provider-a', 'one');
  let currentProgram = {
    channelId: 'one',
    startMs: 0,
    endMs: 100,
    title: 'Program',
    description: 'Detail',
  };
  let hasProgram = true;
  const ports = {
    epg: {
      async getCurrent() { return hasProgram ? currentProgram : null; },
      async getNext() { return null; },
    },
    favorites: {
      async isFavorite() { return false; },
      async toggle() { return false; },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 50,
  };
  const features = createLiveTvFeatureComposition(ports);
  const input = {
    providerId: 'provider-a',
    channels: [selectedChannel],
    visibleChannels: [selectedChannel],
    categories: [] as Category[],
    highlightedChannelId: 'one',
  };

  let featureState = await features.refresh(input);
  assert.equal(featureState.epg.selected?.current.status, 'available');
  featureState = features.openActions(input);
  assert.equal(featureState.layer, 'actions');
  featureState = features.openProgramInfo();
  assert.equal(featureState.layer, 'program-info');
  assert.equal(featureState.programInfo?.title, 'Program');

  assert.equal(features.closeTopLayer(), true);
  assert.equal(features.current().layer, 'actions', 'first close returns from program-info to actions');
  assert.equal(features.closeTopLayer(), true);
  assert.equal(features.current().layer, 'none', 'second close returns from actions to base');

  hasProgram = false;
  featureState = await features.refresh(input);
  assert.equal(featureState.epg.selected?.current.status, 'missing');
  assert.equal(featureState.programInfo, null);

  currentProgram = { ...currentProgram, title: 'Program Again' };
  hasProgram = true;
  featureState = await features.refresh(input);
  assert.equal(featureState.epg.selected?.current.status, 'available');
  assert.equal(featureState.epg.selected?.detail?.title, 'Program Again');

  const model = await buildEpgLiveTvViewModel({
    providerId: 'provider-a',
    visibleChannels: [selectedChannel],
    highlightedChannelId: 'one',
    atMs: 50,
    query: ports.epg,
  });
  const presentation = presentEpgLiveTv(model, {
    formatTimeRange: (startMs, endMs) => `${startMs}-${endMs}`,
  });
  assert.equal(presentation.selected?.detail?.title, 'Program Again');
});

void test('M7 NAV Back pairing TV closes exactly once without completing pairing', async () => {
  const document = new FakeDocument();
  const bootstrap: PairingTvBootstrapV1 = {
    version: 1,
    sessionId: 'session-1',
    expiresAtMs: 10_000,
    tvPublicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
    relayBaseUrl: 'https://relay.example.test/',
  };
  let backs = 0;
  let completions = 0;
  let cleared = 0;
  const view = new PairingTvView(
    asDocument(document),
    {
      async start() { return bootstrap; },
      async poll() { return { status: 'pending' as const }; },
    },
    {
      onBack: () => { backs += 1; },
      onCompleted: () => { completions += 1; },
    },
    { phoneBaseUrl: 'https://phone.example.test/pair', pollIntervalMs: 1000 },
    { async toDataUrl() { return 'data:image/png;base64,AA'; } },
    {
      setTimeout() { return 1; },
      clearTimeout() { cleared += 1; },
    },
  );

  await view.show();
  assert.ok(document.getElementById('pairing-tv-root'));
  view.handleBack();
  assert.equal(document.getElementById('pairing-tv-root'), null);
  assert.equal(backs, 1);
  assert.equal(completions, 0);
  assert.equal(cleared, 1);

  view.handleBack();
  assert.equal(backs, 1, 'hidden pairing layer must not consume another Back');
  assert.equal(completions, 0);
});

void test('M7 NAV Back pairing phone never submits until explicit submit activation', async () => {
  const document = new FakeDocument();
  type FakePhoneState =
    | { kind: 'choose-provider' }
    | { kind: 'm3u'; input: { playlistUrl: string }; error: null };
  let state: FakePhoneState = { kind: 'choose-provider' };
  let submits = 0;
  let backs = 0;
  const controller = {
    state: () => state,
    chooseProvider: (kind: 'xtream' | 'm3u') => {
      if (kind === 'm3u') state = { kind: 'm3u', input: { playlistUrl: '' }, error: null };
    },
    updateM3u: (input: { playlistUrl: string }) => {
      state = { kind: 'm3u', input, error: null };
    },
    updateXtream: () => {},
    async submit() { submits += 1; },
    back() {
      backs += 1;
      state = { kind: 'choose-provider' };
    },
  } as unknown as PairingPhoneController;
  const view = new PairingPhoneView(asDocument(document), controller);

  view.show();
  await document.getElementById('pairing-phone-m3u')?.dispatch('click');
  assert.ok(document.getElementById('pairing-phone-back'));
  assert.equal(submits, 0);

  await document.getElementById('pairing-phone-back')?.dispatch('click');
  assert.equal(backs, 1);
  assert.equal(submits, 0);
  assert.ok(document.getElementById('pairing-phone-m3u'));

  await document.getElementById('pairing-phone-m3u')?.dispatch('click');
  await document.getElementById('pairing-phone-submit')?.dispatch('click');
  assert.equal(submits, 1);
  assert.equal(backs, 1);
});

void test('M7 NAV reduced motion presentation changes transitions without removing navigation controls', async () => {
  const cssFiles = [
    '../src/ui/home.css',
    '../src/ui/first-run.css',
    '../src/ui/provider-management.css',
    '../src/ui/live-tv.css',
    '../src/ui/pairing-tv.css',
    '../src/ui/pairing-phone.css',
  ];

  for (const relativePath of cssFiles) {
    const css = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    const marker = css.indexOf('@media (prefers-reduced-motion: reduce)');
    assert.ok(marker >= 0, `${relativePath} must define reduced-motion presentation`);
    assert.match(css.slice(marker), /transition:\s*none/);
  }
});
