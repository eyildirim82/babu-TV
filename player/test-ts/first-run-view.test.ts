import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

type FirstRunModule = typeof import('../src/first-run/first-run-view.js');

async function loadFirstRun(): Promise<FirstRunModule | null> {
  try {
    return await import('../src/first-run/first-run-view.js');
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

test('FIRST-UI module exposes Turkish branded provider choices without credential fields', async () => {
  const firstRun = await loadFirstRun();
  assert.ok(firstRun, 'FIRST-UI presentation module should exist');

  const markup = firstRun.renderFirstRunMarkup({ kind: 'empty' });
  assert.match(markup, /BabuşTV/);
  assert.match(markup, /Xtream/);
  assert.match(markup, /M3U/);
  assert.match(markup, /Henüz bir sağlayıcı eklenmedi/);
  assert.doesNotMatch(markup, /password|username|credential|server-url|playlist-url|activate/i);
});

test('remote focus starts on Xtream, moves spatially, and restores the last provider card', async () => {
  const firstRun = await loadFirstRun();
  assert.ok(firstRun, 'FIRST-UI presentation module should exist');

  const document = new FakeDocument();
  const view = new firstRun.FirstRunView(asDocument(document), {
    onXtreamSelected: () => {},
    onM3uSelected: () => {},
    onBack: () => {},
  });

  view.show({ kind: 'empty' });
  assert.equal(document.activeElement?.id, 'first-run-xtream');

  view.handleAction('right');
  assert.equal(document.activeElement?.id, 'first-run-m3u');

  view.handleAction('down');
  assert.equal(document.activeElement?.id, 'first-run-back');

  view.handleAction('up');
  assert.equal(document.activeElement?.id, 'first-run-m3u');

  view.handleAction('right');
  assert.equal(document.activeElement?.id, 'first-run-m3u');
});

test('Select invokes only the focused provider handoff callback and never activates anything itself', async () => {
  const firstRun = await loadFirstRun();
  assert.ok(firstRun, 'FIRST-UI presentation module should exist');

  const document = new FakeDocument();
  let xtream = 0;
  let m3u = 0;
  let backs = 0;
  const view = new firstRun.FirstRunView(asDocument(document), {
    onXtreamSelected: () => { xtream += 1; },
    onM3uSelected: () => { m3u += 1; },
    onBack: () => { backs += 1; },
  });

  view.show({ kind: 'empty' });
  view.handleAction('select');
  assert.deepEqual({ xtream, m3u, backs }, { xtream: 1, m3u: 0, backs: 0 });

  view.handleAction('right');
  view.handleAction('select');
  assert.deepEqual({ xtream, m3u, backs }, { xtream: 1, m3u: 1, backs: 0 });
});

test('Back delegates one-layer dismissal and hidden views ignore remote input', async () => {
  const firstRun = await loadFirstRun();
  assert.ok(firstRun, 'FIRST-UI presentation module should exist');

  const document = new FakeDocument();
  let backs = 0;
  let xtream = 0;
  const view = new firstRun.FirstRunView(asDocument(document), {
    onXtreamSelected: () => { xtream += 1; },
    onM3uSelected: () => {},
    onBack: () => { backs += 1; },
  });

  view.show({ kind: 'empty' });
  view.handleAction('back');
  assert.equal(backs, 1);

  view.hide();
  view.handleAction('select');
  view.handleAction('back');
  assert.equal(xtream, 0);
  assert.equal(backs, 1);
});

test('empty and error states use fixed safe Turkish copy while keeping provider choices available', async () => {
  const firstRun = await loadFirstRun();
  assert.ok(firstRun, 'FIRST-UI presentation module should exist');

  const document = new FakeDocument();
  const view = new firstRun.FirstRunView(asDocument(document), {
    onXtreamSelected: () => {},
    onM3uSelected: () => {},
    onBack: () => {},
  });

  view.show({ kind: 'empty' });
  assert.equal(document.getElementById('first-run-status')?.textContent, 'Henüz bir sağlayıcı eklenmedi. Başlamak için bir bağlantı türü seçin.');

  view.setState({ kind: 'error', code: 'handoff-unavailable' });
  assert.equal(document.getElementById('first-run-status')?.textContent, 'Bağlantı ekranı şu anda açılamıyor. Lütfen yeniden deneyin.');
  assert.ok(document.getElementById('first-run-xtream'));
  assert.ok(document.getElementById('first-run-m3u'));
});

test('scoped stylesheet uses BabuşTV tokens, strong remote focus, and reduced-motion handling', async () => {
  const css = await readFile(new URL('../src/ui/first-run.css', import.meta.url), 'utf8').catch(() => null);
  assert.ok(css, 'FIRST-UI scoped stylesheet should exist');
  assert.match(css, /var\(--babu-bg\)/);
  assert.match(css, /var\(--babu-accent\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /#ff8c00|orange/i);
});

test('PAIR-I-WIRE absent pairing callback preserves the existing two-choice provider surface', async () => {
  const firstRun = await loadFirstRun();
  assert.ok(firstRun);
  const document = new FakeDocument();
  const view = new firstRun.FirstRunView(asDocument(document), {
    onXtreamSelected() {},
    onM3uSelected() {},
    onBack() {},
  });

  view.show({ kind: 'empty' });
  assert.equal(document.getElementById('first-run-pairing'), null);
  assert.equal(document.activeElement?.id, 'first-run-xtream');
  view.handleAction('right');
  assert.equal(document.activeElement?.id, 'first-run-m3u');
  view.handleAction('right');
  assert.equal(document.activeElement?.id, 'first-run-m3u');
});

test('PAIR-I-WIRE optional Telefonla Ekle is a stable focus target activated only by Select', async () => {
  const firstRun = await loadFirstRun();
  assert.ok(firstRun);
  const document = new FakeDocument();
  let xtream = 0;
  let m3u = 0;
  let pairing = 0;
  const callbacks = {
    onXtreamSelected() { xtream += 1; },
    onM3uSelected() { m3u += 1; },
    onPairingSelected() { pairing += 1; },
    onBack() {},
  };
  const view = new firstRun.FirstRunView(asDocument(document), callbacks);

  view.show({ kind: 'empty' });
  const pairingButton = document.getElementById('first-run-pairing');
  assert.ok(pairingButton);
  assert.equal(pairingButton.children[0]?.textContent, 'Telefonla Ekle');
  assert.equal(pairingButton.children[1]?.textContent, 'Telefonunuzdan güvenli QR eşleştirmesi ile sağlayıcı ekleyin.');
  assert.deepEqual({ xtream, m3u, pairing }, { xtream: 0, m3u: 0, pairing: 0 });

  view.handleAction('right');
  assert.equal(document.activeElement?.id, 'first-run-m3u');
  view.handleAction('right');
  assert.equal(document.activeElement?.id, 'first-run-pairing');
  assert.deepEqual({ xtream, m3u, pairing }, { xtream: 0, m3u: 0, pairing: 0 });

  view.handleAction('select');
  assert.deepEqual({ xtream, m3u, pairing }, { xtream: 0, m3u: 0, pairing: 1 });
  view.handleAction('down');
  assert.equal(document.activeElement?.id, 'first-run-back');
  view.handleAction('up');
  assert.equal(document.activeElement?.id, 'first-run-pairing');
});
