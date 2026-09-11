import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, EpgProgram } from '../src/domain/models.js';
import type { LiveTvState } from '../src/live-tv/contracts.js';
import { DomLiveTvView } from '../src/live-tv/dom-live-tv-view.js';
import type { LiveTvViewModel } from '../src/live-tv/live-tv-controller.js';
import {
  createLiveTvFeatureComposition,
  type LiveTvFeaturePorts,
} from '../src/live-tv/live-tv-feature-composition.js';

class FakeClassList {
  private readonly values = new Set<string>();
  add(...names: string[]): void { for (const name of names) this.values.add(name); }
  remove(...names: string[]): void { for (const name of names) this.values.delete(name); }
  toggle(name: string, force?: boolean): boolean {
    const next = force ?? !this.values.has(name);
    if (next) this.values.add(name);
    else this.values.delete(name);
    return next;
  }
  contains(name: string): boolean { return this.values.has(name); }
}

class FakeElement {
  textContent = '';
  className = '';
  value = '';
  type = '';
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList();
  children: FakeElement[] = [];

  append(...children: FakeElement[]): void { this.children.push(...children); }
  replaceChildren(...children: FakeElement[]): void { this.children = [...children]; }
}

class FakeDocument {
  readonly elements = new Map<string, FakeElement>();

  constructor(ids: readonly string[]) {
    for (const id of ids) this.elements.set(id, new FakeElement());
  }

  getElementById(id: string): FakeElement | null { return this.elements.get(id) ?? null; }
  createElement(): FakeElement { return new FakeElement(); }
}

function channel(id: string, name = `Channel ${id}`): Channel {
  return {
    providerId: 'provider-1',
    id,
    name,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

function program(channelId: string, title = `Program ${channelId}`): EpgProgram {
  return {
    channelId,
    startMs: 1_000,
    endMs: 2_000,
    title,
    description: `${title} detail`,
  };
}

function state(overrides: Partial<LiveTvState> = {}): LiveTvState {
  return {
    providerId: 'provider-1',
    playingChannelId: 'b',
    highlightedChannelId: 'a',
    activeScope: { kind: 'all' },
    restoreChannelIdByScope: { all: 'a' },
    overlayOpen: true,
    overlayZone: 'CHANNEL',
    playbackStatus: 'PLAYING',
    pendingIntent: null,
    playbackError: null,
    numericInput: '',
    ...overrides,
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

function ports(): LiveTvFeaturePorts {
  return {
    epg: {
      async getCurrent(_providerId, channelId) { return program(channelId); },
      async getNext(_providerId, channelId) { return program(channelId, `Next ${channelId}`); },
    },
    favorites: {
      async isFavorite(_providerId, channelId) { return channelId === 'b'; },
      async toggle() { return true; },
      async reconcile() {
        return {
          available: [{ providerId: 'provider-1', channelId: 'b', addedAtMs: 1 }],
          missing: [],
        };
      },
    },
    nowMs: () => 1_500,
  };
}

async function featureModel(channels: readonly Channel[]) {
  const composition = createLiveTvFeatureComposition(ports());
  const input = {
    providerId: 'provider-1',
    channels,
    visibleChannels: channels,
    categories: [],
    highlightedChannelId: 'a',
  };
  const features = await composition.refresh(input);
  return { composition, input, features };
}

void test('M4-COMP DOM renders EPG context and Favorites projection without stealing channel focus', async () => {
  const channels = [channel('a', 'Alpha'), channel('b', 'Beta')];
  const { features } = await featureModel(channels);
  const { document, view } = fixture();
  const model: LiveTvViewModel = {
    categories: [],
    channels,
    visibleChannels: channels,
    features,
  };

  view.render(state(), model);

  const channelList = document.getElementById('channel-list')!;
  const highlighted = channelList.children.find((item) => item.dataset.channelId === 'a')!;
  const playing = channelList.children.find((item) => item.dataset.channelId === 'b')!;
  assert.equal(highlighted.dataset.presentationState, 'focused');
  assert.equal(playing.dataset.presentationState, 'playing');
  assert.match(highlighted.textContent, /Alpha/);
  assert.match(highlighted.textContent, /Program a/);

  const sidebar = document.getElementById('sidebar')!;
  const featureRoot = sidebar.children.find((item) => item.dataset.featureRoot === 'm4')!;
  assert.ok(featureRoot);
  const selected = featureRoot.children.find((item) => item.dataset.featureSection === 'selected-epg')!;
  assert.ok(selected);
  assert.equal(selected.classList.contains('focused'), false);
  assert.match(selected.textContent, /Program a/);
  assert.match(selected.textContent, /Next a/);

  const favorites = featureRoot.children.find((item) => item.dataset.featureSection === 'favorites')!;
  assert.ok(favorites);
  assert.match(favorites.textContent, /Favoriler/);
  assert.match(favorites.textContent, /Beta/);
});

void test('M4-COMP DOM renders Search stable keys, ACT-UI labels, and Program Info as separate layers', async () => {
  const channels = [channel('a', 'Haber A'), channel('b', 'Haber B')];
  const { composition, input } = await featureModel(channels);
  const { document, view } = fixture();

  let features = composition.openSearch(input, 'haber');
  view.render(state(), { categories: [], channels, visibleChannels: channels, features });
  let featureRoot = document.getElementById('sidebar')!.children.find((item) => item.dataset.featureRoot === 'm4')!;
  const search = featureRoot.children.find((item) => item.dataset.featureSection === 'search')!;
  assert.ok(search);
  const searchResults = search.children.filter((item) => item.dataset.resultKey !== undefined);
  assert.deepEqual(searchResults.map((item) => item.dataset.resultKey), ['provider-1:a', 'provider-1:b']);

  features = composition.openActions(input);
  view.render(state({ overlayZone: 'ACTIONS' }), { categories: [], channels, visibleChannels: channels, features });
  featureRoot = document.getElementById('sidebar')!.children.find((item) => item.dataset.featureRoot === 'm4')!;
  const actions = featureRoot.children.find((item) => item.dataset.featureSection === 'actions')!;
  assert.ok(actions);
  assert.deepEqual(actions.children.map((item) => item.textContent), ['İzle', 'Favoriye Ekle', 'Program Bilgisi']);

  composition.moveAction('NEXT');
  composition.moveAction('NEXT');
  features = composition.openProgramInfo();
  view.render(state({ overlayZone: 'ACTIONS' }), { categories: [], channels, visibleChannels: channels, features });
  featureRoot = document.getElementById('sidebar')!.children.find((item) => item.dataset.featureRoot === 'm4')!;
  const programInfo = featureRoot.children.find((item) => item.dataset.featureSection === 'program-info')!;
  assert.ok(programInfo);
  assert.match(programInfo.textContent, /Program a/);
  assert.match(programInfo.textContent, /Program a detail/);
});

void test('M4-COMP DOM exposes virtual:favorites as the focused category scope', async () => {
  const channels = [channel('a', 'Alpha'), channel('b', 'Beta')];
  const { features } = await featureModel(channels);
  const { document, view } = fixture();

  view.render(
    state({
      activeScope: { kind: 'favorites' },
      highlightedChannelId: 'b',
      overlayZone: 'CATEGORY',
      favoriteChannelIds: ['b'],
    }),
    {
      categories: [],
      channels,
      visibleChannels: [channels[1]!],
      features,
    },
  );

  const groups = document.getElementById('group-list')!;
  assert.deepEqual(groups.children.map((item) => item.dataset.scopeKey), [
    'all',
    'virtual:favorites',
  ]);
  const favoriteGroup = groups.children.find(
    (item) => item.dataset.scopeKey === 'virtual:favorites',
  )!;
  assert.equal(favoriteGroup.textContent, 'Favoriler');
  assert.equal(favoriteGroup.dataset.presentationState, 'focused');
});
