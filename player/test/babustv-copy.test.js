import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const copyUrl = new URL('../src/ui/copy.js', import.meta.url);
const declarationUrl = new URL('../src/ui/copy.d.ts', import.meta.url);
const settingsUrl = new URL('../src/settings.js', import.meta.url);
const playerUrl = new URL('../src/player.js', import.meta.url);
const mainUrl = new URL('../src/main.js', import.meta.url);

const EXPECTED_COPY = {
  loading: 'Yükleniyor…',
  preparing: 'Hazırlanıyor…',
  channels: 'Kanallar',
  settings: 'Ayarlar',
  quality: 'Kalite',
  actions: 'İşlemler',
  reloadStream: 'Yayını yeniden yükle',
  refreshChannels: 'Kanalları yenile',
  noChannel: 'Kanal seçilmedi',
  buffering: 'Arabelleğe alınıyor',
  streamOpening: 'Yayın açılıyor…',
  recovering: 'Yayın yeniden deneniyor…',
  streamFailed: 'Yayın açılamadı',
  cancel: 'İptal',
  confirm: 'Onayla',
  close: 'Kapat',
};

const EXPECTED_DECLARATION = `export declare const UI_COPY: Readonly<{
  loading: string;
  preparing: string;
  channels: string;
  settings: string;
  quality: string;
  actions: string;
  reloadStream: string;
  refreshChannels: string;
  noChannel: string;
  buffering: string;
  streamOpening: string;
  recovering: string;
  streamFailed: string;
  cancel: string;
  confirm: string;
  close: string;
}>;`;

async function assertFileExists(url, label) {
  try {
    await access(url);
  } catch {
    assert.fail(`${label} must exist`);
  }
}

void test('UI_COPY exposes the exact approved Turkish runtime contract', async () => {
  await assertFileExists(copyUrl, 'player/src/ui/copy.js');
  const { UI_COPY } = await import(copyUrl.href);

  assert.deepEqual(UI_COPY, EXPECTED_COPY);
  assert.equal(Object.isFrozen(UI_COPY), true);
  for (const value of Object.values(UI_COPY)) {
    assert.doesNotMatch(value, /EN[- ]?IPTV|IPTVPlayer|ENTV/i);
  }
});

void test('copy.d.ts matches the exact UI_COPY declaration shape', async () => {
  await assertFileExists(declarationUrl, 'player/src/ui/copy.d.ts');
  const source = await readFile(declarationUrl, 'utf8');
  assert.equal(source.trim(), EXPECTED_DECLARATION);
});

void test('settings runtime-generated labels are Turkish-first and use shared copy', async () => {
  const source = await readFile(settingsUrl, 'utf8');

  assert.match(source, /import \{ UI_COPY \} from '\.\/ui\/copy\.js';/);
  assert.match(source, /label: 'Kanal Kaynağı'/);
  assert.match(source, /label: 'Bağlantı'/);
  assert.match(source, /label: 'Oynatma'/);
  assert.match(source, /label: 'Hakkında'/);
  assert.match(source, /UI_COPY\.settings/);
  assert.match(source, /UI_COPY\.cancel/);
  assert.match(source, /BabuşTV/);

  for (const legacy of [
    "label: 'Channel Source'",
    "label: 'Connection'",
    "label: 'Playback'",
    "label: 'About'",
    'EN IPTV Player',
    '<div class="text">EN <span>IPTV</span></div>',
    'All settings are saved automatically',
    'Fetch Active',
    'Proxy URL saved',
  ]) {
    assert.equal(source.includes(legacy), false, `settings runtime copy still contains: ${legacy}`);
  }
});

void test('player user-visible recovery and error copy is Turkish-first without playback logic changes', async () => {
  const source = await readFile(playerUrl, 'utf8');

  assert.match(source, /import \{ UI_COPY \} from '\.\/ui\/copy\.js';/);
  assert.match(source, /UI_COPY\.recovering/);
  assert.match(source, /UI_COPY\.streamFailed/);

  for (const legacy of [
    'Connection lost. Trying again...',
    'Reloading channel...',
    'Something went wrong. Please try another channel.',
    'This channel could not play on your TV. Try another channel.',
    'This channel is protected and cannot play here. Try a different channel.',
  ]) {
    assert.equal(source.includes(legacy), false, `player runtime copy still contains: ${legacy}`);
  }
});

void test('main runtime-generated action/status/error/dialog copy is Turkish-first', async () => {
  const source = await readFile(mainUrl, 'utf8');

  assert.match(source, /import \{ UI_COPY \} from '\.\/ui\/copy\.js';/);
  assert.match(source, /UI_COPY\.loading/);
  assert.match(source, /UI_COPY\.preparing/);
  assert.match(source, /UI_COPY\.refreshChannels/);
  assert.match(source, /UI_COPY\.noChannel/);

  for (const legacy of [
    "showProgress('Reloading')",
    "showProgress('Refreshing')",
    "textContent = 'No channels'",
    "textContent = 'Open Settings to add a playlist'",
    "ui.showConfirmDialog('Exit the app?'",
    '<h2>App cannot start</h2>',
    'Update available:',
    'Reinstall via Apps2Samsung to update.',
    "showBootSplash('Loading...')",
  ]) {
    assert.equal(source.includes(legacy), false, `main runtime copy still contains: ${legacy}`);
  }
});
