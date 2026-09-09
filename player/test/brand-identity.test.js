import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
const readText = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('uses the canonical BabuşTV product identity across package and platform surfaces', async () => {
  const rootPackage = readJson('package.json');
  const playerPackage = readJson('player/package.json');
  const tizenPackage = readJson('tizen/package.json');
  const configXml = readText('tizen/config.xml');
  const viteConfig = readText('player/vite.config.js');

  assert.equal(rootPackage.name, 'babustv');
  assert.equal(rootPackage.author, 'BabuşTV');
  assert.equal(playerPackage.name, '@babustv/player');
  assert.equal(tizenPackage.name, '@babustv/tizen');
  assert.equal(rootPackage.version, playerPackage.version);
  assert.match(configXml, /id="BabusTVApp\.BabusTV"/);
  assert.match(configXml, /package="BabusTVApp"/);
  assert.match(configXml, /<name>BABUŞ TV<\/name>/);
  assert.match(viteConfig, /base:\s*['"]\/babustv\/['"]/);

  const { artifactName } = await import('../../tizen/product-identity.mjs');
  assert.equal(
    artifactName({ version: '1.10.1', commit: 'abc1234', channel: 'stable' }),
    'babustv_stable_v1.10.1_abc1234.wgt',
  );
  assert.equal(
    artifactName({ version: '1.10.1', commit: 'abc1234', channel: 'beta' }),
    'babustv_beta_v1.10.1_abc1234.wgt',
  );
});
