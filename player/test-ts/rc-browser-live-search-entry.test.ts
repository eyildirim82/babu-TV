import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, EpgProgram } from '../src/domain/models.js';
import { buildChannelActions } from '../src/channel-actions/channel-actions-model.js';
import {
  createLiveTvFeatureComposition,
  type LiveTvFeaturePorts,
} from '../src/live-tv/live-tv-feature-composition.js';
import {
  LiveTvController,
  type LiveTvView,
  type LiveTvViewModel,
} from '../src/live-tv/live-tv-controller.js';
import { DomLiveTvView } from '../src/live-tv/dom-live-tv-view.js';
import type { LiveTvState } from '../src/live-tv/contracts.js';

function channel(id = '42'): Channel {
  return {
    providerId: 'provider-a',
    id,
    name: id === '42' ? 'Şeker Haber' : `Channel ${id}`,
    categoryId: null,
    logoUrl: null,
    number: 42,
  };
}

function program(channelId: string): EpgProgram {
  return {
    channelId,
    startMs: 1_000,
    endMs: 2_000,
    title: 'Şimdi',
    description: 'Program detail',
  };
}

function ports(): LiveTvFeaturePorts {
  return {
    epg: {
      async getCurrent(_providerId, channelId) { return program(channelId); },
      async getNext() { return null; },
    },
    favorites: {
      async isFavorite() { return false; },
      async toggle() { return true; },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 1_500,
  };
}

function refreshInput() {
  const channels = [channel()];
  return {
    providerId: 'provider-a',
    channels,
    visibleChannels: channels,
    categories: [],
    highlightedChannelId: '42',
  };
}

class RecordingView implements LiveTvView {
  readonly models: LiveTvViewModel[] = [];
  render(_state: LiveTvState, model: LiveTvViewModel): void { this.models.push(model); }
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

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
  private readonly listeners = new Map<string, Array<() => void>>();

  append(...children: FakeElement[]): void { this.children.push(...children); }
  replaceChildren(...children: FakeElement[]): void { this.children = [...children]; }
  focus(): void {}
  blur(): void {}
  addEventListener(type: string, listener: () => void): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }
  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeDocument {
  readonly elements = new Map<string, FakeElement>();
  constructor(ids: readonly string[]) {
    for (const id of ids) this.elements.set(id, new FakeElement());
  }
  getElementById(id: string): FakeElement | null { return this.elements.get(id) ?? null; }
  createElement(): FakeElement { return new FakeElement(); }
}

function liveState(): LiveTvState {
  return {
    providerId: 'provider-a',
    playingChannelId: null,
    highlightedChannelId: '42',
    activeScope: { kind: 'all' },
    restoreChannelIdByScope: { all: '42' },
    overlayOpen: true,
    overlayZone: 'CHANNEL',
    playbackStatus: 'IDLE',
    pendingIntent: null,
    playbackError: null,
    numericInput: '',
  };
}

test('RC-BROWSER Search: basic Channel Actions expose a non-optional Search entry', () => {
  const actions = buildChannelActions({
    providerId: 'provider-a',
    channelId: '42',
    isFavorite: false,
    programInfoAvailable: true,
  });

  assert.deepEqual(actions.map((item) => [item.id, item.label]), [
    ['WATCH', 'İzle'],
    ['FAVORITE', 'Favoriye Ekle'],
    ['PROGRAM_INFO', 'Program Bilgisi'],
    ['SEARCH', 'Ara'],
  ]);
});

test('RC-BROWSER Search: arrows/OK open Search without creating playback intent', async () => {
  const view = new RecordingView();
  const requests: string[] = [];
  const features = createLiveTvFeatureComposition(ports());
  const controller = new LiveTvController({
    intent: {
      async requestChannel(input) {
        requests.push(input.channelId);
        return 'playing';
      },
    },
    platform: {
      capabilities: () => ({ tizen: false, optionsKey: true, channelKeys: true, numericKeys: false }),
      registerOptionalKeys() {},
      exitApp() {},
    },
    view,
    features,
  });

  controller.enter({
    provider: {
      id: 'provider-a',
      kind: 'xtream',
      name: 'Provider A',
      createdAtMs: 1,
      lastSuccessfulSyncAtMs: null,
    },
    categories: [],
    channels: [channel()],
  });
  await nextTurn();
  await nextTurn();

  await controller.handleInput({ type: 'ACTION', action: 'RIGHT' });
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.equal(view.models.at(-1)?.features?.layer, 'actions');

  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });

  assert.equal(view.models.at(-1)?.features?.layer, 'search');
  assert.equal(view.models.at(-1)?.features?.search.focusZone, 'input');
  assert.deepEqual(requests, []);
});

test('RC-BROWSER Search: browser/TV keyboard input updates the production Search query', async () => {
  const input = refreshInput();
  const composition = createLiveTvFeatureComposition(ports());
  await composition.refresh(input);
  const features = composition.openSearch(input);
  const document = new FakeDocument([
    'sidebar',
    'channel-list',
    'group-list',
    'channel-name',
    'live-tv-status',
    'numeric-zap',
  ]);
  const queries: string[] = [];
  type SearchAwareView = new (
    document: Document,
    callbacks: { onSearchQuery(query: string): void },
  ) => DomLiveTvView;
  const View = DomLiveTvView as unknown as SearchAwareView;
  const view = new View(document as unknown as Document, {
    onSearchQuery(query) { queries.push(query); },
  });

  view.render(liveState(), {
    categories: [],
    channels: input.channels,
    visibleChannels: input.channels,
    features,
  });

  const root = document.getElementById('sidebar')!.children
    .find((element) => element.dataset.featureRoot === 'm4')!;
  const search = root.children.find((element) => element.dataset.featureSection === 'search')!;
  const searchInput = search.children.find((element) => element.className === 'live-tv-search-input')!;
  searchInput.value = 'şeker';
  searchInput.dispatch('input');

  assert.deepEqual(queries, ['şeker']);
});
