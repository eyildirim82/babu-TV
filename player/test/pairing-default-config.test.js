import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const indexUrl = new URL('../index.html', import.meta.url);
const configUrl = new URL('../public/pairing-config.js', import.meta.url);

async function evaluateConfig(windowLike) {
  const source = await readFile(configUrl, 'utf8');
  vm.runInNewContext(source, { window: windowLike }, { filename: 'pairing-config.js' });
  return windowLike.BABUSTV_PAIRING_CONFIG;
}

void test('PAIR-CFG index loads the public pairing config as a classic script before the app entry', async () => {
  const html = await readFile(indexUrl, 'utf8');
  const configTag = html.indexOf('<script src="/pairing-config.js"></script>');
  const entryTag = html.indexOf('<script type="module" src="/src/browser-entry.ts"></script>');
  assert.notEqual(configTag, -1);
  assert.notEqual(entryTag, -1);
  assert.ok(configTag < entryTag, 'pairing config must run before the application entry');
});

void test('PAIR-CFG default config exposes only the public whitelist with HTTPS same-origin endpoints', async () => {
  const config = await evaluateConfig({});
  assert.deepEqual(Object.keys(config).sort(), ['phoneBaseUrl', 'pollIntervalMs', 'relayBaseUrl', 'relayTimeoutMs']);

  const relay = new URL(config.relayBaseUrl);
  const phone = new URL(config.phoneBaseUrl);
  assert.equal(relay.protocol, 'https:');
  assert.equal(phone.protocol, 'https:');
  assert.equal(relay.username + relay.password + relay.search + relay.hash, '');
  assert.equal(phone.username + phone.password + phone.search + phone.hash, '');
  assert.equal(config.relayBaseUrl, relay.origin, 'relay base URL is a bare origin');
  assert.equal(phone.origin, relay.origin, 'the phone page is served by the relay deployment');
  assert.equal(phone.pathname, '/babustv/', 'the phone page lives under the player build base');

  assert.ok(Number.isFinite(config.relayTimeoutMs) && config.relayTimeoutMs > 0);
  assert.ok(config.pollIntervalMs >= 1_000, 'polling faster than once per second risks the relay poll limit');
});

void test('PAIR-CFG default config never overrides a value provided earlier', async () => {
  const provided = Object.freeze({
    relayBaseUrl: 'https://relay.invalid',
    phoneBaseUrl: 'https://relay.invalid/pair',
    relayTimeoutMs: 1_000,
    pollIntervalMs: 50,
  });
  const windowLike = { BABUSTV_PAIRING_CONFIG: provided };
  assert.equal(await evaluateConfig(windowLike), provided);
});

void test('PAIR-CFG default config stays plain ES5 for the Tizen web engine', async () => {
  const source = await readFile(configUrl, 'utf8');
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotMatch(source, /=>|\bconst\b|\blet\b|`/);
});
