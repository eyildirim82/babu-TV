import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest, type Server } from 'node:http';
import { connect, createServer as createNetServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  createRelayNodeServer,
  normalizeClientAddress,
  readRelayServerConfig,
  type RelayNodeServerOptions,
} from '../src/node-server.js';
import { createRelayCore, type RelayHttpRequest } from '../src/relay-core.js';
import { MemoryRelaySessionStore } from '../src/memory-session-store.js';
import { MemoryRelayRateLimiter } from '../src/memory-rate-limiter.js';
import { DEFAULT_RELAY_LIMITS, type RelayLimits } from '../src/limits.js';

const SESSION = 'NodeSessionAbcdefghijk';
const CANARY = 'provider-password-canary';

async function listen(server: Server): Promise<{ base: string; port: number }> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, port };
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function realServer(options: Partial<RelayNodeServerOptions> & { limits?: Partial<RelayLimits> } = {}): Server {
  const limits = { ...DEFAULT_RELAY_LIMITS, ...options.limits };
  const core = createRelayCore({
    store: new MemoryRelaySessionStore(limits),
    rateLimiter: new MemoryRelayRateLimiter(limits.rateLimits),
    nowMs: () => Date.now(),
    limits,
  });
  return createRelayNodeServer({ core, maxBodyBytes: limits.maxBodyBytes, trustedProxyHops: 0, ...options });
}

test('RELAY-NODE serves the pairing exchange over real HTTP with CORS and no-store headers', async () => {
  const server = realServer();
  const { base } = await listen(server);
  try {
    const preflight = await fetch(`${base}/v1/pairing/sessions`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://phone.example.invalid', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');

    const create = await fetch(`${base}/v1/pairing/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION, expiresAtMs: Date.now() + 300_000 }),
    });
    assert.equal(create.status, 204);
    assert.equal(await create.text(), '');

    const put = await fetch(`${base}/v1/pairing/sessions/${SESSION}/ciphertext`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ciphertext: 'opaque' }),
    });
    assert.equal(put.status, 204);

    const poll = await fetch(`${base}/v1/pairing/sessions/${SESSION}/ciphertext?ignored=1`);
    assert.equal(poll.status, 200);
    assert.equal(poll.headers.get('cache-control'), 'no-store');
    assert.equal(poll.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(await poll.json(), { status: 'ready', ciphertext: 'opaque' });
  } finally {
    await close(server);
  }
});

test('RELAY-NODE rejects a declared oversized body with 413', async () => {
  const server = realServer({ limits: { maxBodyBytes: 128 }, maxBodyBytes: 128 });
  const { base } = await listen(server);
  try {
    const response = await fetch(`${base}/v1/pairing/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION, expiresAtMs: 1, pad: 'x'.repeat(10_000) }),
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'payload_too_large' });
  } finally {
    await close(server);
  }
});

test('RELAY-NODE rejects a streamed body once it exceeds the limit', async () => {
  const server = realServer({ limits: { maxBodyBytes: 128 }, maxBodyBytes: 128 });
  const { port } = await listen(server);
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/v1/pairing/sessions',
        headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
      });
      req.on('response', (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', (error) => reject(error));
      for (let index = 0; index < 8; index += 1) req.write('x'.repeat(64));
      req.end();
    });
    assert.equal(status, 413);
  } finally {
    await close(server);
  }
});

test('RELAY-NODE survives a client that aborts mid-body and keeps serving', async () => {
  const server = realServer();
  const { base, port } = await listen(server);
  try {
    await new Promise<void>((resolve) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write('POST /v1/pairing/sessions HTTP/1.1\r\nHost: relay\r\nContent-Type: application/json\r\nContent-Length: 500\r\n\r\n{"sessionId":');
        setTimeout(() => {
          socket.destroy();
          resolve();
        }, 50);
      });
      socket.on('error', () => undefined);
    });
    const response = await fetch(`${base}/v1/pairing/sessions/${SESSION}/ciphertext`);
    assert.equal(response.status, 404);
  } finally {
    await close(server);
  }
});

test('RELAY-NODE enforces the headers timeout promptly', async () => {
  const server = realServer({ headersTimeoutMs: 200, requestTimeoutMs: 400, connectionsCheckingIntervalMs: 50 });
  const { port } = await listen(server);
  try {
    const started = Date.now();
    const outcome = await new Promise<string>((resolve) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write('GET /v1/pairing/sessions HTTP/1.1\r\nHost: relay\r\n');
      });
      let received = '';
      socket.on('data', (chunk) => { received += chunk.toString('latin1'); });
      socket.on('close', () => resolve(received));
      socket.on('error', () => undefined);
      setTimeout(() => { socket.destroy(); resolve('still-open'); }, 3_000);
    });
    assert.notEqual(outcome, 'still-open');
    assert.ok(Date.now() - started < 2_000);
  } finally {
    await close(server);
  }
});

test('RELAY-NODE closes a request whose body stalls past the body deadline', async () => {
  const server = realServer({ bodyTimeoutMs: 200, requestTimeoutMs: 5_000, headersTimeoutMs: 4_000 });
  const { port } = await listen(server);
  try {
    const started = Date.now();
    const received = await new Promise<string>((resolve) => {
      let data = '';
      const socket = connect(port, '127.0.0.1', () => {
        socket.write('POST /v1/pairing/sessions HTTP/1.1\r\nHost: relay\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"session');
      });
      socket.on('data', (chunk) => { data += chunk.toString('latin1'); });
      socket.on('close', () => resolve(data));
      socket.on('error', () => undefined);
      setTimeout(() => { socket.destroy(); resolve(`still-open:${data}`); }, 3_000);
    });
    assert.match(received, /^HTTP\/1\.1 408/);
    assert.match(received, /"error":"request_timeout"/);
    assert.ok(Date.now() - started < 2_000);
  } finally {
    await close(server);
  }
});

test('RELAY-NODE applies safe default timeouts and a connection cap', () => {
  const server = realServer();
  assert.equal(server.requestTimeout, 10_000);
  assert.equal(server.headersTimeout, 5_000);
  assert.equal(server.maxConnections, 2_048);
});

async function captureClientKeys(trustedProxyHops: number, headers: Record<string, string>): Promise<string[]> {
  const keys: string[] = [];
  const server = createRelayNodeServer({
    core: {
      handle: async (request: RelayHttpRequest) => {
        keys.push(request.clientKey);
        return { status: 204, headers: {}, body: null };
      },
    },
    maxBodyBytes: 1024,
    trustedProxyHops,
  });
  const { base } = await listen(server);
  try {
    await fetch(`${base}/v1/pairing/sessions/${SESSION}/ciphertext`, { headers });
  } finally {
    await close(server);
  }
  return keys;
}

test('RELAY-NODE ignores X-Forwarded-For unless trusted hops are configured', async () => {
  assert.deepEqual(await captureClientKeys(0, { 'X-Forwarded-For': '203.0.113.7' }), ['127.0.0.1']);
});

test('RELAY-NODE takes the address appended by the trusted proxy, not a client-supplied one', async () => {
  const spoofed = { 'X-Forwarded-For': '198.51.100.99, 203.0.113.7' };
  assert.deepEqual(await captureClientKeys(1, spoofed), ['203.0.113.7']);
  assert.deepEqual(await captureClientKeys(2, spoofed), ['198.51.100.99']);
  assert.deepEqual(await captureClientKeys(3, spoofed), ['127.0.0.1']);
  assert.deepEqual(await captureClientKeys(1, { 'X-Forwarded-For': 'not-an-ip' }), ['127.0.0.1']);
});

test('RELAY-NODE normalizes client addresses and groups IPv6 by /64', () => {
  assert.equal(normalizeClientAddress('203.0.113.7'), '203.0.113.7');
  assert.equal(normalizeClientAddress('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(normalizeClientAddress('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(normalizeClientAddress('2001:DB8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(normalizeClientAddress('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(normalizeClientAddress('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(normalizeClientAddress('::1'), '0:0:0:0::/64');
  assert.equal(normalizeClientAddress('64:ff9b::192.0.2.1'), '64:ff9b:0:0::/64');
  assert.equal(normalizeClientAddress(' 203.0.113.7 '), '203.0.113.7');
  assert.equal(normalizeClientAddress('203.0.113.7:4711'), '203.0.113.7');
  assert.equal(normalizeClientAddress('[2001:db8::1]:443'), '2001:db8:0:0::/64');
  assert.equal(normalizeClientAddress('[2001:db8::1]'), '2001:db8:0:0::/64');
  assert.equal(normalizeClientAddress('::ffff:102:304'), '1.2.3.4');
  assert.equal(normalizeClientAddress('0:0:0:0:0:ffff:cb00:7107'), '203.0.113.7');
  assert.equal(normalizeClientAddress('203.0.113.7:notaport'), null);
  assert.equal(normalizeClientAddress('not-an-ip'), null);
  assert.equal(normalizeClientAddress(undefined), null);
});

test('RELAY-NODE answers a core failure with a fixed 500', async () => {
  const server = createRelayNodeServer({
    core: { handle: async () => { throw new Error(CANARY); } },
    maxBodyBytes: 1024,
    trustedProxyHops: 0,
  });
  const { base } = await listen(server);
  try {
    const response = await fetch(`${base}/v1/pairing/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ciphertext: CANARY }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'internal' });
  } finally {
    await close(server);
  }
});

test('RELAY-NODE reads a safe configuration from the environment', () => {
  assert.deepEqual(readRelayServerConfig({}), { host: '127.0.0.1', port: 8787, basePath: '', trustedProxyHops: 0 });
  assert.deepEqual(
    readRelayServerConfig({ RELAY_HOST: '0.0.0.0', PORT: '9000', RELAY_BASE_PATH: '/relay/', RELAY_TRUSTED_PROXY_HOPS: '1' }),
    { host: '0.0.0.0', port: 9000, basePath: '/relay', trustedProxyHops: 1 },
  );
  assert.throws(() => readRelayServerConfig({ PORT: 'eighty' }), /PORT/);
  assert.throws(() => readRelayServerConfig({ PORT: '70000' }), /PORT/);
  assert.throws(() => readRelayServerConfig({ RELAY_BASE_PATH: 'relay' }), /RELAY_BASE_PATH/);
  assert.throws(() => readRelayServerConfig({ RELAY_TRUSTED_PROXY_HOPS: 'true' }), /RELAY_TRUSTED_PROXY_HOPS/);
  assert.throws(() => readRelayServerConfig({ RELAY_TRUSTED_PROXY_HOPS: '11' }), /RELAY_TRUSTED_PROXY_HOPS/);
});

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

test('RELAY-MAIN process prints only its startup line while handling requests', async () => {
  const port = await freePort();
  const relayDir = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: relayDir,
    env: { ...process.env, PORT: String(port), RELAY_HOST: '127.0.0.1', RELAY_BASE_PATH: '', RELAY_TRUSTED_PROXY_HOPS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));

  try {
    const deadline = Date.now() + 20_000;
    while (!stdout.includes('\n')) {
      if (Date.now() > deadline) assert.fail(`relay did not start: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const base = `http://127.0.0.1:${port}/v1/pairing/sessions`;
    const sessionId = `${CANARY.replace(/-/g, '_')}_session`;
    await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, expiresAtMs: 1 }) });
    await fetch(`${base}/${sessionId}/ciphertext`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ciphertext: CANARY }) });
    await fetch(`${base}/${sessionId}/ciphertext`);
    await fetch(base, { method: 'POST', body: `{"bad":"${CANARY}"}` });
    await fetch(`http://127.0.0.1:${port}/${CANARY}`);
  } finally {
    child.kill();
    await exited;
  }

  assert.equal(stdout, `BabuşTV pairing relay listening on 127.0.0.1:${port}\n`);
  assert.equal(stderr.includes(CANARY), false);
  assert.equal(stderr.includes('provider_password'), false);
});
