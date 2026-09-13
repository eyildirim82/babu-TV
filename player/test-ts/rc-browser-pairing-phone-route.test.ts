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

test('RC-BROWSER main starts phone pairing route before TV/player boot', async () => {
  const mainUrl = new URL('../src/main.js', import.meta.url);
  const source = await readFile(mainUrl, 'utf8');

  assert.match(
    source,
    /import \{ tryStartPairingPhoneBrowserRoute \} from '\.\/pairing\/phone-browser-entry\.ts';/,
  );
  assert.match(source, /import '\.\/ui\/pairing-phone\.css';/);

  const initStart = source.indexOf('async function init()');
  const phoneRoute = source.indexOf('tryStartPairingPhoneBrowserRoute', initStart);
  const playerBoot = source.indexOf('player.initPlayer', initStart);
  assert.notEqual(initStart, -1);
  assert.notEqual(phoneRoute, -1);
  assert.notEqual(playerBoot, -1);
  assert.ok(phoneRoute < playerBoot, 'phone route must short-circuit before TV/player boot');
});
