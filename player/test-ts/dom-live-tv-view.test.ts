import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Channel } from '../src/domain/models.js';
import type { LiveTvState } from '../src/live-tv/contracts.js';
import { DomLiveTvView } from '../src/live-tv/dom-live-tv-view.js';
import type { LiveTvViewModel } from '../src/live-tv/live-tv-controller.js';
import { UI_COPY } from '../src/ui/copy.js';

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

void test('renders focused, playing, and focused-playing channel presentation states independently', () => {
  const { document, view } = fixture();

  view.render(state({ playingChannelId: 'a', highlightedChannelId: 'b' }), model());

  let channelList = document.getElementById('channel-list')!;
  assert.equal(channelList.children.length, 2);
  let playing = channelList.children.find((item) => item.dataset.channelId === 'a')!;
  let focused = channelList.children.find((item) => item.dataset.channelId === 'b')!;
  assert.equal(playing.dataset.presentationState, 'playing');
  assert.equal(playing.classList.contains('playing'), true);
  assert.equal(playing.classList.contains('focused'), false);
  assert.equal(focused.dataset.presentationState, 'focused');
  assert.equal(focused.classList.contains('highlighted'), true);
  assert.equal(focused.classList.contains('focused'), true);
  assert.equal(focused.classList.contains('playing'), false);
  assert.equal(document.getElementById('channel-name')!.textContent, 'Alpha');
  assert.equal(document.getElementById('sidebar')!.classList.contains('closed'), false);

  view.render(state({ playingChannelId: 'a', highlightedChannelId: 'a' }), model());
  channelList = document.getElementById('channel-list')!;
  playing = channelList.children.find((item) => item.dataset.channelId === 'a')!;
  assert.equal(playing.dataset.presentationState, 'focused-playing');
  assert.equal(playing.classList.contains('highlighted'), true);
  assert.equal(playing.classList.contains('focused'), true);
  assert.equal(playing.classList.contains('playing'), true);
});

void test('renders categories and channels together while the active interaction zone owns strong focus', () => {
  const { document, view } = fixture();

  view.render(state({
    highlightedChannelId: 'b',
    overlayZone: 'CHANNEL',
    activeScope: { kind: 'category', categoryId: 'news' },
  }), model());

  const channelList = document.getElementById('channel-list')!;
  const groups = document.getElementById('group-list')!;
  assert.equal(channelList.classList.contains('hidden'), false);
  assert.equal(groups.classList.contains('hidden'), false);
  assert.equal(channelList.classList.contains('zone-active'), true);
  assert.equal(groups.classList.contains('zone-active'), false);
  const activeGroup = groups.children.find((item) => item.dataset.scopeKey === 'category:news')!;
  assert.equal(activeGroup.classList.contains('active'), true);
  assert.equal(activeGroup.classList.contains('focused'), false);
  const highlighted = channelList.children.find((item) => item.dataset.channelId === 'b')!;
  assert.equal(highlighted.classList.contains('highlighted'), true);
  assert.equal(highlighted.classList.contains('focused'), true);

  view.render(state({
    highlightedChannelId: 'b',
    overlayZone: 'CATEGORY',
    activeScope: { kind: 'category', categoryId: 'news' },
  }), model());

  assert.equal(channelList.classList.contains('hidden'), false);
  assert.equal(groups.classList.contains('hidden'), false);
  assert.equal(channelList.classList.contains('zone-active'), false);
  assert.equal(groups.classList.contains('zone-active'), true);
  assert.equal(activeGroup.classList.contains('active'), true);
  assert.equal(groups.children.find((item) => item.dataset.scopeKey === 'category:news')!.classList.contains('focused'), true);
  assert.equal(channelList.children.find((item) => item.dataset.channelId === 'b')!.classList.contains('highlighted'), true);
  assert.equal(channelList.children.find((item) => item.dataset.channelId === 'b')!.classList.contains('focused'), false);
});

void test('renders shared playback status copy and numeric overlay presentation without inventing timers', () => {
  const { document, view } = fixture();
  const status = document.getElementById('live-tv-status')!;
  const numeric = document.getElementById('numeric-zap')!;

  view.render(state({ playbackStatus: 'RESOLVING', numericInput: '42' }), model());
  assert.equal(status.textContent, UI_COPY.streamOpening);
  assert.equal(status.dataset.playbackStatus, 'RESOLVING');
  assert.equal(status.classList.contains('hidden'), false);
  assert.equal(numeric.textContent, '42');
  assert.equal(numeric.dataset.presentationState, 'active');
  assert.equal(numeric.classList.contains('hidden'), false);

  view.render(state({ playbackStatus: 'RECOVERING' }), model());
  assert.equal(status.textContent, UI_COPY.recovering);
  assert.equal(status.dataset.playbackStatus, 'RECOVERING');
  assert.equal(numeric.textContent, '');
  assert.equal(numeric.dataset.presentationState, 'idle');
  assert.equal(numeric.classList.contains('hidden'), true);

  view.render(state({ playbackStatus: 'FAILED', playbackError: 'ENGINE_FAILURE' }), model());
  assert.equal(status.textContent, UI_COPY.streamFailed);
  assert.equal(status.dataset.playbackStatus, 'FAILED');
  assert.equal(status.classList.contains('hidden'), false);
});

void test('rendering remains downstream-only and does not mutate Live TV state or view model', () => {
  const { view } = fixture();
  const currentState = state({
    playingChannelId: 'a',
    highlightedChannelId: 'b',
    activeScope: { kind: 'category', categoryId: 'news' },
    playbackStatus: 'FAILED',
    playbackError: 'ENGINE_FAILURE',
    numericInput: '7',
  });
  const currentModel = model();
  const stateBefore = JSON.parse(JSON.stringify(currentState));
  const modelBefore = JSON.parse(JSON.stringify(currentModel));

  view.render(currentState, currentModel);

  assert.deepEqual(currentState, stateBefore);
  assert.deepEqual(currentModel, modelBefore);
});
