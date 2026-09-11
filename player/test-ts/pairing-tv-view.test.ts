import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ProviderId } from '../src/domain/models.js';
import type { PairingTvBootstrapV1, PairingTvPollResult } from '../src/pairing/tv-controller.js';
import { PairingTvView } from '../src/pairing/tv-view.js';

const bootstrap: PairingTvBootstrapV1 = {
  version: 1,
  sessionId: 'public-session',
  expiresAtMs: 1_800_000_000_000,
  tvPublicKey: { kty: 'EC', crv: 'P-256', x: 'public-x', y: 'public-y' },
  relayBaseUrl: 'https://relay.example.invalid',
};

class FakeElement {
  id = '';
  className = '';
  textContent = '';
  src = '';
  alt = '';
  type = '';
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  attributes = new Map<string, string>();
  private listeners = new Map<string, Array<() => void | Promise<void>>>();

  constructor(readonly tagName: string) {}
  appendChild(child: FakeElement) { child.parentElement = this; this.children.push(child); return child; }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(name: string, listener: () => void | Promise<void>) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  async dispatch(name: string) {
    for (const listener of this.listeners.get(name) ?? []) await listener();
  }
}

class FakeDocument {
  body = new FakeElement('BODY');
  createElement(tag: string) { return new FakeElement(tag.toUpperCase()); }
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

class FakeScheduler {
  private nextId = 1;
  jobs = new Map<number, () => void | Promise<void>>();
  setTimeout(callback: () => void | Promise<void>, _delayMs: number): number {
    const id = this.nextId++;
    this.jobs.set(id, callback);
    return id;
  }
  clearTimeout(id: unknown): void { this.jobs.delete(id as number); }
  async runNext(): Promise<void> {
    const entry = this.jobs.entries().next().value as [number, () => void | Promise<void>] | undefined;
    assert.ok(entry, 'expected scheduled poll');
    this.jobs.delete(entry[0]);
    await entry[1]();
  }
}

function asDocument(document: FakeDocument): Document { return document as unknown as Document; }

function snapshot(node: FakeElement): unknown {
  return {
    id: node.id,
    className: node.className,
    textContent: node.textContent,
    src: node.src,
    alt: node.alt,
    type: node.type,
    attributes: [...node.attributes.entries()],
    children: node.children.map(snapshot),
  };
}

function createCore(results: PairingTvPollResult[]) {
  let startCalls = 0;
  let pollCalls = 0;
  return {
    core: {
      async start() { startCalls += 1; return bootstrap; },
      async poll(sessionId: string) {
        pollCalls += 1;
        assert.equal(sessionId, bootstrap.sessionId);
        return results.shift() ?? { status: 'pending' as const };
      },
    },
    counts: () => ({ startCalls, pollCalls }),
  };
}

test('PAIR-I-WIRE TV view starts once, renders local QR from public fragment, and owns one poll timer', async () => {
  const document = new FakeDocument();
  const scheduler = new FakeScheduler();
  const { core, counts } = createCore([]);
  const qrValues: string[] = [];
  const view = new PairingTvView(
    asDocument(document),
    core,
    { onBack() {}, onCompleted() {} },
    { phoneBaseUrl: 'https://phone.example.invalid/pair', pollIntervalMs: 25 },
    { async toDataUrl(value) { qrValues.push(value); return 'data:image/png;base64,public-qr'; } },
    scheduler,
  );

  await view.show();
  await view.show();

  assert.deepEqual(counts(), { startCalls: 1, pollCalls: 0 });
  assert.equal(qrValues.length, 1);
  const parsed = new URL(qrValues[0]!);
  assert.equal(parsed.search, '');
  assert.match(parsed.hash, /^#pairing=[A-Za-z0-9_-]+$/);
  assert.equal(document.getElementById('pairing-tv-qr')?.src, 'data:image/png;base64,public-qr');
  assert.equal(scheduler.jobs.size, 1);
  const surface = JSON.stringify(snapshot(document.body));
  for (const forbidden of ['password', 'username', 'playlistUrl', 'serverUrl', 'privateKey', 'data-credential']) {
    assert.equal(surface.includes(forbidden), false, `forbidden TV surface value: ${forbidden}`);
  }
});

test('PAIR-I-WIRE pending reschedules exactly one poll and completion stops + calls once', async () => {
  const document = new FakeDocument();
  const scheduler = new FakeScheduler();
  const providerId = 'provider-paired' as ProviderId;
  const { core, counts } = createCore([{ status: 'pending' }, { status: 'completed', providerId }]);
  const completed: ProviderId[] = [];
  const view = new PairingTvView(
    asDocument(document), core,
    { onBack() {}, onCompleted(id) { completed.push(id); } },
    { phoneBaseUrl: 'https://phone.example.invalid', pollIntervalMs: 10 },
    { async toDataUrl() { return 'data:image/png;base64,qr'; } }, scheduler,
  );

  await view.show();
  assert.equal(scheduler.jobs.size, 1);
  await scheduler.runNext();
  assert.equal(counts().pollCalls, 1);
  assert.equal(scheduler.jobs.size, 1);
  await scheduler.runNext();
  assert.equal(counts().pollCalls, 2);
  assert.equal(scheduler.jobs.size, 0);
  assert.deepEqual(completed, [providerId]);
  assert.match(document.getElementById('pairing-tv-status')?.textContent ?? '', /tamamlandı/i);
});

test('PAIR-I-WIRE Back and hide cancel polling; terminal states do not reschedule', async () => {
  let backCalls = 0;
  for (const terminal of [
    { status: 'expired' as const },
    { status: 'consumed' as const },
    { status: 'error' as const, code: 'UNAVAILABLE' as const },
  ]) {
    const document = new FakeDocument();
    const scheduler = new FakeScheduler();
    const { core } = createCore([terminal]);
    const view = new PairingTvView(
      asDocument(document), core,
      { onBack() { backCalls += 1; }, onCompleted() {} },
      { phoneBaseUrl: 'https://phone.example.invalid', pollIntervalMs: 10 },
      { async toDataUrl() { return 'data:image/png;base64,qr'; } }, scheduler,
    );
    await view.show();
    await scheduler.runNext();
    assert.equal(scheduler.jobs.size, 0);
    assert.ok(document.getElementById('pairing-tv-status')?.textContent);
    view.hide();
    assert.equal(document.getElementById('pairing-tv-root'), null);
  }

  const document = new FakeDocument();
  const scheduler = new FakeScheduler();
  const { core } = createCore([]);
  const view = new PairingTvView(
    asDocument(document), core,
    { onBack() { backCalls += 1; }, onCompleted() {} },
    { phoneBaseUrl: 'https://phone.example.invalid', pollIntervalMs: 10 },
    { async toDataUrl() { return 'data:image/png;base64,qr'; } }, scheduler,
  );
  await view.show();
  view.handleBack();
  assert.equal(scheduler.jobs.size, 0);
  assert.equal(document.getElementById('pairing-tv-root'), null);
  assert.equal(backCalls, 1);
});

test('PAIR-I-WIRE TV pairing CSS keeps focus and reduced-motion affordances', async () => {
  const css = await readFile(new URL('../src/ui/pairing-tv.css', import.meta.url), 'utf8');
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /var\(--babu-bg\)/);
});
