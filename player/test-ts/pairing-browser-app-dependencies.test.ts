import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE_URL = new URL('../src/app/browser-app-dependencies.ts', import.meta.url);
const CORE_FACTORY_URL = new URL('../src/pairing/create-tv-pairing-core.ts', import.meta.url);

function source(): string {
  return readFileSync(SOURCE_URL, 'utf8');
}

test('PAIR-I-WIRE browser pairing stays optional and keeps keyboard onboarding available', () => {
  const text = source();

  assert.ok(text.includes('pairing?: {\n    relayBaseUrl: string;\n    phoneBaseUrl: string;\n    relayTimeoutMs: number;\n    pollIntervalMs: number;\n  };'));
  assert.ok(text.includes('const pairingConfig = input.pairing;'));
  assert.ok(text.includes('pairing: pairingConfig ? {'));
  assert.ok(text.includes('} : undefined,'));
  assert.ok(text.includes('onboarding: {\n            connectXtream:'));
  assert.ok(text.includes('connectM3u:'));
});

test('PAIR-I-WIRE browser pairing composes the frozen relay/core with existing onboarding authorities', () => {
  const text = source();
  const factoryText = readFileSync(CORE_FACTORY_URL, 'utf8');

  assert.ok(text.includes("import { FetchPairingRelayTransport } from '../pairing/fetch-relay-transport.js';"));
  assert.ok(text.includes("import { PairingRelayClient } from '../pairing/relay-client.js';"));
  assert.ok(text.includes("import { createTvPairingCore } from '../pairing/create-tv-pairing-core.js';"));
  assert.ok(text.includes("import { PairingTvView } from '../pairing/tv-view.js';"));
  assert.ok(text.includes('const transport = new FetchPairingRelayTransport(input.fetchImpl);'));
  assert.ok(text.includes('const relay = new PairingRelayClient(\n          pairingConfig.relayBaseUrl,\n          transport,\n          pairingConfig.relayTimeoutMs,\n        );'));
  assert.ok(text.includes('const pairingCore = createTvPairingCore({\n          relay,\n          relayBaseUrl: pairingConfig.relayBaseUrl,'));
  assert.ok(text.includes('connectXtream: (entry) => xtreamOnboarding.connect(entry)'));
  assert.ok(text.includes('connectM3u: (entry) => m3uOnboarding.connect(entry)'));

  assert.ok(factoryText.includes("import type { PairingRelayClient } from './relay-client.js';"));
  assert.ok(factoryText.includes('relay: input.relay'));
});

test('PAIR-I-WIRE QR rendering is local with the exact approved qrcode options', () => {
  const text = source();

  assert.ok(text.includes("from 'qrcode';"));
  assert.ok(text.includes("errorCorrectionLevel: 'M',\n              margin: 2,\n              width: 360,"));
  assert.ok(text.includes('new PairingTvView('));
  assert.ok(text.includes('phoneBaseUrl: pairingConfig.phoneBaseUrl'));
  assert.ok(text.includes('pollIntervalMs: pairingConfig.pollIntervalMs'));
  assert.ok(text.includes("import '../ui/pairing-tv.css';"));
});

test('PAIR-I-WIRE browser pairing wiring introduces no direct credential store or plaintext relay path', () => {
  const text = source();
  const pairingStart = text.indexOf('pairing: pairingConfig');
  assert.notEqual(pairingStart, -1);
  const pairingEnd = text.indexOf('reentry:', pairingStart);
  assert.notEqual(pairingEnd, -1);
  const pairingBlock = text.slice(pairingStart, pairingEnd);

  assert.doesNotMatch(pairingBlock, /runtime\.credentials\.(save|remove)|credentials\.(save|remove)/);
  assert.equal(pairingBlock.includes('username'), false);
  assert.equal(pairingBlock.includes('password'), false);
  assert.equal(pairingBlock.includes('playlistUrl'), false);
  assert.equal(pairingBlock.includes('credential'), false);
});
