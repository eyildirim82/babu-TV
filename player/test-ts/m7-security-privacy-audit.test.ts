import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeUrlForLog } from '../src/logging/sanitize.js';
import { createPairingPhoneUrl } from '../src/pairing/bootstrap-link.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const playerDir = resolve(testDir, '..');

const CANARY_A = 'audit-a';
const CANARY_B = 'audit-b';
const CANARY_C = 'audit-c';
const PROVIDER_URL = `https://${CANARY_A}:${CANARY_B}@example.invalid/player_api.php?username=${CANARY_A}&password=${CANARY_B}&token=${CANARY_C}&quality=hd`;
const STREAM_URL = `https://stream.example.invalid/live/${CANARY_A}/${CANARY_B}/42.ts?token=${CANARY_C}&quality=hd`;

function assertNoCanary(value: string): void {
  assert.equal(value.includes(CANARY_A), false);
  assert.equal(value.includes(CANARY_B), false);
  assert.equal(value.includes(CANARY_C), false);
}

void test('M7 SEC URL sanitizer removes user-info, sensitive query values and Xtream path credentials', () => {
  const provider = sanitizeUrlForLog(PROVIDER_URL);
  const stream = sanitizeUrlForLog(STREAM_URL);

  assertNoCanary(provider);
  assertNoCanary(stream);
  assert.match(provider, /^https:\/\/example\.invalid\/player_api\.php\?/);
  assert.match(provider, /quality=hd/);
  assert.match(stream, /^https:\/\/stream\.example\.invalid\/live\/\[REDACTED\]\/\[REDACTED\]\/42\.ts\?/);
  assert.match(stream, /quality=hd/);
});

void test('M7 SEC URL sanitizer preserves ordinary safe URL diagnostics', () => {
  assert.equal(
    sanitizeUrlForLog('https://example.invalid/guide/channel-42?quality=hd&lang=tr'),
    'https://example.invalid/guide/channel-42?quality=hd&lang=tr',
  );
});

void test('M7 SEC URL sanitizer keeps malformed non-URL fallback behavior unchanged', () => {
  assert.equal(sanitizeUrlForLog('not-a-url m7-safe-diagnostic'), 'not-a-url m7-safe-diagnostic');
});

void test('M7 SEC pairing bootstrap link contains public bootstrap material only', () => {
  const phoneUrl = createPairingPhoneUrl('https://phone.example.invalid/?discard=1#discard', {
    version: 1,
    sessionId: 'session-m7-synthetic',
    expiresAtMs: 1_900_000_000_000,
    tvPublicKey: {
      kty: 'EC',
      crv: 'P-256',
      x: 'synthetic-public-x',
      y: 'synthetic-public-y',
      ext: true,
    },
    relayBaseUrl: 'https://relay.example.invalid/',
  });

  assert.match(phoneUrl, /^https:\/\/phone\.example\.invalid\/#pairing=/);
  assert.equal(phoneUrl.includes('discard=1'), false);
  assertNoCanary(phoneUrl);
});

void test('M7 SEC integrated main retains the accepted legacy M3U persistence hardening surface', () => {
  const config = readFileSync(resolve(playerDir, 'src/config.js'), 'utf8');
  const settings = readFileSync(resolve(playerDir, 'src/settings.js'), 'utf8');

  assert.match(config, /const LEGACY_SOURCE_KEYS = \[/);
  assert.match(config, /'playlistUrl'/);
  assert.match(config, /'playlists'/);
  assert.match(config, /'activePlaylistIndex'/);
  assert.match(config, /'channels'/);
  assert.match(config, /'channelsFetched'/);
  assert.match(config, /sanitizePersistedSettings/);
  assert.doesNotMatch(settings, /pl-add-url|pl-edit-url|playlist-url/);
  assert.doesNotMatch(settings, /saveSettings\(\{\s*playlists/);
  assert.match(settings, /settings-xtream-btn/);
});
