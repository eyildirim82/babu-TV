import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prohibited = [
  ['EN', 'IPTV'].join('-'),
  ['EN', 'IPTV'].join(' '),
  ['IPTV', 'Player'].join(''),
  ['@en', 'iptv'].join('-'),
  ['en', 'tvplayer'].join('-'),
  ['en', 'player'].join(''),
];

const fixedSurfaces = [
  'package.json',
  'package-lock.json',
  'README.md',
  'SETUP.md',
  'player/package.json',
  'player/vite.config.js',
  'tizen/package.json',
  'tizen/config.xml',
  'tizen/package.mjs',
  'tizen/wgt.mjs',
  'tizen/README.md',
  'player/index.html',
];

const directorySurfaces = [
  'player/src',
  'player/public',
];

const ignoredDirectoryPrefixes = [
  '.git/',
  'node_modules/',
  'player/dist/',
  'tizen/build/',
];

const ignoredExtensions = new Set([
  '.wgt',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isIgnored(relativePath) {
  const normalized = normalize(relativePath);
  if (ignoredDirectoryPrefixes.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) {
    return true;
  }
  return ignoredExtensions.has(path.extname(normalized).toLowerCase());
}

function collectTextFiles(relativeDirectory) {
  const files = [];
  const entries = readdirSync(path.join(repoRoot, relativeDirectory), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relativePath = normalize(path.join(relativeDirectory, entry.name));
    if (isIgnored(relativePath)) continue;
    if (entry.isDirectory()) {
      files.push(...collectTextFiles(relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

const surfaces = [
  ...fixedSurfaces,
  ...directorySurfaces.flatMap(collectTextFiles),
];

const findings = [];
for (const relativePath of surfaces) {
  if (isIgnored(relativePath)) continue;
  const lines = readFileSync(path.join(repoRoot, relativePath), 'utf-8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const marker of prohibited) {
      if (line.includes(marker)) findings.push(`${relativePath}:${index + 1}: ${marker}`);
    }
  });
}

if (findings.length > 0) {
  for (const finding of findings) console.error(finding);
  process.exitCode = 1;
} else {
  console.log(`[brand:check] ${surfaces.length} active product surfaces clean`);
}
