import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
const readText = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');
const legacyProduct = /EN[- ]?IPTV|IPTVPlayer|@en-iptv|en-tvplayer|enplayer/i;

test('BabuşTV update metadata does not route users through the legacy upstream product identity', () => {
  const updateSource = readText('player/src/update.js');
  const versionMetadata = readJson('version.json');

  assert.doesNotMatch(updateSource, legacyProduct);
  assert.doesNotMatch(versionMetadata.url, legacyProduct);
  assert.match(updateSource, /eyildirim82\/babu-TV@main\/version\.json/);
  assert.equal(versionMetadata.url, 'https://github.com/eyildirim82/babu-TV/releases/latest');
});
