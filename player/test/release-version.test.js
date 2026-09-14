import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readText = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

async function importUpdateModule() {
  // config.js reads the Vite-defined __APP_VERSION__ at import time.
  globalThis.__APP_VERSION__ = 'release-version-test';
  const updateUrl = pathToFileURL(path.join(repoRoot, 'player/src/update.js')).href;
  return import(updateUrl);
}

test('Tizen widget version keeps plain x.y.z package versions unchanged', async () => {
  const { tizenWidgetVersion } = await import('../../tizen/product-identity.mjs');

  assert.equal(tizenWidgetVersion('1.10.1'), '1.10.1');
  assert.equal(tizenWidgetVersion('1.0.0'), '1.0.0');
});

test('Tizen widget version drops prerelease and build metadata', async () => {
  const { tizenWidgetVersion } = await import('../../tizen/product-identity.mjs');

  assert.equal(tizenWidgetVersion('1.0.0-rc.1'), '1.0.0');
  assert.equal(tizenWidgetVersion('1.0.0-rc.1+build.7'), '1.0.0');
  assert.equal(tizenWidgetVersion('2.3.4+sha.abc1234'), '2.3.4');
});

test('Tizen widget version rejects versions Tizen cannot install', async () => {
  const { tizenWidgetVersion } = await import('../../tizen/product-identity.mjs');

  for (const invalid of ['1.0', 'v1.0.0', 'latest', '', '256.0.0', '1.256.0', '1.0.65536']) {
    assert.throws(() => tizenWidgetVersion(invalid), TypeError, `expected ${JSON.stringify(invalid)} to be rejected`);
  }
  assert.equal(tizenWidgetVersion('255.255.65535'), '255.255.65535');
});

test('Tizen staging and legacy packaging derive config.xml version through tizenWidgetVersion', () => {
  for (const script of ['tizen/stage.mjs', 'tizen/package.mjs']) {
    const source = readText(script);
    assert.match(source, /import \{[^}]*\btizenWidgetVersion\b[^}]*\} from '\.\/product-identity\.mjs'/, script);
    assert.match(source, /\$1\$\{tizenWidgetVersion\(/, `${script} must write the derived widget version`);
  }
});

test('update check orders release versions numerically', async () => {
  const { compareVersions } = await importUpdateModule();

  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.ok(compareVersions('1.9.0', '1.10.0') < 0);
  assert.equal(compareVersions('1.10.1', '1.10.1'), 0);
});

test('update check ranks a prerelease below its release', async () => {
  const { compareVersions } = await importUpdateModule();

  assert.ok(compareVersions('1.0.0', '1.0.0-rc.1') > 0, 'final 1.0.0 must be offered to 1.0.0-rc.1');
  assert.ok(compareVersions('1.0.0-rc.1', '1.0.0') < 0);
  assert.ok(compareVersions('1.0.0-rc.1', '1.10.1') < 0, 'rc.1 must not be offered to legacy 1.10.1');
  assert.ok(compareVersions('1.10.1', '1.0.0-rc.1') > 0);
});

test('update check orders prerelease identifiers by semver precedence', async () => {
  const { compareVersions } = await importUpdateModule();

  assert.ok(compareVersions('1.0.0-rc.2', '1.0.0-rc.1') > 0);
  assert.ok(compareVersions('1.0.0-rc.10', '1.0.0-rc.2') > 0, 'numeric identifiers compare numerically');
  assert.ok(compareVersions('1.0.0-rc.1', '1.0.0-beta.9') > 0, 'alphanumeric identifiers compare lexically');
  assert.ok(compareVersions('1.0.0-rc', '1.0.0-rc.1') < 0, 'shorter identifier list ranks lower');
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0-rc.1'), 0);
  assert.equal(compareVersions('1.0.0-rc.1+build.2', '1.0.0-rc.1'), 0, 'build metadata is ignored');
});

test('update check never reports an unparseable remote version as newer', async () => {
  const { compareVersions } = await importUpdateModule();

  for (const garbage of ['latest', '', '1.0', 'v2.0.0', null, undefined]) {
    assert.equal(compareVersions(garbage, '1.0.0-rc.1') > 0, false, `garbage ${JSON.stringify(garbage)}`);
  }
});
