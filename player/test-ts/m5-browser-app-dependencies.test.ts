import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE_URL = new URL('../src/app/browser-app-dependencies.ts', import.meta.url);

function browserDependencySource(): string {
  return readFileSync(SOURCE_URL, 'utf8');
}

test('browser app dependencies construct ProviderReentryService from the same provider runtime seams', () => {
  const source = browserDependencySource();

  assert.match(
    source,
    /import \{ ProviderReentryService \} from '\.\.\/providers\/provider-reentry-service\.js';/,
  );
  assert.match(
    source,
    /const providerReentry = new ProviderReentryService\(\{\s*providers: runtime\.providers,\s*credentials: runtime\.credentials,\s*adapters: runtime\.adapters,\s*sync: runtime\.sync,\s*\}\);/,
  );
  assert.match(
    source,
    /reentry:\s*\{\s*reenter:\s*\(input\)\s*=>\s*providerReentry\.reenter\(input\),\s*\},/,
  );
});

test('browser provider-management Edit delegates only provider identity and immutable kind to the app callback', () => {
  const source = browserDependencySource();

  assert.match(
    source,
    /requestEditProvider:\s*\(providerId, kind\)\s*=>\s*callbacks\.onEditProvider\(providerId, kind\),/,
  );
  assert.doesNotMatch(
    source,
    /requestEditProvider:[^\n]*(serverUrl|playlistUrl|username|password|credentials)/,
  );
});
