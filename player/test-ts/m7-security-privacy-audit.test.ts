import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeUrlForLog } from '../src/logging/sanitize.js';
import { createPairingPhoneUrl } from '../src/pairing/bootstrap-link.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const playerDir = resolve(testDir, '..');

const USER = 'm7-user';
const PASSWORD = 'm7-password-DO-NOT-LOG';
const TOKEN = 'm7-token-DO-NOT-LOG';
const PROVIDER_URL = `https://${USER}:${PASSWORD}@example.invalid/player_api.php?username=${USER}&password=${PASSWORD}&token=${TOKEN}`;
const STREAM_URL = `https://stream.example.invalid/live/${USER}/${PASSWORD}/42.ts?token=${TOKEN}`;

function assertNoCanary(value: string): void {
  assert.equal(value.includes(USER), false);
  assert.equal(value.includes(PASSWORD), false);
  assert.equal(value.includes(TOKEN), false);
}

void test('M7 SEC URL sanitizer removes user-info, query and Xtream path credentials', () => {
  assertNoCanary(sanitizeUrlForLog(PROVIDER_URL));
  assertNoCanary(sanitizeUrlForLog(STREAM_URL));
});

void test('M7 SEC URL sanitizer removes secret-bearing fragments', () => {
  const sanitized = sanitizeUrlForLog(`https://example.invalid/watch#token=${TOKEN}&password=${PASSWORD}`);
  assertNoCanary(sanitized);
});

void test('M7 SEC pairing bootstrap link contains public bootstrap material only', () => {
  const phoneUrl = createPairingPhoneUrl('https://phone.example.invalid/?discard=1#discard', {
    version: 1,
    sessionId: 'session-m7-synthetic',
    expiresAtMs: 1_900_000_000_000,
    tvPublicKey: {
      kty: 'EC',
      crv: 'P-256',
      x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      ext: true,
    },
    relayBaseUrl: 'https://relay.example.invalid/',
  });

  assert.match(phoneUrl, /^https:\/\/phone\.example\.invalid\/#pairing=/);
  assertNoCanary(phoneUrl);
});

void test('M7 SEC legacy Settings does not persist arbitrary M3U credential URLs in localStorage', () => {
  const config = readFileSync(resolve(playerDir, 'src/config.js'), 'utf8');
  const settings = readFileSync(resolve(playerDir, 'src/settings.js'), 'utf8');
  const storesWholeSettings = /localStorage\.setItem\(SETTINGS_KEY,\s*JSON\.stringify\(merged\)\)/.test(config);
  const acceptsArbitraryPlaylistUrl = /playlists\.push\(\{\s*name:[^}]*\burl\s*\}\)/s.test(settings)
    || /playlists\[editIndex\]\s*=\s*\{\s*name:[^}]*\burl\s*\}/s.test(settings);

  assert.equal(
    storesWholeSettings && acceptsArbitraryPlaylistUrl,
    false,
    'legacy Settings still serializes arbitrary playlist URLs into ordinary localStorage',
  );
});
