import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const liveTvCssUrl = new URL('../src/ui/live-tv.css', import.meta.url);
const m3CssUrl = new URL('../src/m3-live-tv.css', import.meta.url);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

void test('BabuşTV Live TV presentation is loaded through the M3 bridge and uses semantic tokens', async () => {
  assert.equal(existsSync(liveTvCssUrl), true, 'player/src/ui/live-tv.css must exist');

  const [liveTvCss, m3Css] = await Promise.all([
    readFile(liveTvCssUrl, 'utf8'),
    readFile(m3CssUrl, 'utf8'),
  ]);

  assert.match(m3Css, /@import\s+(?:url\()?['"]\.\/ui\/live-tv\.css['"]\)?\s*;/);

  for (const token of [
    '--babu-surface',
    '--babu-surface-raised',
    '--babu-surface-focus',
    '--babu-accent',
    '--babu-accent-strong',
    '--babu-text-primary',
    '--babu-text-secondary',
    '--babu-error',
    '--babu-radius-md',
    '--babu-motion-fast',
  ]) {
    assert.match(liveTvCss, new RegExp(`var\\(${escapeRegExp(token)}\\)`));
  }

  for (const selector of [
    '.channel-item.highlighted',
    '.channel-item.focused',
    '.channel-item.playing',
    '.channel-item.focused.playing',
    '.group-item.active',
    '.group-item.focused',
    '.live-tv-status',
    '.numeric-zap',
  ]) {
    assert.match(liveTvCss, new RegExp(escapeRegExp(selector)));
  }

  assert.match(liveTvCss, /\.channel-item\.playing::after\s*\{[\s\S]*?content\s*:\s*['"]Yayında['"]/);
  assert.match(liveTvCss, /prefers-reduced-motion\s*:\s*reduce/);

  const inheritedAccent = ['#ED', '421F'].join('');
  assert.equal(liveTvCss.toUpperCase().includes(inheritedAccent), false);
  assert.doesNotMatch(liveTvCss, /rgba?\(\s*237\s*,\s*66\s*,\s*31/i);
  assert.doesNotMatch(liveTvCss, /\borange\b/i);
});
