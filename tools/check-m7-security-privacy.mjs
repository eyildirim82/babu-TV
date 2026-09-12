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
  'm7-password-DO-NOT-LOG',
  'm7-token-DO-NOT-LOG',
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

// M7 SEC: the legacy Settings surface is still live on the frozen base. An
// arbitrary M3U URL accepted by settings.js must never be serialized by the
// ordinary localStorage settings store. This is intentionally a narrow proof,
// not a ban on benign localStorage preferences such as consent/version flags.
const legacyConfig = read('player/src/config.js');
const legacySettings = read('player/src/settings.js');
const storesWholeSettings = /localStorage\.setItem\(SETTINGS_KEY,\s*JSON\.stringify\(merged\)\)/.test(legacyConfig);
const acceptsPlaylistUrl = /playlists\.push\(\{\s*name:[^}]*\burl\s*\}\)/s.test(legacySettings)
  || /playlists\[editIndex\]\s*=\s*\{\s*name:[^}]*\burl\s*\}/s.test(legacySettings);
if (storesWholeSettings && acceptsPlaylistUrl) {
  addViolation('ordinary-localstorage-credential-url-persistence', 'player/src/config.js');
  addViolation('ordinary-localstorage-credential-url-source', 'player/src/settings.js');
}

// Log-safe URLs must remove fragments entirely. Fragments can carry pairing,
// bearer or provider material and are not required for diagnostics.
const sanitizer = read('player/src/logging/sanitize.ts');
if (!/url\.hash\s*=\s*['"]{2}/.test(sanitizer)) {
  addViolation('log-url-fragment-not-sanitized', 'player/src/logging/sanitize.ts');
}

// Console output is forbidden in credential/provider/pairing production
// boundaries. Build/deploy helper console output is intentionally outside this
// rule because it contains fixed operational diagnostics, not provider data.
for (const path of walk('player/src')) {
  if (!secretBoundaryPrefixes.some((prefix) => path.startsWith(prefix))) continue;
  const source = read(path);
  if (/\bconsole\.(?:log|info|debug|warn|error)\s*\(/.test(source)) {
    addViolation('secret-boundary-console-output', path);
  }
}

// Secret-shaped DOM data-* state is prohibited. Presentation/category/index
// dataset fields are intentionally allowed because they are non-secret UI state.
for (const path of walk('player/src')) {
  const source = read(path);
  const secretDataset = /\bdataset\.(?:credential|credentials|password|token|payload|streamUrl|streamURL|providerUrl|playlistUrl)\s*=/i;
  const secretDataAttribute = /setAttribute\(\s*['"]data-[^'"]*(?:credential|password|token|payload|stream-url|provider-url|playlist-url)[^'"]*['"]/i;
  if (secretDataset.test(source) || secretDataAttribute.test(source)) {
    addViolation('secret-dom-data-attribute', path);
  }
}

// Generated application output must never contain the synthetic audit secrets.
// Source tests are excluded because the canaries deliberately live there.
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
