import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const liveTvCssUrl = new URL('../src/ui/live-tv.css', import.meta.url);
const m3CssUrl = new URL('../src/m3-live-tv.css', import.meta.url);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Concatenates the declaration blocks of every rule whose selector list has an
// entry equal to `selector` or ending in it as a descendant (`.overlay .x`).
function declarationsFor(css, selector) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bodies = [];
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim().replace(/\s+/g, ' '));
    if (selectors.some((entry) => entry === selector || entry.endsWith(` ${selector}`))) {
      bodies.push(match[2]);
    }
  }
  return bodies.join('\n');
}

function topLevelTracks(value) {
  const tracks = [];
  let depth = 0;
  let current = '';
  for (const char of value.trim()) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (current.length > 0) tracks.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.length > 0) tracks.push(current);
  return tracks;
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

void test('BabuşTV Live TV M4 feature panel is styled as a compact, remote-focusable overlay strip', async () => {
  const liveTvCss = await readFile(liveTvCssUrl, 'utf8');

  // The panel is appended into #sidebar; without its own row it falls into an
  // implicit grid row, wraps at the root font and pushes the lists off-screen.
  const overlay = declarationsFor(liveTvCss, '.sidebar.babu-live-tv-overlay');
  const rows = /grid-template-rows\s*:\s*([^;]+);/.exec(overlay);
  assert.ok(rows, 'the Live TV overlay must declare grid-template-rows');
  assert.equal(topLevelTracks(rows[1]).length, 3, 'the overlay grid must reserve a third row for the feature panel');

  const featureRoot = declarationsFor(liveTvCss, '.live-tv-feature-root');
  assert.ok(featureRoot.length > 0, '.live-tv-feature-root must be styled');
  assert.match(featureRoot, /grid-column\s*:\s*1\s*\/\s*-1\s*;/);
  assert.match(featureRoot, /grid-row\s*:\s*3\s*;/);
  assert.match(featureRoot, /max-height\s*:/);
  assert.match(featureRoot, /overflow-y\s*:\s*auto\s*;/);
  assert.match(featureRoot, /background\s*:\s*var\(--babu-surface-raised\)/);
  // When the capped panel scrolls (Search results), `auto` rows let an
  // overflow-hidden summary shrink under the next section; text rows must not.
  const panelRows = /grid-template-rows\s*:\s*([^;]+);/.exec(featureRoot);
  assert.ok(panelRows, 'the feature panel must declare its row tracks');
  const panelTracks = topLevelTracks(panelRows[1]);
  assert.ok(panelTracks.length >= 3, 'the feature panel needs a row per stacked text section');
  for (const track of panelTracks.slice(0, -1)) {
    assert.equal(track, 'min-content', 'stacked feature text rows must not shrink below their content');
  }

  for (const selector of ['.live-tv-favorites', '.live-tv-selected-epg']) {
    const summary = declarationsFor(liveTvCss, selector);
    assert.ok(summary.length > 0, `${selector} must be styled`);
    assert.match(summary, /white-space\s*:\s*nowrap\s*;/, `${selector} must stay on one line`);
    assert.match(summary, /text-overflow\s*:\s*ellipsis\s*;/, `${selector} must truncate with an ellipsis`);
  }
  assert.match(declarationsFor(liveTvCss, '.live-tv-selected-epg:empty'), /display\s*:\s*none\s*;/);

  const action = declarationsFor(liveTvCss, '.live-tv-action');
  assert.match(action, /min-height\s*:/, 'actions must be TV-sized, not default browser buttons');
  assert.match(action, /font-size\s*:/);

  for (const selector of [
    '.live-tv-action[data-presentation-state="focused"]',
    '.live-tv-search-input[data-presentation-state="focused"]',
    '.live-tv-search-result[data-presentation-state="focused"]',
  ]) {
    const focused = declarationsFor(liveTvCss, selector);
    assert.ok(focused.length > 0, `${selector} must have a visible remote focus state`);
    assert.match(focused, /outline\s*:\s*var\(--babu-focus-width\)\s+solid\s+var\(--babu-accent-strong\)/);
  }

  const reducedMotion = liveTvCss.slice(liveTvCss.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reducedMotion, /\.live-tv-action\b/, 'feature actions must drop transitions under reduced motion');

  // Tizen 5.0 Chromium has no `inset` shorthand.
  assert.doesNotMatch(liveTvCss, /(^|[\s;{])inset\s*:/m);
});
