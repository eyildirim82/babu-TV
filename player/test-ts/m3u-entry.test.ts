import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderError, type ProviderErrorCode } from '../src/providers/errors.js';
import type { M3uEntryValidationErrorCode } from '../src/providers/m3u/m3u-entry-validation.js';

type M3uEntryAction = 'up' | 'down' | 'select' | 'back';

interface M3uEntryCallbacks {
  onSubmit(input: { playlistUrl: string }): Promise<void>;
  onBack(): void;
}

interface M3uEntryViewPort {
  show(): void;
  hide(): void;
  isVisible(): boolean;
  handleAction(action: M3uEntryAction): void;
}

interface M3uEntryModule {
  M3U_ENTRY_FOCUS_IDS: readonly string[];
  M3uEntryView: new (document: Document, callbacks: M3uEntryCallbacks) => M3uEntryViewPort;
  renderM3uEntryMarkup(): string;
  m3uEntryValidationMessageForCode(code: M3uEntryValidationErrorCode): string;
  m3uEntryProviderMessageForCode(code: ProviderErrorCode): string;
}

async function loadM3uEntryModule(): Promise<M3uEntryModule> {
  const moduleUrl = new URL('../src/m3u-entry.ts', import.meta.url).href;
  const loaded = await import(moduleUrl).catch(() => null);
  assert.ok(loaded, 'M3U entry presentation module must exist');
  return loaded as unknown as M3uEntryModule;
}

class FakeClassList {
  private values = new Set<string>();
  add(...names: string[]) { names.forEach((name) => this.values.add(name)); }
  remove(...names: string[]) { names.forEach((name) => this.values.delete(name)); }
  contains(name: string) { return this.values.has(name); }
}

class FakeElement {
  id = '';
  tagName: string;
  type = '';
  value = '';
  textContent = '';
  disabled = false;
  className = '';
  classList = new FakeClassList();
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
  addEventListener() {}
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  body = new FakeElement('body', this);

  createElement(tag: string) { return new FakeElement(tag, this); }

  getElementById(id: string): FakeElement | null {
    const visit = (node: FakeElement): FakeElement | null => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(this.body);
  }
}

function asDocument(fake: FakeDocument): Document {
  return fake as unknown as Document;
}

async function flush() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function focusConnect(view: M3uEntryViewPort) {
  view.handleAction('down');
  view.handleAction('select');
  await flush();
}

test('uses a fixed URL, connect, back remote focus order', async () => {
  const { M3U_ENTRY_FOCUS_IDS } = await loadM3uEntryModule();
  assert.deepEqual(M3U_ENTRY_FOCUS_IDS, [
    'm3u-playlist-url',
    'm3u-connect',
    'm3u-back',
  ]);
});

test('render contract contains one URL input and no credential-bearing data attributes', async () => {
  const { renderM3uEntryMarkup } = await loadM3uEntryModule();
  const markup = renderM3uEntryMarkup();
  assert.match(markup, /id="m3u-playlist-url"[^>]*type="url"|type="url"[^>]*id="m3u-playlist-url"/);
  assert.doesNotMatch(markup, /data-(?:url|playlist|credential|provider)/i);
});

test('validation messages cover the frozen M3U entry validation contract', async () => {
  const { m3uEntryValidationMessageForCode } = await loadM3uEntryModule();
  assert.equal(m3uEntryValidationMessageForCode('REQUIRED'), 'Oynatma listesi URL\'si gerekli.');
  assert.equal(m3uEntryValidationMessageForCode('INVALID_URL'), 'Geçerli bir oynatma listesi URL\'si girin.');
  assert.equal(m3uEntryValidationMessageForCode('UNSUPPORTED_PROTOCOL'), 'Yalnızca HTTP veya HTTPS adresleri desteklenir.');
});

test('invalid input stays visible and never invokes onboarding', async () => {
  const { M3uEntryView } = await loadM3uEntryModule();
  const document = new FakeDocument();
  let submits = 0;
  const view = new M3uEntryView(asDocument(document), {
    onSubmit: async () => { submits += 1; },
    onBack: () => {},
  });
  view.show();
  const input = document.getElementById('m3u-playlist-url')!;
  input.value = 'not a url';

  await focusConnect(view);

  assert.equal(submits, 0);
  assert.equal(input.value, 'not a url');
  assert.equal(document.getElementById('m3u-status')!.textContent, 'Geçerli bir oynatma listesi URL\'si girin.');
  assert.equal(document.activeElement?.id, 'm3u-playlist-url');
});

test('valid submit forwards the preserved input exactly once while pending and blocks Back', async () => {
  const { M3uEntryView } = await loadM3uEntryModule();
  const document = new FakeDocument();
  let resolveSubmit!: () => void;
  const submissions: Array<{ playlistUrl: string }> = [];
  let backs = 0;
  const view = new M3uEntryView(asDocument(document), {
    onSubmit: async (input) => {
      submissions.push(input);
      await new Promise<void>((resolve) => { resolveSubmit = resolve; });
    },
    onBack: () => { backs += 1; },
  });
  view.show();
  const input = document.getElementById('m3u-playlist-url')!;
  input.value = '  https://example.invalid/playlist.m3u?quality=hd  ';

  view.handleAction('down');
  view.handleAction('select');
  view.handleAction('select');
  view.handleAction('back');
  await flush();

  assert.deepEqual(submissions, [{ playlistUrl: '  https://example.invalid/playlist.m3u?quality=hd  ' }]);
  assert.equal(backs, 0);
  assert.equal(document.getElementById('m3u-connect')!.disabled, true);
  assert.equal(document.getElementById('m3u-status')!.textContent, 'Oynatma listesi ekleniyor…');

  resolveSubmit();
  await flush();
  assert.equal(document.getElementById('m3u-status')!.textContent, 'Oynatma listesi eklendi.');
  assert.equal(document.getElementById('m3u-connect')!.disabled, true);
});

test('failed onboarding preserves input, exposes only safe error copy, and returns focus to connect', async () => {
  const { M3uEntryView, m3uEntryProviderMessageForCode } = await loadM3uEntryModule();
  assert.equal(m3uEntryProviderMessageForCode('NETWORK'), 'Oynatma listesine ulaşılamadı.');

  const document = new FakeDocument();
  const view = new M3uEntryView(asDocument(document), {
    onSubmit: async () => {
      throw new ProviderError(
        'NETWORK',
        null,
        'transport detail for https://example.invalid/playlist.m3u?quality=hd',
      );
    },
    onBack: () => {},
  });
  view.show();
  const input = document.getElementById('m3u-playlist-url')!;
  input.value = 'https://example.invalid/playlist.m3u?quality=hd';

  await focusConnect(view);

  assert.equal(input.value, 'https://example.invalid/playlist.m3u?quality=hd');
  assert.equal(document.getElementById('m3u-status')!.textContent, 'Oynatma listesine ulaşılamadı.');
  assert.doesNotMatch(document.getElementById('m3u-status')!.textContent, /example\.invalid|quality=hd/i);
  assert.equal(document.getElementById('m3u-connect')!.disabled, false);
  assert.equal(document.activeElement?.id, 'm3u-connect');
});

test('idle Back closes through the injected callback without submitting', async () => {
  const { M3uEntryView } = await loadM3uEntryModule();
  const document = new FakeDocument();
  let backs = 0;
  let submits = 0;
  const view = new M3uEntryView(asDocument(document), {
    onSubmit: async () => { submits += 1; },
    onBack: () => { backs += 1; },
  });
  view.show();
  view.handleAction('back');

  assert.equal(backs, 1);
  assert.equal(submits, 0);
});
