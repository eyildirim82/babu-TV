import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainUrl = new URL('../src/main.js', import.meta.url);
const playerUrl = new URL('../src/player.js', import.meta.url);

test('main routes playback calls through PlaybackService', async () => {
  const source = await readFile(mainUrl, 'utf8');

  assert.match(source, /createPlaybackService/);
  assert.match(source, /const player = createPlaybackService\(legacyPlayer\);/);
  assert.doesNotMatch(source, /import \* as player from '\.\/player\.js';/);
});

test('legacy player routes native calls through AvplayAdapter and exposes active engine', async () => {
  const source = await readFile(playerUrl, 'utf8');

  assert.match(source, /createAvplayAdapter/);
  assert.match(source, /const avplay = createAvplayAdapter\(legacyAvplay\);/);
  assert.doesNotMatch(source, /import \* as avplay from '\.\/avplay\.js';/);
  assert.match(source, /export function getPlaybackEngine\(\)/);
});

test('M3 Shaka attempt uses a no-fallback policy while legacy load keeps inherited recovery enabled', async () => {
  const source = await readFile(playerUrl, 'utf8');

  assert.match(source, /const LEGACY_PLAYBACK_POLICY = Object\.freeze\(\{[\s\S]*allowNativeFallback: true,[\s\S]*allowAutomaticRecovery: true,[\s\S]*allowAutoAdvance: true,[\s\S]*\}\);/);
  assert.match(source, /const M3_SHAKA_ATTEMPT_POLICY = Object\.freeze\(\{[\s\S]*allowNativeFallback: false,[\s\S]*allowAutomaticRecovery: false,[\s\S]*allowAutoAdvance: false,[\s\S]*\}\);/);
  assert.match(source, /export async function loadChannel\(channel\)[\s\S]*loadChannelWithPolicy\(channel, LEGACY_PLAYBACK_POLICY\)/);
  assert.match(source, /export async function playShakaAttempt\(channel\)[\s\S]*loadChannelWithPolicy\(channel, M3_SHAKA_ATTEMPT_POLICY(?:, attempt)?\)/);
  assert.match(source, /policy\.allowNativeFallback && avplayPreferredUrls\.has\(channel\.url\)/);
});
