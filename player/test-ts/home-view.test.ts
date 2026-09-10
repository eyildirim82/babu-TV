import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { HomeViewModel } from '../src/home/home-domain.js';

type HomePresentationState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly model: HomeViewModel };

interface HomeViewModule {
  HomeView: new (
    document: Document,
    callbacks: { onIntent(intent: unknown): void; onBack(): void },
  ) => {
    show(state: HomePresentationState): void;
    setState(state: HomePresentationState): void;
    hide(): void;
    isVisible(): boolean;
    handleAction(action: 'left' | 'right' | 'up' | 'down' | 'select' | 'back'): void;
  };
}

async function loadHomeView(): Promise<HomeViewModule | null> {
  const modulePath = '../src/home/home-view.js';
  try {
    return await import(modulePath) as HomeViewModule;
  } catch {
    return null;
  }
}

class FakeElement {
  id = '';
  tagName: string;
  textContent = '';
  className = '';
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  attributes = new Map<string, string>();
  ownerDocument: FakeDocument;

  constructor(tag: string, document: FakeDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
  }

  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  appendChild(child: FakeElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement) {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parentElement = null;
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.removeChild(this);
  }

  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() {}
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }

  set innerHTML(_value: string) {
    throw new Error('HOME-UI must not render provider/channel data through innerHTML');
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  body = new FakeElement('body', this);

  createElement(tag: string) { return new FakeElement(tag, this); }

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
    if (found) return found;
  }
  return null;
}

function textTree(node: FakeElement): string {
  return [node.textContent, ...node.children.map(textTree)].filter(Boolean).join(' ');
}

function focusedKey(document: FakeDocument): string | null {
  return document.activeElement?.getAttribute('data-home-focus-key') ?? null;
}

function asDocument(fake: FakeDocument): Document {
  return fake as unknown as Document;
}

function readyModel(): HomeViewModel {
  return {
    providerSelector: {
      activeProviderId: 'provider-a',
      options: [
        {
          providerId: 'provider-a',
          kind: 'xtream',
          name: 'Salon <script>alert(1)</script>',
          isActive: true,
          intent: { type: 'SELECT_PROVIDER', providerId: 'provider-a' },
        },
      ],
    },
    lastWatched: {
      providerId: 'provider-a',
      channelId: 'last-1',
      name: 'Son Kanal',
      logoUrl: null,
      number: 7,
      currentProgram: null,
      lastPlayedAtMs: 10,
      intent: { type: 'PLAY_CHANNEL', providerId: 'provider-a', channelId: 'last-1' },
    },
    liveTv: {
      available: true,
      intent: { type: 'OPEN_LIVE_TV', providerId: 'provider-a', scope: 'all' },
    },
    favorites: {
      items: [
        {
          providerId: 'provider-a',
          channelId: 'fav-1',
          name: 'Favori Kanal',
          logoUrl: null,
          number: 12,
          currentProgram: null,
          intent: { type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'provider-a', channelId: 'fav-1' },
        },
      ],
      viewAllIntent: { type: 'OPEN_LIVE_TV', providerId: 'provider-a', scope: 'favorites' },
    },
    frequentlyWatched: {
      items: [
        {
          providerId: 'provider-a',
          channelId: 'freq-1',
          name: 'Sık Kanal',
          logoUrl: null,
          number: 24,
          currentProgram: null,
          intent: { type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'provider-a', channelId: 'freq-1' },
        },
      ],
    },
    settings: { intent: { type: 'OPEN_SETTINGS' } },
    defaultFocus: { kind: 'last-watched', channelId: 'last-1' },
  };
}

function twoColumnModel(): HomeViewModel {
  const base = readyModel();
  return {
    ...base,
    providerSelector: {
      activeProviderId: 'provider-a',
      options: [
        ...base.providerSelector.options,
        {
          providerId: 'provider-b',
          kind: 'm3u',
          name: 'Yatak Odası',
          isActive: false,
          intent: { type: 'SELECT_PROVIDER', providerId: 'provider-b' },
        },
      ],
    },
    favorites: {
      ...base.favorites,
      items: [
        ...base.favorites.items,
        {
          providerId: 'provider-a',
          channelId: 'fav-2',
          name: 'Favori İki',
          logoUrl: null,
          number: 13,
          currentProgram: null,
          intent: { type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'provider-a', channelId: 'fav-2' },
        },
      ],
    },
    frequentlyWatched: {
      items: [
        ...base.frequentlyWatched.items,
        {
          providerId: 'provider-a',
          channelId: 'freq-2',
          name: 'Sık İki',
          logoUrl: null,
          number: 25,
          currentProgram: null,
          intent: { type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'provider-a', channelId: 'freq-2' },
        },
      ],
    },
  };
}

test('HOME-UI renders ready Home sections in domain order using text nodes', async () => {
  const home = await loadHomeView();
  assert.ok(home, 'HOME-UI presentation module should exist');

  const document = new FakeDocument();
  const view = new home.HomeView(asDocument(document), {
    onIntent: () => {},
    onBack: () => {},
  });

  view.show({ kind: 'ready', model: readyModel() });

  const text = textTree(document.body);
  const labels = [
    'Sağlayıcı',
    'Son İzlenen',
    'Canlı TV',
    'Favoriler',
    'Sık İzlenenler',
    'Ayarlar',
  ];
  const positions = labels.map((label) => text.indexOf(label));
  assert.ok(positions.every((position) => position >= 0), `missing Home section in: ${text}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);

  assert.match(text, /Salon <script>alert\(1\)<\/script>/);
  assert.match(text, /Son Kanal/);
  assert.match(text, /Favori Kanal/);
  assert.match(text, /Sık Kanal/);
});

test('HOME-UI loading and error states stay non-actionable and render safe supplied copy', async () => {
  const home = await loadHomeView();
  assert.ok(home, 'HOME-UI presentation module should exist');

  const document = new FakeDocument();
  let intents = 0;
  const view = new home.HomeView(asDocument(document), {
    onIntent: () => { intents += 1; },
    onBack: () => {},
  });

  view.show({ kind: 'loading' });
  assert.equal(view.isVisible(), true);
  assert.match(textTree(document.body), /Ana sayfa hazırlanıyor…/);
  view.handleAction('select');
  assert.equal(intents, 0);

  view.setState({ kind: 'error', message: 'Bağlantı <yeniden> denenemedi' });
  const errorText = textTree(document.body);
  assert.match(errorText, /Bağlantı <yeniden> denenemedi/);
  assert.doesNotMatch(errorText, /Ana sayfa hazırlanıyor/);
  assert.doesNotMatch(errorText, /Salon <script>/);
  view.handleAction('select');
  assert.equal(intents, 0);

  view.hide();
  assert.equal(view.isVisible(), false);
});

test('HOME-UI first ready render honors HOME-D defaultFocus', async () => {
  const home = await loadHomeView();
  assert.ok(home);
  const document = new FakeDocument();
  const view = new home.HomeView(asDocument(document), { onIntent: () => {}, onBack: () => {} });

  view.show({ kind: 'ready', model: readyModel() });
  assert.equal(focusedKey(document), 'home-last-watched:last-1');

  const providerDefault = { ...readyModel(), defaultFocus: { kind: 'provider-selector' } as const };
  view.setState({ kind: 'ready', model: providerDefault });
  assert.equal(focusedKey(document), 'home-last-watched:last-1', 'stable key should win before a new default');

  view.hide();
  view.show({ kind: 'ready', model: providerDefault });
  assert.equal(focusedKey(document), 'home-provider:provider-a');
});

test('HOME-UI restores stable focus across rerender and falls back when the key disappears', async () => {
  const home = await loadHomeView();
  assert.ok(home);
  const document = new FakeDocument();
  const view = new home.HomeView(asDocument(document), { onIntent: () => {}, onBack: () => {} });

  view.show({ kind: 'ready', model: readyModel() });
  view.handleAction('down');
  view.handleAction('down');
  assert.equal(focusedKey(document), 'home-favorite:fav-1');

  view.setState({ kind: 'ready', model: readyModel() });
  assert.equal(focusedKey(document), 'home-favorite:fav-1');

  const withoutFavorite = {
    ...readyModel(),
    favorites: { items: [], viewAllIntent: null },
  } satisfies HomeViewModel;
  view.setState({ kind: 'ready', model: withoutFavorite });
  assert.equal(focusedKey(document), 'home-last-watched:last-1');

  const missingDefault = {
    ...withoutFavorite,
    lastWatched: null,
    defaultFocus: { kind: 'last-watched', channelId: 'gone' },
  } satisfies HomeViewModel;
  view.setState({ kind: 'ready', model: missingDefault });
  assert.equal(focusedKey(document), 'home-provider:provider-a');
});

test('HOME-UI left/right clamp within a row and focus movement emits no intent', async () => {
  const home = await loadHomeView();
  assert.ok(home);
  const document = new FakeDocument();
  const intents: unknown[] = [];
  const model = { ...twoColumnModel(), defaultFocus: { kind: 'provider-selector' } as const };
  const view = new home.HomeView(asDocument(document), {
    onIntent: (intent) => { intents.push(intent); },
    onBack: () => {},
  });

  view.show({ kind: 'ready', model });
  assert.equal(focusedKey(document), 'home-provider:provider-a');
  view.handleAction('right');
  assert.equal(focusedKey(document), 'home-provider:provider-b');
  view.handleAction('right');
  assert.equal(focusedKey(document), 'home-provider:provider-b');
  view.handleAction('left');
  assert.equal(focusedKey(document), 'home-provider:provider-a');
  assert.deepEqual(intents, []);
});

test('HOME-UI up/down preserves a valid column across conceptual rows', async () => {
  const home = await loadHomeView();
  assert.ok(home);
  const document = new FakeDocument();
  const view = new home.HomeView(asDocument(document), { onIntent: () => {}, onBack: () => {} });

  view.show({ kind: 'ready', model: twoColumnModel() });
  assert.equal(focusedKey(document), 'home-last-watched:last-1');
  view.handleAction('down');
  assert.equal(focusedKey(document), 'home-live-tv');
  view.handleAction('down');
  assert.equal(focusedKey(document), 'home-favorite:fav-1');
  view.handleAction('right');
  assert.equal(focusedKey(document), 'home-favorite:fav-2');
  view.handleAction('down');
  assert.equal(focusedKey(document), 'home-frequent:freq-2');
  view.handleAction('up');
  assert.equal(focusedKey(document), 'home-favorite:fav-2');
});

test('HOME-UI Select forwards exactly the focused HomeActionIntent once', async () => {
  const home = await loadHomeView();
  assert.ok(home);
  const document = new FakeDocument();
  const intents: unknown[] = [];
  const view = new home.HomeView(asDocument(document), {
    onIntent: (intent) => { intents.push(intent); },
    onBack: () => {},
  });

  view.show({ kind: 'ready', model: readyModel() });
  view.handleAction('select');
  assert.deepEqual(intents, [
    { type: 'PLAY_CHANNEL', providerId: 'provider-a', channelId: 'last-1' },
  ]);
});

test('HOME-UI Back delegates one layer and never emits a HomeActionIntent', async () => {
  const home = await loadHomeView();
  assert.ok(home);
  const document = new FakeDocument();
  const intents: unknown[] = [];
  let backs = 0;
  const view = new home.HomeView(asDocument(document), {
    onIntent: (intent) => { intents.push(intent); },
    onBack: () => { backs += 1; },
  });

  view.show({ kind: 'ready', model: readyModel() });
  view.handleAction('back');
  assert.equal(backs, 1);
  assert.deepEqual(intents, []);
});

test('HOME-UI stylesheet is scoped, TV-distance, focus-visible, and reduced-motion safe', async () => {
  const css = await readFile(new URL('../src/ui/home.css', import.meta.url), 'utf8').catch(() => null);
  assert.ok(css, 'HOME-UI scoped stylesheet should exist');
  assert.match(css, /\.home-page\b/);
  assert.match(css, /\.home-action:focus-visible/);
  assert.match(css, /var\(--babu-bg\)/);
  assert.match(css, /var\(--babu-accent-strong\)/);
  assert.match(css, /min-height:\s*(?:7[2-9]|[89]\d|1\d\d)px/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /transition:\s*none/);
  assert.match(css, /animation:\s*none/);
  assert.doesNotMatch(css, /(^|\n)\s*(?:html|body|:root|#)/m);
  assert.doesNotMatch(css, /\.babu-/);
});
