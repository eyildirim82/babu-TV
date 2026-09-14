import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const read = (relative) => readFileSync(path.join(srcRoot, relative), 'utf8');

// Full-screen surfaces are appended to <body> after #app, which is 100% tall.
// Without a fixed viewport box they render below the fold at 1920x1080.
const fullScreenSurfaces = [
  ['ui/first-run.css', '.first-run-page'],
  ['ui/pairing-tv.css', '.pairing-tv-page'],
  ['ui/m3u-entry.css', '.m3u-entry-page'],
  ['ui/xtream-entry.css', '.xtream-entry-page'],
  ['ui/home.css', '.home-page'],
  ['ui/provider-management.css', '.provider-management-page'],
];

// Surfaces that can raise the app-wide exit confirmation (.confirm-dialog, z-index 100).
const surfacesBelowConfirmDialog = ['.first-run-page', '.pairing-tv-page', '.home-page', '.provider-management-page'];

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return match ? match[1] : null;
}

function cssFiles() {
  return readdirSync(srcRoot, { recursive: true })
    .map((file) => String(file).split(path.sep).join('/'))
    .filter((file) => file.endsWith('.css'));
}

test('full-screen surfaces are fixed to the viewport with explicit offsets', () => {
  for (const [file, selector] of fullScreenSurfaces) {
    const body = ruleBody(read(file), selector);
    assert.ok(body, `${file} must define ${selector}`);
    assert.match(body, /position:\s*fixed;/, `${selector} must be position: fixed`);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      assert.match(body, new RegExp(`(?:^|\\s)${side}:\\s*0;`), `${selector} must set ${side}: 0`);
    }
  }
});

test('stylesheets avoid the inset shorthand that the Tizen 5.0 web engine does not support', () => {
  const offenders = cssFiles().filter((file) => /(?:^|[\s;{])inset\s*:/.test(read(file)));
  assert.deepEqual(offenders, []);
});

test('screen surfaces that can raise the exit confirmation stay below it', () => {
  for (const [file, selector] of fullScreenSurfaces) {
    if (!surfacesBelowConfirmDialog.includes(selector)) continue;
    const zIndex = /z-index:\s*(\d+);/.exec(ruleBody(read(file), selector) ?? '');
    assert.ok(zIndex, `${selector} must declare a numeric z-index`);
    assert.ok(Number(zIndex[1]) < 100, `${selector} z-index ${zIndex[1]} must stay below .confirm-dialog (100)`);
  }
});

test('every design token referenced by a stylesheet is defined in tokens.css', () => {
  const defined = new Set([...read('ui/tokens.css').matchAll(/(--babu-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  const undefinedTokens = [];
  for (const file of cssFiles()) {
    for (const match of read(file).matchAll(/var\((--babu-[a-z0-9-]+)\s*\)/g)) {
      if (!defined.has(match[1])) undefinedTokens.push(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual([...new Set(undefinedTokens)], []);
});
