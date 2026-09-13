import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  decodePairingPhoneFragment,
  isPairingPhoneRoute,
} from '../src/pairing/phone-browser-entry.js';

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
