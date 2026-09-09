import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { UI_COPY } from '../src/ui/copy.js';

const indexUrl = new URL('../index.html', import.meta.url);
const shellUrl = new URL('../src/ui/shell.css', import.meta.url);
const mainUrl = new URL('../src/main.js', import.meta.url);

const inheritedStaticLabels = [
  'IPTV',
  'EN IPTV',
  'Loading...',
  'Menu',
  'Quality',
  'Actions',
  'Settings',
  "What's New",
  'Got it',
  'Cancel',
  'Confirm',
];

void test('BabuşTV shell owns title, brand assets, and stylesheet order', async () => {
  const html = await readFile(indexUrl, 'utf8');

  assert.match(html, /<html lang="tr">/);
  assert.match(html, /<title>BabuşTV<\/title>/);
  assert.match(html, /\/brand\/babustv-wordmark\.svg/);
  assert.match(html, /\/brand\/babustv-boot\.svg/);
  assert.doesNotMatch(html, /<svg\b/i);

  const stylesheets = [
    '/src/ui/tokens.css',
    '/src/ui/theme.css',
    '/src/ui/primitives.css',
    '/src/styles.css',
    '/src/ui/shell.css',
    '/src/m3-live-tv.css',
  ];

  let previousIndex = -1;
  for (const href of stylesheets) {
    const currentIndex = html.indexOf(`href="${href}"`);
    assert.ok(currentIndex > previousIndex, `${href} must appear after the previous stylesheet`);
    previousIndex = currentIndex;
  }
});

void test('static shell copy is Turkish-first and inherited English/ENTV labels are absent', async () => {
  const html = await readFile(indexUrl, 'utf8');

  for (const label of inheritedStaticLabels) {
    assert.equal(html.includes(label), false, `legacy shell label remains: ${label}`);
  }

  for (const copy of [
    'BabuşTV',
    UI_COPY.loading,
    UI_COPY.preparing,
    UI_COPY.quality,
    UI_COPY.actions,
    UI_COPY.settings,
    UI_COPY.reloadStream,
    UI_COPY.refreshChannels,
    UI_COPY.noChannel,
    UI_COPY.buffering,
    UI_COPY.close,
    UI_COPY.cancel,
    UI_COPY.confirm,
    'Yenilikler',
  ]) {
    assert.ok(html.includes(copy), `missing Turkish shell copy: ${copy}`);
  }
});

void test('boot shell consumes canonical copy without inherited typewriter motion', async () => {
  const main = await readFile(mainUrl, 'utf8');

  assert.match(main, /import\s*\{\s*UI_COPY\s*\}\s*from\s*['"]\.\/ui\/copy\.js['"]/);
  assert.match(main, /showBootSplash\(UI_COPY\.preparing\)/);
  assert.match(main, /showBootSplash\(UI_COPY\.loading\)/);
  assert.match(main, /if \(typeEl\) typeEl\.textContent = BOOT_TAGLINE;/);
  assert.doesNotMatch(main, /startTypewriter\(/);
  assert.doesNotMatch(main, /bootTypewriterTimer/);
});

void test('boot exit has no stale decorative zoom wait when zoom presentation is disabled', async () => {
  const [main, shell] = await Promise.all([
    readFile(mainUrl, 'utf8'),
    readFile(shellUrl, 'utf8'),
  ]);

  assert.match(shell, /\.boot-logo,\s*\.boot-logo\.zoom-in[\s\S]*?transform:\s*none;[\s\S]*?animation:\s*none;/);
  assert.doesNotMatch(main, /BOOT_ZOOM_MS/);
  assert.doesNotMatch(main, /classList\.add\(['"]zooming['"]\)/);
  assert.doesNotMatch(main, /classList\.add\(['"]zoom-in['"]\)/);
});

void test('BabuşTV shell CSS uses semantic tokens, remote focus, and reduced-motion support', async () => {
  assert.equal(existsSync(shellUrl), true, 'player/src/ui/shell.css must exist');
  const shell = await readFile(shellUrl, 'utf8');

  for (const token of [
    '--babu-bg',
    '--babu-surface',
    '--babu-surface-raised',
    '--babu-surface-focus',
    '--babu-accent',
    '--babu-accent-strong',
    '--babu-text-primary',
    '--babu-text-secondary',
  ]) {
    assert.ok(shell.includes(`var(${token})`), `shell must consume ${token}`);
  }

  assert.match(shell, /\.focused/);
  assert.match(shell, /\[data-focused\]/);
  assert.match(shell, /:focus-visible/);
  assert.match(shell, /prefers-reduced-motion\s*:\s*reduce/);
  assert.doesNotMatch(shell.toUpperCase(), /#ED421F/);
  assert.doesNotMatch(shell, /rgba\(237\s*,\s*66\s*,\s*31/i);
  assert.doesNotMatch(shell, /\.channel-item\b/);
  assert.doesNotMatch(shell, /\.group-item\b/);
  assert.doesNotMatch(shell, /@keyframes\b/);
});

void test('confirm dialog remote focus overrides inherited orange focus with BabuşTV violet token', async () => {
  const shell = await readFile(shellUrl, 'utf8');

  assert.match(
    shell,
    /\.confirm-dialog-buttons\s+\.btn\.focused\s*\{[\s\S]*?outline:\s*var\(--babu-focus-width\)\s+solid\s+var\(--babu-accent-strong\);[\s\S]*?\}/,
  );
});