import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const violations = [];
const textExtensions = new Set(['.js', '.mjs', '.ts', '.tsx', '.json', '.html', '.css', '.xml', '.md', '.yml', '.yaml']);
const secretBoundaryPrefixes = [
  'player/src/credentials/',
  'player/src/providers/',
  'player/src/pairing/',
];
const generatedRoots = ['player/dist', 'tizen/build'];
const syntheticCanaries = [
  'm7-sec-pass',
  'm7-sec-token',
];

function addViolation(category, path) {
  violations.push({ category, path });
}

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function walk(root) {
  const absoluteRoot = resolve(repoRoot, root);
  if (!existsSync(absoluteRoot)) return [];
  const output = [];
  for (const entry of readdirSync(absoluteRoot)) {
    const absolute = resolve(absoluteRoot, entry);
    const info = statSync(absolute);
    if (info.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === '.cache') continue;
      output.push(...walk(relative(repoRoot, absolute)));
    } else if (textExtensions.has(extname(entry).toLowerCase())) {
      output.push(normalizePath(relative(repoRoot, absolute)));
    }
  }
  return output;
}

// Integrated-main legacy persistence regression guard. Ordinary preferences may
// use localStorage, but the removed legacy M3U source UI must not combine with
// whole-settings persistence of credential-bearing playlist URLs.
const legacyConfig = read('player/src/config.js');
const legacySettings = read('player/src/settings.js');
const storesWholeSettings = /localStorage\.setItem\(SETTINGS_KEY,\s*JSON\.stringify\(merged\)\)/.test(legacyConfig);
const acceptsPlaylistUrl = /playlists\.push\(\{\s*name:[^}]*\burl\s*\}\)/s.test(legacySettings)
  || /playlists\[editIndex\]\s*=\s*\{\s*name:[^}]*\burl\s*\}/s.test(legacySettings);
if (storesWholeSettings && acceptsPlaylistUrl) {
  addViolation('ordinary-localstorage-credential-url-persistence', 'player/src/config.js');
  addViolation('ordinary-localstorage-credential-url-source', 'player/src/settings.js');
}

// The approved logging contract requires fragments to be discarded after a URL
// parses successfully. This narrow check maps directly to the deterministic SEC
// reproducer and does not inspect or print fragment contents.
const loggingSanitizer = read('player/src/logging/sanitize.ts');
if (!/\burl\.hash\s*=\s*['"]['"]\s*;/.test(loggingSanitizer)) {
  addViolation('url-fragment-not-stripped', 'player/src/logging/sanitize.ts');
}

// Console output is forbidden in credential/provider/pairing production
// boundaries. The diagnostic reports only file/category, never matched text.
for (const path of walk('player/src')) {
  if (!secretBoundaryPrefixes.some((prefix) => path.startsWith(prefix))) continue;
  const source = read(path);
  if (/\bconsole\.(?:log|info|debug|warn|error)\s*\(/.test(source)) {
    addViolation('secret-boundary-console-output', path);
  }
}

// Secret-shaped DOM data-* state is prohibited. Non-secret focus/category/UI
// dataset fields are intentionally outside this narrow rule.
for (const path of walk('player/src')) {
  const source = read(path);
  const secretDataset = /\bdataset\.(?:credential|credentials|password|token|payload|streamUrl|streamURL|providerUrl|playlistUrl)\s*=/i;
  const secretDataAttribute = /setAttribute\(\s*['"]data-[^'"]*(?:credential|password|token|payload|stream-url|provider-url|playlist-url)[^'"]*['"]/i;
  if (secretDataset.test(source) || secretDataAttribute.test(source)) {
    addViolation('secret-dom-data-attribute', path);
  }
}

// Generated application output must never contain the synthetic audit canaries.
// Source tests are intentionally excluded because the canaries live there.
for (const root of generatedRoots) {
  for (const path of walk(root)) {
    const source = read(path);
    if (syntheticCanaries.some((canary) => source.includes(canary))) {
      addViolation('synthetic-secret-in-generated-output', path);
    }
  }
}

if (violations.length > 0) {
  console.error(`[m7-security] FAIL: ${violations.length} prohibited pattern(s)`);
  for (const violation of violations) {
    console.error(`[m7-security] ${violation.category}: ${violation.path}`);
  }
  process.exitCode = 1;
} else {
  console.log('[m7-security] PASS: source/privacy scan clean');
}
