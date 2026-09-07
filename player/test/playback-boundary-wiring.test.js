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
