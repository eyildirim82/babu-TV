import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainUrl = new URL('../src/main.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

void test('main starts M3 before the inherited legacy remote and playlist path', async () => {
  const source = await readFile(mainUrl, 'utf8');
  const m3Start = source.indexOf('await tryStartM3LiveTv()');
  const legacyRemote = source.indexOf('remote.init(handleRemoteAction)');
  const legacyPlaylist = source.indexOf('settings.getPlaylistUrl()');

  assert.notEqual(m3Start, -1);
  assert.notEqual(legacyRemote, -1);
  assert.notEqual(legacyPlaylist, -1);
  assert.ok(m3Start < legacyRemote);
  assert.ok(m3Start < legacyPlaylist);
  assert.match(source, /if \(await tryStartM3LiveTv\(\)\) \{\s*return;\s*\}/);
});

void test('M3 remote path uses digit mode and gates numeric key registration by capability', async () => {
  const source = await readFile(mainUrl, 'utf8');

  assert.match(source, /remote\.init\(handleM3RemoteAction, \{ numericMode: 'digits' \}\)/);
  assert.match(source, /platform\.capabilities\(\)\.numericKeys/);
  assert.match(source, /platform\.registerOptionalKeys\(M3_NUMERIC_TIZEN_KEYS\)/);
  assert.match(source, /case 'digit':[\s\S]*type: 'DIGIT'/);
  assert.match(source, /channelUp: 'CHANNEL_UP'/);
  assert.match(source, /channelDown: 'CHANNEL_DOWN'/);
});

void test('M3 startup keeps inherited legacy initialization available as fallback', async () => {
  const source = await readFile(mainUrl, 'utf8');

  assert.match(source, /remote\.init\(handleRemoteAction\)/);
  assert.match(source, /platform\.registerOptionalKeys\(LEGACY_OPTIONAL_TIZEN_KEYS\)/);
  assert.match(source, /ui\.showConfirmDialog\('Exit the app\?'/);
});

void test('index exposes dedicated M3 status and numeric nodes', async () => {
  const html = await readFile(indexUrl, 'utf8');

  assert.match(html, /id="live-tv-status"/);
  assert.match(html, /id="numeric-zap"/);
});
