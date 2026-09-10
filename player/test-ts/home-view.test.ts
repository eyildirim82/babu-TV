import assert from 'node:assert/strict';
import test from 'node:test';
import type { HomeViewModel } from '../src/home/home-domain.js';

interface HomeViewModule {
  HomeView: new (
    document: Document,
    callbacks: { onIntent(intent: unknown): void; onBack(): void },
  ) => {
    show(state: { kind: 'ready'; model: HomeViewModel }): void;
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

  appendChild(child: FakeElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
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
