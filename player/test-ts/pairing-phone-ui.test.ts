import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PairingPhoneController, type PairingPhoneBootstrapV1 } from '../src/pairing/phone-controller.js';
import { PairingCryptoError, type PairingCiphertextV1 } from '../src/pairing/crypto.js';
import { PairingRelayError } from '../src/pairing/relay-client.js';
import { PairingPhoneView } from '../src/pairing/phone-view.js';

const validBootstrap: PairingPhoneBootstrapV1 = {
  version: 1,
  sessionId: 'session-1',
  expiresAtMs: 1_000,
  tvPublicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
  relayBaseUrl: 'https://relay.example.invalid',
};

const envelope: PairingCiphertextV1 = {
  version: 1,
  algorithm: 'ECDH-P256+A256GCM',
  senderPublicKey: { kty: 'EC', crv: 'P-256', x: 'sx', y: 'sy' },
  iv: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'BBBB',
};

test('PAIR-WEB rejects malformed bootstrap before crypto or relay', async () => {
  let cryptoCalls = 0;
  let relayCalls = 0;
  const bad = {
    ...validBootstrap,
    version: 2,
    sessionId: '',
    relayBaseUrl: 'http://relay.example.invalid',
  } as unknown as PairingPhoneBootstrapV1;
  const controller = new PairingPhoneController(bad, {
    crypto: { async encryptForTv() { cryptoCalls += 1; return envelope; } },
    relay: { async putCiphertext() { relayCalls += 1; } },
    nowMs: () => 100,
  });
  controller.chooseProvider('m3u');
  controller.updateM3u({ playlistUrl: 'https://playlist.example.invalid/a.m3u8' });
  await controller.submit();
  assert.deepEqual(controller.state(), { kind: 'error', providerKind: 'm3u', code: 'INVALID_BOOTSTRAP' });
  assert.equal(cryptoCalls, 0);
  assert.equal(relayCalls, 0);
});

test('PAIR-WEB treats expiresAtMs equality as expired and makes no external call', async () => {
  let cryptoCalls = 0;
  let relayCalls = 0;
  const controller = new PairingPhoneController({ ...validBootstrap, expiresAtMs: 100 }, {
    crypto: { async encryptForTv() { cryptoCalls += 1; return envelope; } },
    relay: { async putCiphertext() { relayCalls += 1; } },
    nowMs: () => 100,
  });
  controller.chooseProvider('m3u');
  controller.updateM3u({ playlistUrl: 'https://playlist.example.invalid/a.m3u8' });
  await controller.submit();
  assert.deepEqual(controller.state(), { kind: 'expired' });
  assert.equal(cryptoCalls, 0);
  assert.equal(relayCalls, 0);
});

test('PAIR-WEB keeps Xtream required validation and M3U protocol validation local', async () => {
  let cryptoCalls = 0;
  let relayCalls = 0;
  const deps = {
    crypto: { async encryptForTv() { cryptoCalls += 1; return envelope; } },
    relay: { async putCiphertext() { relayCalls += 1; } },
    nowMs: () => 100,
  };

  const xtream = new PairingPhoneController(validBootstrap, deps);
  xtream.chooseProvider('xtream');
  xtream.updateXtream({ serverUrl: ' ', username: ' user ', password: ' secret ' });
  await xtream.submit();
  assert.deepEqual(xtream.state(), {
    kind: 'xtream',
    input: { serverUrl: ' ', username: ' user ', password: ' secret ' },
    error: 'REQUIRED',
  });

  const m3u = new PairingPhoneController(validBootstrap, deps);
  m3u.chooseProvider('m3u');
  m3u.updateM3u({ playlistUrl: 'ftp://playlist.example.invalid/a.m3u8' });
  await m3u.submit();
  const m3uState = m3u.state();
  assert.equal(m3uState.kind, 'm3u');
  if (m3uState.kind !== 'm3u') throw new Error('Expected M3U validation state.');
  assert.equal(m3uState.error, 'UNSUPPORTED_PROTOCOL');
  assert.equal(cryptoCalls, 0);
  assert.equal(relayCalls, 0);
});

test('PAIR-WEB sends only serialized PAIR-C ciphertext to relay and clears secrets after success', async () => {
  const relayRequests: Array<{ sessionId: string; ciphertext: string }> = [];
  let plaintext: Uint8Array | null = null;
  const controller = new PairingPhoneController(validBootstrap, {
    crypto: { async encryptForTv(_key, bytes) { plaintext = bytes; return envelope; } },
    relay: { async putCiphertext(request) { relayRequests.push(request); } },
    nowMs: () => 100,
  });
  controller.chooseProvider('xtream');
  controller.updateXtream({ serverUrl: ' https://iptv.example.invalid ', username: ' user ', password: ' secret ' });
  await controller.submit();

  assert.ok(plaintext);
  assert.match(new TextDecoder().decode(plaintext), /https:\/\/iptv\.example\.invalid/);
  assert.deepEqual(relayRequests, [{ sessionId: 'session-1', ciphertext: JSON.stringify(envelope) }]);
  assert.doesNotMatch(relayRequests[0]!.ciphertext, /iptv|user|secret/);
  assert.deepEqual(controller.state(), { kind: 'success' });
  controller.chooseProvider('xtream');
  assert.deepEqual(controller.state(), {
    kind: 'xtream',
    input: { serverUrl: '', username: '', password: '' },
    error: null,
  });
});

test('PAIR-WEB maps crypto and relay failures to sanitized codes and preserves retry input', async () => {
  const invalidKey = new PairingPhoneController(validBootstrap, {
    crypto: { async encryptForTv() { throw new PairingCryptoError('INVALID_KEY'); } },
    relay: { async putCiphertext() { throw new Error('unexpected'); } },
    nowMs: () => 100,
  });
  invalidKey.chooseProvider('xtream');
  invalidKey.updateXtream({ serverUrl: 'https://iptv.example.invalid', username: 'user', password: 'secret' });
  await invalidKey.submit();
  assert.deepEqual(invalidKey.state(), { kind: 'error', providerKind: 'xtream', code: 'INVALID_TV_KEY' });

  const cryptoUnavailable = new PairingPhoneController(validBootstrap, {
    crypto: { async encryptForTv() { throw new Error('native secret failure'); } },
    relay: { async putCiphertext() {} },
    nowMs: () => 100,
  });
  cryptoUnavailable.chooseProvider('m3u');
  cryptoUnavailable.updateM3u({ playlistUrl: 'https://playlist.example.invalid/a.m3u8' });
  await cryptoUnavailable.submit();
  assert.deepEqual(cryptoUnavailable.state(), { kind: 'error', providerKind: 'm3u', code: 'CRYPTO_UNAVAILABLE' });

  let relayAttempts = 0;
  const network = new PairingPhoneController(validBootstrap, {
    crypto: { async encryptForTv() { return envelope; } },
    relay: {
      async putCiphertext() {
        relayAttempts += 1;
        if (relayAttempts === 1) throw new PairingRelayError('NETWORK');
      },
    },
    nowMs: () => 100,
  });
  network.chooseProvider('m3u');
  network.updateM3u({ playlistUrl: 'https://playlist.example.invalid/a.m3u8' });
  await network.submit();
  assert.deepEqual(network.state(), { kind: 'error', providerKind: 'm3u', code: 'NETWORK' });
  network.chooseProvider('m3u');
  assert.deepEqual(network.state(), {
    kind: 'm3u',
    input: { playlistUrl: 'https://playlist.example.invalid/a.m3u8' },
    error: null,
  });
  await network.submit();
  assert.deepEqual(network.state(), { kind: 'success' });
});

test('PAIR-WEB suppresses duplicate submit while encryption is pending', async () => {
  let cryptoCalls = 0;
  let relayCalls = 0;
  let release!: (value: PairingCiphertextV1) => void;
  const pending = new Promise<PairingCiphertextV1>((resolve) => { release = resolve; });
  const controller = new PairingPhoneController(validBootstrap, {
    crypto: { async encryptForTv() { cryptoCalls += 1; return pending; } },
    relay: { async putCiphertext() { relayCalls += 1; } },
    nowMs: () => 100,
  });
  controller.chooseProvider('m3u');
  controller.updateM3u({ playlistUrl: 'https://playlist.example.invalid/a.m3u8' });
  const first = controller.submit();
  const second = controller.submit();
  assert.equal(cryptoCalls, 1);
  release(envelope);
  await Promise.all([first, second]);
  assert.equal(relayCalls, 1);
});

class FakeElement {
  id = '';
  tagName: string;
  textContent = '';
  className = '';
  type = '';
  value = '';
  disabled = false;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  attributes = new Map<string, string>();
  ownerDocument: FakeDocument;
  private listeners = new Map<string, Array<() => void | Promise<void>>>();

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
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(name: string, callback: () => void | Promise<void>) {
    const existing = this.listeners.get(name) ?? [];
    existing.push(callback);
    this.listeners.set(name, existing);
  }
  async dispatch(name: string) {
    for (const callback of this.listeners.get(name) ?? []) await callback();
  }
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

test('PAIR-WEB phone view is accessible and never renders bootstrap material', async () => {
  const controller = new PairingPhoneController(validBootstrap, {
    crypto: { async encryptForTv() { return envelope; } },
    relay: { async putCiphertext() {} },
    nowMs: () => 100,
  });
  const document = new FakeDocument();
  const view = new PairingPhoneView(asDocument(document), controller);

  view.show();
  assert.ok(document.getElementById('pairing-phone-xtream'));
  assert.ok(document.getElementById('pairing-phone-m3u'));
  assert.equal(document.getElementById('pairing-phone-status')?.getAttribute('aria-live'), 'polite');
  await document.getElementById('pairing-phone-xtream')?.dispatch('click');
  assert.equal(document.getElementById('pairing-phone-password')?.type, 'password');
  assert.ok(document.getElementById('pairing-phone-submit'));
  assert.ok(document.getElementById('pairing-phone-back'));
});

test('PAIR-WEB success removes credential fields and stylesheet uses focus/reduced-motion tokens', async () => {
  const controller = new PairingPhoneController(validBootstrap, {
    crypto: { async encryptForTv() { return envelope; } },
    relay: { async putCiphertext() {} },
    nowMs: () => 100,
  });
  const document = new FakeDocument();
  const view = new PairingPhoneView(asDocument(document), controller);
  view.show();
  await document.getElementById('pairing-phone-m3u')?.dispatch('click');
  const playlist = document.getElementById('pairing-phone-playlist-url');
  assert.ok(playlist);
  playlist.value = 'https://playlist.example.invalid/a.m3u8';
  await playlist.dispatch('input');
  await document.getElementById('pairing-phone-submit')?.dispatch('click');
  assert.equal(document.getElementById('pairing-phone-playlist-url'), null);
  assert.equal(document.getElementById('pairing-phone-submit'), null);
  assert.match(document.getElementById('pairing-phone-status')?.textContent ?? '', /güvenli şekilde gönderildi/);

  const css = await readFile(new URL('../src/ui/pairing-phone.css', import.meta.url), 'utf8');
  assert.match(css, /var\(--babu-bg\)/);
  assert.match(css, /var\(--babu-accent-strong\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('PAIR-WEB source introduces no browser persistence, URL-secret handling, or plaintext logging', async () => {
  const [controllerSource, viewSource] = await Promise.all([
    readFile(new URL('../src/pairing/phone-controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/pairing/phone-view.ts', import.meta.url), 'utf8'),
  ]);
  const source = `${controllerSource}\n${viewSource}`;
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|console\.(?:log|warn|error)|location\.(?:search|hash)/);
});
