import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingPhoneController, type PairingPhoneBootstrapV1 } from '../src/pairing/phone-controller.js';
import type { PairingCiphertextV1 } from '../src/pairing/crypto.js';
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

test('PAIR-WEB sends only serialized PAIR-C ciphertext to relay and clears secrets after success', async () => {
  const relayRequests: Array<{ sessionId: string; ciphertext: string }> = [];
  let plaintext: Uint8Array | null = null;
  const controller = new PairingPhoneController(validBootstrap, {
    crypto: {
      async encryptForTv(_key, bytes) {
        plaintext = bytes;
        return envelope;
      },
    },
    relay: { async putCiphertext(request) { relayRequests.push(request); } },
    nowMs: () => 100,
  });
  controller.chooseProvider('xtream');
  controller.updateXtream({
    serverUrl: ' https://iptv.example.invalid ',
    username: ' user ',
    password: ' secret ',
  });
  await controller.submit();

  assert.ok(plaintext);
  assert.equal(relayRequests.length, 1);
  assert.deepEqual(relayRequests[0], {
    sessionId: 'session-1',
    ciphertext: JSON.stringify(envelope),
  });
  assert.doesNotMatch(relayRequests[0]!.ciphertext, /iptv|user|secret/);
  assert.deepEqual(controller.state(), { kind: 'success' });
  controller.chooseProvider('xtream');
  assert.deepEqual(controller.state(), {
    kind: 'xtream',
    input: { serverUrl: '', username: '', password: '' },
    error: null,
  });
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

test('PAIR-WEB phone view renders accessible provider choice and form states without exposing bootstrap data', async () => {
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
  assert.doesNotMatch(document.body.textContent, /session-1|relay\.example|\"x\"/);

  await document.getElementById('pairing-phone-xtream')?.dispatch('click');
  assert.equal(document.getElementById('pairing-phone-password')?.type, 'password');
  assert.ok(document.getElementById('pairing-phone-submit'));
  assert.ok(document.getElementById('pairing-phone-back'));
});
