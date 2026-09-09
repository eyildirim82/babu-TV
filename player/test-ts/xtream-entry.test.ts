import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderError } from '../src/providers/errors.js';
import {
  XTREAM_ENTRY_FOCUS_IDS,
  XtreamEntryView,
  renderXtreamEntryMarkup,
  xtreamEntryMessageForCode,
} from '../src/xtream-entry.js';

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

test('uses the fixed five-item focus order', () => {
  assert.deepEqual(XTREAM_ENTRY_FOCUS_IDS, [
    'xtream-server-url',
    'xtream-username',
    'xtream-password',
    'xtream-connect',
    'xtream-back',
  ]);
});

test('maps ProviderError codes to approved Turkish copy', () => {
  assert.equal(xtreamEntryMessageForCode('AUTH'), 'Kullanıcı adı veya şifre hatalı.');
  assert.equal(xtreamEntryMessageForCode('NETWORK'), 'Sunucuya ulaşılamadı.');
  assert.equal(xtreamEntryMessageForCode('TIMEOUT'), 'Bağlantı zaman aşımına uğradı.');
  assert.equal(xtreamEntryMessageForCode('NOT_FOUND'), 'Sunucu kaynağı bulunamadı.');
  assert.equal(xtreamEntryMessageForCode('SERVER'), 'Sunucu geçici bir hata döndürdü.');
  assert.equal(xtreamEntryMessageForCode('MALFORMED'), 'Sunucu yanıtı desteklenmiyor.');
  assert.equal(xtreamEntryMessageForCode('UNAVAILABLE'), 'Bağlantı kurulamadı.');
});

test('render contract uses masked password and never credential data attributes', () => {
  const markup = renderXtreamEntryMarkup();
  assert.match(markup, /id="xtream-password"[^>]*type="password"|type="password"[^>]*id="xtream-password"/);
  assert.doesNotMatch(markup, /data-(?:server|username|password|credential)/i);
});

test('rejects a second submit while one is pending', async () => {
  const document = new FakeDocument();
  let resolveSubmit!: () => void;
  let submits = 0;
  const view = new XtreamEntryView(asDocument(document), {
    onSubmit: async () => {
      submits += 1;
      await new Promise<void>((resolve) => { resolveSubmit = resolve; });
    },
    onBack: () => {},
  });
  view.show();
  (document.getElementById('xtream-server-url')!).value = 'https://demo.invalid';
  (document.getElementById('xtream-username')!).value = 'demo';
  (document.getElementById('xtream-password')!).value = 'secret';

  for (let i = 0; i < 3; i += 1) view.handleAction('down');
  view.handleAction('select');
  view.handleAction('select');
  await flush();
  assert.equal(submits, 1);
  resolveSubmit();
  await flush();
});

test('keeps values and returns focus to Bağlan after a failed submit', async () => {
  const document = new FakeDocument();
  const view = new XtreamEntryView(asDocument(document), {
    onSubmit: async () => { throw new ProviderError('AUTH', 401, 'safe'); },
    onBack: () => {},
  });
  view.show();
  const server = document.getElementById('xtream-server-url')!;
  const username = document.getElementById('xtream-username')!;
  const password = document.getElementById('xtream-password')!;
  server.value = 'https://demo.invalid';
  username.value = 'demo-user';
  password.value = 'demo-pass';

  for (let i = 0; i < 3; i += 1) view.handleAction('down');
  view.handleAction('select');
  await flush();

  assert.equal(server.value, 'https://demo.invalid');
  assert.equal(username.value, 'demo-user');
  assert.equal(password.value, 'demo-pass');
  assert.equal(document.getElementById('xtream-status')!.textContent, 'Kullanıcı adı veya şifre hatalı.');
  assert.equal(document.activeElement?.id, 'xtream-connect');
});

test('empty fields fail locally without calling submit', async () => {
  const document = new FakeDocument();
  let submits = 0;
  const view = new XtreamEntryView(asDocument(document), {
    onSubmit: async () => { submits += 1; },
    onBack: () => {},
  });
  view.show();
  for (let i = 0; i < 3; i += 1) view.handleAction('down');
  view.handleAction('select');
  await flush();

  assert.equal(submits, 0);
  assert.equal(document.getElementById('xtream-status')!.textContent, 'Sunucu, kullanıcı adı ve şifre gerekli.');
});

test('Back calls onBack without submitting', () => {
  const document = new FakeDocument();
  let backs = 0;
  let submits = 0;
  const view = new XtreamEntryView(asDocument(document), {
    onSubmit: async () => { submits += 1; },
    onBack: () => { backs += 1; },
  });
  view.show();
  view.handleAction('back');
  assert.equal(backs, 1);
  assert.equal(submits, 0);
});
