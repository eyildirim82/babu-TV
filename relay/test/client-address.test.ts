import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { normalizeClientAddress } from '../src/client-address.js';
import { normalizeClientAddress as nodeServerNormalize } from '../src/node-server.js';
import { createRelayCore, relayPreflightResponse } from '../src/relay-core.js';
import { MemoryRelaySessionStore } from '../src/memory-session-store.js';
import { MemoryRelayRateLimiter } from '../src/memory-rate-limiter.js';
import { DEFAULT_RELAY_LIMITS } from '../src/limits.js';

const VALIDITY_SAMPLES = [
  '0.0.0.0',
  '255.255.255.255',
  '203.0.113.7',
  '256.1.1.1',
  '1.2.3',
  '1.2.3.4.5',
  '01.2.3.4',
  '1..2.3',
  '::',
  '::1',
  '1::',
  '1:2:3:4:5:6:7:8',
  '1:2:3:4:5:6:7::',
  '::2:3:4:5:6:7:8',
  '1:2:3:4:5:6:7:8:9',
  '1::2::3',
  ':::',
  '12345::',
  'g::1',
  '2001:db8::1',
  '2001:DB8:0:0:8:800:200C:417A',
  'ff02::1',
  '::ffff:203.0.113.7',
  '64:ff9b::192.0.2.1',
  '1:2:3:4:5:6:1.2.3.4',
  '1:2:3:4:5:6:7:1.2.3.4',
  '::1.2.3.256',
  '1:',
  ':1',
  '',
  'not-an-ip',
];

test('RELAY-ADDR pure normalizer accepts exactly the addresses node:net accepts', () => {
  for (const sample of VALIDITY_SAMPLES) {
    assert.equal(
      normalizeClientAddress(sample) !== null,
      isIP(sample) !== 0,
      `validity mismatch for ${JSON.stringify(sample)}`,
    );
  }
});

test('RELAY-ADDR node server keeps exporting the shared normalizer', () => {
  assert.equal(nodeServerNormalize, normalizeClientAddress);
});

test('RELAY-ADDR Worker-bundled relay modules import no Node built-ins', () => {
  for (const file of ['client-address.ts', 'relay-core.ts', 'limits.ts', 'memory-session-store.ts', 'memory-rate-limiter.ts']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]node:/, file);
    assert.doesNotMatch(source, /\bprocess\.(env|exit|argv|stdout|stderr|on|once|nextTick)\b/, file);
  }
});

test('RELAY-ADDR relay sources are plain text without NUL bytes', () => {
  const files = [
    'src/client-address.ts', 'src/limits.ts', 'src/main.ts', 'src/memory-rate-limiter.ts',
    'src/memory-session-store.ts', 'src/node-server.ts', 'src/rate-limiter.ts', 'src/relay-core.ts',
    'src/session-store.ts',
  ];
  for (const file of files) {
    const bytes = readFileSync(new URL(`../${file}`, import.meta.url));
    assert.equal(bytes.includes(0), false, file);
  }
});

test('RELAY-ADDR shared preflight response matches the core OPTIONS answer', async () => {
  const core = createRelayCore({
    store: new MemoryRelaySessionStore(DEFAULT_RELAY_LIMITS),
    rateLimiter: new MemoryRelayRateLimiter(DEFAULT_RELAY_LIMITS.rateLimits),
    nowMs: () => 0,
  });
  const fromCore = await core.handle({ method: 'OPTIONS', path: '/v1/pairing/sessions', clientKey: 'c', body: null });
  assert.deepEqual(relayPreflightResponse(), fromCore);
});
