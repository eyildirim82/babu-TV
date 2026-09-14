import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  decodePairingPhoneFragment,
  isPairingPhoneRoute,
  tryStartPairingPhoneBrowserRoute,
} from '../src/pairing/phone-browser-entry.js';

class RouteFakeElement {
  id = '';
  className = '';
  textContent = '';
  readonly children: RouteFakeElement[] = [];

  constructor(readonly tagName: string, private readonly owner: RouteFakeDocument) {}

  appendChild(child: RouteFakeElement): RouteFakeElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(): void {
    this.children.length = 0;
  }

  setAttribute(): void {}

  remove(): void {
    const body = this.owner.body;
    if (body === null) return;
    const index = body.children.indexOf(this);
    if (index !== -1) body.children.splice(index, 1);
  }
}

class RouteFakeDocument {
  readyState: DocumentReadyState = 'loading';
  body: RouteFakeElement | null = null;
  private readonly readyListeners: Array<() => void> = [];

  createElement(tagName: string): RouteFakeElement {
    return new RouteFakeElement(tagName, this);
  }

  getElementById(id: string): RouteFakeElement | null {
    const visit = (element: RouteFakeElement): RouteFakeElement | null => {
      if (element.id === id) return element;
      for (const child of element.children) {
        const found = visit(child);
        if (found !== null) return found;
      }
      return null;
    };
    return this.body === null ? null : visit(this.body);
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'DOMContentLoaded') this.readyListeners.push(listener);
  }

  removeEventListener(): void {}

  finishParsing(): void {
    this.body = new RouteFakeElement('body', this);
    this.readyState = 'interactive';
    for (const listener of this.readyListeners.splice(0)) listener();
  }
}

function textOf(element: RouteFakeElement): string {
  return element.textContent + element.children.map(textOf).join('');
}

function encodeFragment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `#pairing=${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

const bootstrap = {
  version: 1,
  sessionId: 'session-public',
  expiresAtMs: 1_800_000_000_000,
  tvPublicKey: { kty: 'EC', crv: 'P-256', x: 'public-x', y: 'public-y' },
  relayBaseUrl: 'https://relay.example.invalid',
};

test('RC-BROWSER phone route decodes only the public #pairing fragment contract', () => {
  const hash = encodeFragment(bootstrap);
  assert.equal(isPairingPhoneRoute(hash), true);
  assert.deepEqual(decodePairingPhoneFragment(hash), bootstrap);

  assert.equal(isPairingPhoneRoute('#other=value'), false);
  assert.equal(decodePairingPhoneFragment('#other=value'), null);
  assert.equal(decodePairingPhoneFragment('#pairing=%%%'), null);
  assert.equal(decodePairingPhoneFragment(encodeFragment({ ...bootstrap, extra: 'forbidden' })), null);
});

test('RC-BROWSER browser entry starts phone pairing route before normal TV boot', async () => {
  const indexUrl = new URL('../index.html', import.meta.url);
  const entryUrl = new URL('../src/browser-entry.ts', import.meta.url);
  const [indexSource, entrySource] = await Promise.all([
    readFile(indexUrl, 'utf8'),
    readFile(entryUrl, 'utf8'),
  ]);

  assert.match(indexSource, /<script type="module" src="\/src\/browser-entry\.ts"><\/script>/);
  assert.match(
    entrySource,
    /import \{ tryStartPairingPhoneBrowserRoute \} from '\.\/pairing\/phone-browser-entry\.js';/,
  );
  assert.match(entrySource, /import '\.\/ui\/pairing-phone\.css';/);
  assert.match(entrySource, /hash: window\.location\.hash/);

  const phoneRoute = entrySource.indexOf('tryStartPairingPhoneBrowserRoute({');
  const normalBoot = entrySource.indexOf("import('./main.js')");
  assert.notEqual(phoneRoute, -1);
  assert.notEqual(normalBoot, -1);
  assert.ok(phoneRoute < normalBoot, 'phone route must short-circuit before normal TV boot');
  assert.match(entrySource, /if \(pairingPhoneStarted\) return;/);
});

test('RC-BROWSER phone route waits for the document body when the built entry runs from <head>', async () => {
  // The Tizen build strips type="module", so the entry script executes while
  // <head> is still parsing and document.body is null.
  const document = new RouteFakeDocument();
  let fetchCalls = 0;

  const started = tryStartPairingPhoneBrowserRoute({
    hash: '#pairing=%%%',
    document: document as unknown as Document,
    fetchImpl: (async () => {
      fetchCalls += 1;
      throw new Error('relay must not be used for an invalid bootstrap');
    }) as unknown as typeof fetch,
  });

  await new Promise((resolve) => setImmediate(resolve));
  document.finishParsing();

  assert.equal(await started, true);
  const page = document.getElementById('pairing-phone-page');
  assert.ok(page, 'phone pairing page must render once the body exists');
  assert.match(textOf(page), /Eşleştirme bağlantısı geçersiz/);
  assert.equal(fetchCalls, 0);
});

test('RC-BROWSER TV boot stays off the phone pairing route even when the IIFE build inlines main.js', async () => {
  // vite builds format "iife", which turns browser-entry's import('./main.js')
  // into an eagerly evaluated module. main.js must not auto-init on #pairing=.
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(mainSource, /import \{ isPairingPhoneRoute \} from '\.\/pairing\/phone-browser-entry\.ts';/);
  assert.match(
    mainSource,
    /if \(!isPairingPhoneRoute\(window\.location\.hash\)\) \{\s*if \(document\.readyState === 'loading'\) \{\s*document\.addEventListener\('DOMContentLoaded', init\);\s*\} else \{\s*init\(\);\s*\}\s*\}\s*$/,
  );
});
