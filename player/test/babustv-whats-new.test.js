import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainUrl = new URL('../src/main.js', import.meta.url);

async function changelogVersions() {
  const source = (await readFile(mainUrl, 'utf8')).replace(/\r\n/g, '\n');
  const start = source.indexOf('const CHANGELOG = [');
  const end = source.indexOf('\n];\n', start);
  assert.ok(start >= 0 && end > start, 'main.js must declare the What\'s New CHANGELOG list');
  return [...source.slice(start, end).matchAll(/version: '([^']+)'/g)].map((match) => match[1]);
}

// BabuşTV starts its own 1.0.0 version line. The What's New modal is headed with
// the running BabuşTV version, so listing the inherited EN TV Player 1.3–1.10
// history under it presents another product's releases as BabuşTV news.
test('What\'s New lists only BabuşTV 1.0.x releases', async () => {
  const versions = await changelogVersions();

  assert.ok(versions.length > 0, 'What\'s New needs at least one BabuşTV entry');
  for (const version of versions) {
    assert.match(version, /^1\.0\.\d+$/, `inherited release ${version} must not appear in BabuşTV What's New`);
  }
});
