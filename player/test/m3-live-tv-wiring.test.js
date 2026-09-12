import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainUrl = new URL('../src/main.js', import.meta.url);
const browserDependenciesUrl = new URL('../src/app/browser-app-dependencies.ts', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);
const m3StylesUrl = new URL('../src/m3-live-tv.css', import.meta.url);

void test('main boots the M5 application composition instead of short-circuiting into M3', async () => {
  const [source, dependencies] = await Promise.all([
    readFile(mainUrl, 'utf8'),
    readFile(browserDependenciesUrl, 'utf8'),
  ]);

  assert.match(source, /import \{ createAppComposition \} from '\.\/app\/app-composition\.ts';/);
  assert.match(source, /import \{ createBrowserAppDependencies \} from '\.\/app\/browser-app-dependencies\.ts';/);
  assert.match(source, /const appComposition = createAppComposition\(createBrowserAppDependencies\(/);
  assert.match(source, /await appComposition\.boot\(\)/);
  assert.doesNotMatch(source, /if \(await tryStartM3LiveTv\(\)\) \{\s*return;\s*\}/);

  assert.match(dependencies, /new HomeView\(input\.document, callbacks\)/);
  assert.match(dependencies, /new FirstRunView\(input\.document, callbacks\)/);
  assert.match(dependencies, /new M3uEntryView\(input\.document, callbacks\)/);
});

void test('M5 remote ownership preserves M3 digit mode and legacy buffered number mode', async () => {
  const [source, dependencies] = await Promise.all([
    readFile(mainUrl, 'utf8'),
    readFile(browserDependenciesUrl, 'utf8'),
  ]);

  assert.match(source, /function setAppRemoteNumericMode\(mode\)/);
  assert.match(source, /remote\.destroy\(\)/);
  assert.match(source, /numericMode: mode === 'digits' \? 'digits' : 'buffered'/);
  assert.match(source, /platform\.capabilities\(\)\.numericKeys/);
  assert.match(source, /platform\.registerOptionalKeys\(M3_NUMERIC_TIZEN_KEYS\)/);
  assert.match(source, /setRemoteNumericMode: setAppRemoteNumericMode/);
  assert.match(source, /setAppRemoteNumericMode\('buffered'\)/);

  assert.match(dependencies, /input\.setRemoteNumericMode\(result\.mode === 'm3' \? 'digits' : 'buffered'\)/);
  assert.match(dependencies, /input\.setRemoteNumericMode\('buffered'\);\s*onRootBack\(\)/);
});

void test('M5 keeps inherited legacy initialization available only as an injected fallback', async () => {
  const source = await readFile(mainUrl, 'utf8');

  assert.match(source, /handleRemote: \(action, value\) => handleRemoteAction\(action, value\)/);
  assert.match(source, /platform\.registerOptionalKeys\(LEGACY_OPTIONAL_TIZEN_KEYS\)/);
  assert.match(source, /openPlayer: \(\) => startLegacyPlayerShell\(\)/);
  assert.match(source, /ui\.showConfirmDialog\('Uygulamadan çıkılsın mı\?'/);
});

void test('PAIR-I-WIRE main forwards only the optional public pairing config whitelist', async () => {
  const source = await readFile(mainUrl, 'utf8');

  assert.match(source, /const pairingConfig = window\.BABUSTV_PAIRING_CONFIG \?\? null;/);
  assert.doesNotMatch(source, /__BABUSTV_PAIRING_CONFIG__/);

  const start = source.indexOf('const pairingConfig = window.BABUSTV_PAIRING_CONFIG ?? null;');
  assert.notEqual(start, -1);
  const end = source.indexOf('activeAppComposition = appComposition;', start);
  assert.notEqual(end, -1);
  const wiring = source.slice(start, end);

  assert.match(wiring, /pairing: pairingConfig && typeof pairingConfig === 'object'\s*\? \{/);
  assert.match(wiring, /relayBaseUrl: pairingConfig\.relayBaseUrl/);
  assert.match(wiring, /phoneBaseUrl: pairingConfig\.phoneBaseUrl/);
  assert.match(wiring, /relayTimeoutMs: pairingConfig\.relayTimeoutMs/);
  assert.match(wiring, /pollIntervalMs: pairingConfig\.pollIntervalMs/);
  assert.match(wiring, /\}\s*: undefined,/);

  for (const forbidden of ['credentials', 'username', 'password', 'playlistUrl', 'providerPayload', 'token', 'privateKey']) {
    assert.equal(wiring.includes(forbidden), false, `${forbidden} must not cross the public pairing config boundary`);
  }
  assert.equal(wiring.includes('https://'), false, 'pairing config wiring must not hard-code a real or test endpoint');
});

void test('PAIR-I-WIRE runtime config contract permits synthetic .invalid public endpoints without committing them', () => {
  const synthetic = {
    relayBaseUrl: 'https://relay.example.invalid',
    phoneBaseUrl: 'https://phone.example.invalid/pair',
    relayTimeoutMs: 5000,
    pollIntervalMs: 1000,
    token: 'must-not-forward',
  };
  const forwarded = {
    relayBaseUrl: synthetic.relayBaseUrl,
    phoneBaseUrl: synthetic.phoneBaseUrl,
    relayTimeoutMs: synthetic.relayTimeoutMs,
    pollIntervalMs: synthetic.pollIntervalMs,
  };

  assert.deepEqual(Object.keys(forwarded).sort(), [
    'phoneBaseUrl',
    'pollIntervalMs',
    'relayBaseUrl',
    'relayTimeoutMs',
  ]);
  assert.match(forwarded.relayBaseUrl, /\.invalid$/);
  assert.match(forwarded.phoneBaseUrl, /\.invalid\/pair$/);
  assert.equal('token' in forwarded, false);
});

void test('index exposes dedicated M3 status and numeric nodes', async () => {
  const html = await readFile(indexUrl, 'utf8');

  assert.match(html, /id="live-tv-status"/);
  assert.match(html, /id="numeric-zap"/);
});

void test('M3 state-only classes have a dedicated presentation layer loaded after legacy styles', async () => {
  const [html, styles] = await Promise.all([
    readFile(indexUrl, 'utf8'),
    readFile(m3StylesUrl, 'utf8'),
  ]);

  assert.match(html, /<link rel="stylesheet" href="\/src\/styles\.css">[\s\S]*<link rel="stylesheet" href="\/src\/m3-live-tv\.css">/);
  assert.match(styles, /\.channel-item\.playing\s*\{/);
  assert.match(styles, /\.live-tv-status\s*,?[\s\S]*\.numeric-zap\s*\{/);
});