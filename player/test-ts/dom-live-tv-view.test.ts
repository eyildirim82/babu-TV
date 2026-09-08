import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Channel } from '../src/domain/models.js';
import type { LiveTvState } from '../src/live-tv/contracts.js';
import { DomLiveTvView } from '../src/live-tv/dom-live-tv-view.js';
import type { LiveTvViewModel } from '../src/live-tv/live-tv-controller.js';

class FakeClassList {
  private readonly values = new Set<string>();

  add(...names: string[]): void {
    for (const name of names) this.values.add(name);
  }

  remove(...names: string[]): void {
    for (const name of names) this.values.delete(name);
  }

  toggle(name: string, force?: boolean): boolean {
    const next = force ?? !this.values.has(name);
    if (next) this.values.add(name);
    else this.values.delete(name);
    return next;
  }

  contains(name: string): boolean {
    return this.values.has(name);
  }
}

class FakeElement {
  textContent = '';
  className = '';
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList();
  children: FakeElement[] = [];

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = [...children];
  }
}

class FakeDocument {
  readonly elements = new Map<string, FakeElement>();

  constructor(ids: readonly string[]) {
    for (const id of ids) this.elements.set(id, new FakeElement());
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.get(id) ?? null;
  }

  createElement(): FakeElement {
    return new FakeElement();
  }
}

function channel(id: string, name = id): Channel {
  return {
    providerId: 'provider-1',
    id,
    name,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

function category(id: string): Category {
  return { providerId: 'provider-1', id, name: id };
}

function state(overrides: Partial<LiveTvState> = {}): LiveTvState {
  return {
    providerId: 'provider-1',
    playingChannelId: null,
    highlightedChannelId: 'a',
    activeScope: { kind: 'all' },
    restoreChannelIdByScope: {},
    overlayOpen: true,
    overlayZone: 'CHANNEL',
    playbackStatus: 'IDLE',
    pendingIntent: null,
    playbackError: null,
    numericInput: '',
    ...overrides,
  };
}

function model(): LiveTvViewModel {
  const channels = [channel('a', 'Alpha'), channel('b', 'Beta')];
  return {
    categories: [category('news')],
    channels,
    visibleChannels: channels,
  };
}

function fixture() {
  const document = new FakeDocument([
    'sidebar',
    'channel-list',
    'group-list',
    'channel-name',
    'live-tv-status',
    'numeric-zap',
  ]);
  const view = new DomLiveTvView(document as unknown as Document);
  return { document, view };
}

void test('renders playing and focused channel identities independently using stable IDs', () => {
  const { document, view } = fixture();

  view.render(state({ playingChannelId: 'a', highlightedChannelId: 'b' }), model());

  const channelList = document.getElementById('channel-list')!;
  assert.equal(channelList.children.length, 2);
  const playing = channelList.children.find((item) => item.dataset.channelId === 'a')!;
  const focused = channelList.children.find((item) => item.dataset.channelId === 'b')!;
  assert.equal(playing.classList.contains('playing'), true);
  assert.equal(playing.classList.contains('focused'), false);
  assert.equal(focused.classList.contains('focused'), true);
  assert.equal(focused.classList.contains('playing'), false);
  assert.equal(document.getElementById('channel-name')!.textContent, 'Alpha');
  assert.equal(document.getElementById('sidebar')!.classList.contains('closed'), false);
});

void test('renders loading, failure, and numeric state without inventing timers', () => {
  const { document, view } = fixture();
  const status = document.getElementById('live-tv-status')!;
  const numeric = document.getElementById('numeric-zap')!;

  view.render(state({ playbackStatus: 'PREPARING', numericInput: '42' }), model());
  assert.equal(status.textContent, 'Yayın açılıyor...');
  assert.equal(status.classList.contains('hidden'), false);
  assert.equal(numeric.textContent, '42');
  assert.equal(numeric.classList.contains('hidden'), false);

  view.render(state({ playbackStatus: 'FAILED', playbackError: 'ENGINE_FAILURE' }), model());
  assert.equal(status.textContent, 'Yayın açılamadı');
  assert.equal(status.classList.contains('hidden'), false);
  assert.equal(numeric.textContent, '');
  assert.equal(numeric.classList.contains('hidden'), true);
});

void test('overlay state controls the sidebar and category rendering uses stable scope IDs', () => {
  const { document, view } = fixture();

  view.render(state({
    overlayOpen: false,
    overlayZone: 'CATEGORY',
    activeScope: { kind: 'category', categoryId: 'news' },
  }), model());

  assert.equal(document.getElementById('sidebar')!.classList.contains('closed'), true);
  const groups = document.getElementById('group-list')!;
  assert.equal(groups.children.length, 2);
  assert.equal(groups.children[0]?.dataset.scopeKey, 'all');
  assert.equal(groups.children[1]?.dataset.scopeKey, 'category:news');
  assert.equal(groups.children[1]?.classList.contains('focused'), true);
});
