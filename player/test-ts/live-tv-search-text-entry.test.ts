import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel } from '../src/domain/models.js';
import type { LiveTvState } from '../src/live-tv/contracts.js';
import { DomLiveTvView } from '../src/live-tv/dom-live-tv-view.js';
import {
  createLiveTvFeatureComposition,
  type LiveTvFeatureState,
} from '../src/live-tv/live-tv-feature-composition.js';

class FakeClassList {
  private readonly values = new Set<string>();
  add(...names: string[]): void { for (const name of names) this.values.add(name); }
  remove(...names: string[]): void { for (const name of names) this.values.delete(name); }
  toggle(name: string, force?: boolean): boolean {
    const next = force ?? !this.values.has(name);
    if (next) this.values.add(name); else this.values.delete(name);
    return next;
  }
  contains(name: string): boolean { return this.values.has(name); }
}

// Models the browser rules the fix depends on: detaching a node that holds
// focus blurs it, and replaceChildren detaches every existing child first.
class FakeElement {
  textContent = '';
  className = '';
  value = '';
  type = '';
  autocomplete = '';
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList();
  readonly scrollCalls: unknown[] = [];
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(private readonly owner: FakeDocument) {}

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) { node.detach(); node.parentElement = this; this.children.push(node); }
  }
  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of [...this.children]) child.detach();
    this.append(...nodes);
  }
  insertBefore(node: FakeElement, reference: FakeElement | null): FakeElement {
    node.detach();
    const index = reference === null ? -1 : this.children.indexOf(reference);
    node.parentElement = this;
    if (index === -1) this.children.push(node); else this.children.splice(index, 0, node);
    return node;
  }
  remove(): void { this.detach(); }
  contains(node: FakeElement | null): boolean {
    for (let current = node; current !== null; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }
  focus(): void { this.owner.activeElement = this; }
  scrollIntoView(options?: unknown): void { this.scrollCalls.push(options); }
  blur(): void { if (this.owner.activeElement === this) this.owner.activeElement = this.owner.body; }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  dispatch(type: string): void { for (const listener of this.listeners.get(type) ?? []) listener(); }

  private detach(): void {
    const parent = this.parentElement;
    if (parent === null) return;
    if (this.contains(this.owner.activeElement)) this.owner.activeElement = this.owner.body;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

class FakeDocument {
  readonly body: FakeElement;
  activeElement: FakeElement | null;
  private readonly elements = new Map<string, FakeElement>();

  constructor(ids: readonly string[]) {
    this.body = new FakeElement(this);
    this.activeElement = this.body;
    for (const id of ids) {
      const element = new FakeElement(this);
      this.body.append(element);
      this.elements.set(id, element);
    }
  }
  getElementById(id: string): FakeElement | null { return this.elements.get(id) ?? null; }
  createElement(): FakeElement { return new FakeElement(this); }
}

function channel(id: string, name: string): Channel {
  return { providerId: 'provider-a', id, name, categoryId: null, logoUrl: null, number: null };
}

const channels = [channel('1', 'Şeker'), channel('2', 'Spor'), channel('3', 'Haber')];
const refreshInput = {
  providerId: 'provider-a',
  channels,
  visibleChannels: channels,
  categories: [],
  highlightedChannelId: '1',
};

function liveState(): LiveTvState {
  return {
    providerId: 'provider-a',
    playingChannelId: null,
    highlightedChannelId: '1',
    activeScope: { kind: 'all' },
    restoreChannelIdByScope: {},
    overlayOpen: true,
    overlayZone: 'CHANNEL',
    playbackStatus: 'IDLE',
    pendingIntent: null,
    playbackError: null,
    numericInput: '',
  };
}

async function fixture() {
  const composition = createLiveTvFeatureComposition({
    epg: { async getCurrent() { return null; }, async getNext() { return null; } },
    favorites: {
      async isFavorite() { return false; },
      async toggle() { return true; },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 0,
  });
  await composition.refresh(refreshInput);
  const document = new FakeDocument(['sidebar', 'channel-list', 'group-list', 'channel-name', 'live-tv-status', 'numeric-zap']);
  const queries: string[] = [];
  const view = new DomLiveTvView(document as unknown as Document, {
    onSearchQuery(query) { queries.push(query); },
  });
  const render = (features: LiveTvFeatureState) => view.render(liveState(), {
    categories: [], channels, visibleChannels: channels, features,
  });
  const searchSection = () => document.getElementById('sidebar')!.children
    .find((element) => element.dataset.featureRoot === 'm4')!.children
    .find((element) => element.dataset.featureSection === 'search') ?? null;
  const searchInput = () => searchSection()?.children
    .find((element) => element.className === 'live-tv-search-input') ?? null;
  const results = () => searchSection()?.children
    .filter((element) => element.dataset.resultKey !== undefined) ?? [];
  const resultKeys = () => results().map((element) => element.dataset.resultKey);
  return { composition, document, queries, render, searchInput, results, resultKeys };
}

void test('Search input takes DOM focus when Search opens on the input zone', async () => {
  const { composition, document, render, searchInput } = await fixture();

  render(composition.openSearch(refreshInput));

  assert.ok(searchInput());
  assert.equal(document.activeElement, searchInput());
});

void test('typing re-renders keep the same focused Search input and update results in place', async () => {
  const { composition, document, queries, render, searchInput, resultKeys } = await fixture();
  render(composition.openSearch(refreshInput));
  const input = searchInput()!;

  input.value = 'ş';
  input.dispatch('input');
  const typed = composition.updateSearchQuery(refreshInput, queries.at(-1)!);
  render(typed);

  assert.deepEqual(queries, ['ş']);
  assert.equal(searchInput(), input);
  assert.equal(document.activeElement, input);
  assert.equal(input.value, 'ş');
  assert.ok(typed.search.items.length > 0);
  assert.deepEqual(resultKeys(), typed.search.items.map((item) => item.key));

  const changed = composition.updateSearchQuery(refreshInput, 'haber');
  render(changed);
  assert.equal(searchInput(), input);
  assert.equal(document.activeElement, input);
  assert.deepEqual(resultKeys(), changed.search.items.map((item) => item.key));
});

void test('moving into results releases input focus and returning to the input restores it', async () => {
  const { composition, document, render, searchInput } = await fixture();
  render(composition.openSearch(refreshInput, 's'));
  const input = searchInput()!;

  render(composition.handleSearchKeyboard({ key: 'ArrowDown', keyCode: 40 }).state);
  assert.equal(searchInput(), input);
  assert.notEqual(document.activeElement, input);

  render(composition.handleSearchKeyboard({ key: 'ArrowUp', keyCode: 38 }).state);
  assert.equal(searchInput(), input);
  assert.equal(document.activeElement, input);
});

void test('closing Search drops the input and a reopened Search starts focused with the new query', async () => {
  const { composition, document, render, searchInput } = await fixture();
  const opened = composition.openSearch(refreshInput, 'ş');
  render(opened);
  const first = searchInput()!;

  render({ ...opened, layer: 'none' });
  assert.equal(searchInput(), null);
  assert.notEqual(document.activeElement, first);

  render(composition.openSearch(refreshInput, 'h'));
  const reopened = searchInput()!;
  assert.notEqual(reopened, first);
  assert.equal(reopened.value, 'h');
  assert.equal(document.activeElement, reopened);
});

// The Search panel is height-capped and scrolls; a focused result below its
// visible rows must be brought into view as the remote moves through results.
void test('the focused Search result is scrolled into view and the input zone scrolls no result', async () => {
  const { composition, render, results } = await fixture();
  render(composition.openSearch(refreshInput, 's'));
  assert.ok(results().length > 0);
  for (const result of results()) assert.deepEqual(result.scrollCalls, []);

  render(composition.handleSearchKeyboard({ key: 'ArrowDown', keyCode: 40 }).state);

  const focused = results().filter((result) => result.dataset.presentationState === 'focused');
  assert.equal(focused.length, 1);
  assert.deepEqual(focused[0]!.scrollCalls, [{ block: 'nearest' }]);
  for (const result of results()) {
    if (result !== focused[0]) assert.deepEqual(result.scrollCalls, []);
  }
});
