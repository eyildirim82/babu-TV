import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE_URL = new URL('../src/app/browser-app-dependencies.ts', import.meta.url);

function source(): string {
  return readFileSync(SOURCE_URL, 'utf8');
}

test('PAIR-I-WIRE browser pairing stays optional and keeps keyboard onboarding available', () => {
  const text = source();

  assert.match(text, /pairing\?:\s*\{\s*relayBaseUrl: string;\s*phoneBaseUrl: string;\s*relayTimeoutMs: number;\s*pollIntervalMs: number;\s*\};/s);
  assert.match(text, /pairing:\s*input\.pairing\s*\?\s*\{/s);
  assert.match(text, /:\s*undefined,/s);
  assert.match(text, /onboarding:\s*\{\s*connectXtream:/s);
  assert.match(text, /connectM3u:/s);
});

test('PAIR-I-WIRE browser pairing composes the existing relay, core, and onboarding authorities', () => {
  const text = source();

  assert.match(text, /import \{ FetchPairingRelayTransport \} from '\.\.\/pairing\/browser-relay-transport\.js';/);
  assert.match(text, /import \{ PairingRelayClient \} from '\.\.\/pairing\/relay-client\.js';/);
  assert.match(text, /import \{ createTvPairingCore \} from '\.\.\/pairing\/create-tv-pairing-core\.js';/);
  assert.match(text, /import \{ PairingTvView \} from '\.\.\/pairing\/tv-view\.js';/);
  assert.match(text, /const transport = new FetchPairingRelayTransport\(input\.fetchImpl\);/);
  assert.match(text, /new PairingRelayClient\(\s*input\.pairing\.relayBaseUrl,\s*transport,\s*input\.pairing\.relayTimeoutMs,\s*\)/s);
  assert.match(text, /createTvPairingCore\(\{\s*relay,\s*relayBaseUrl: input\.pairing\.relayBaseUrl,\s*onboarding:\s*\{/s);
  assert.match(text, /connectXtream:\s*\(entry\)\s*=>\s*xtreamOnboarding\.connect\(entry\)/);
  assert.match(text, /connectM3u:\s*\(entry\)\s*=>\s*m3uOnboarding\.connect\(entry\)/);
});

test('PAIR-I-WIRE QR rendering is local with the exact approved qrcode options', () => {
  const text = source();

  assert.match(text, /from 'qrcode';/);
  assert.match(text, /QRCode\.toDataURL\(\s*value,\s*\{\s*errorCorrectionLevel: 'M',\s*margin: 2,\s*width: 360,\s*\}\s*\)/s);
  assert.match(text, /new PairingTvView\(/);
  assert.match(text, /phoneBaseUrl: input\.pairing\.phoneBaseUrl/);
  assert.match(text, /pollIntervalMs: input\.pairing\.pollIntervalMs/);
  assert.match(text, /import '\.\.\/ui\/pairing-tv\.css';/);
});

test('PAIR-I-WIRE browser pairing wiring introduces no direct credential store or plaintext relay path', () => {
  const text = source();
  const pairingStart = text.indexOf('pairing: input.pairing');
  assert.notEqual(pairingStart, -1);
  const pairingBlock = text.slice(pairingStart, text.indexOf('reentry:', pairingStart));

  assert.doesNotMatch(pairingBlock, /runtime\.credentials\.(save|remove)|credentials\.(save|remove)/);
  assert.doesNotMatch(pairingBlock, /createSession\([^)]*(username|password|playlistUrl|credential)/s);
  assert.doesNotMatch(pairingBlock, /poll\([^)]*(username|password|playlistUrl|credential)/s);
});
