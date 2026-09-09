import { readFileSync } from 'node:fs';
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

const surfaces = [
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
];

const findings = [];
for (const relativePath of surfaces) {
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
  console.log(`[brand:check] ${surfaces.length} owned identity/build surfaces clean`);
}
