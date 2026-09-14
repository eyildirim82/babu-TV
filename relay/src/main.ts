import { DEFAULT_RELAY_LIMITS } from './limits.js';
import { MemoryRelayRateLimiter } from './memory-rate-limiter.js';
import { MemoryRelaySessionStore } from './memory-session-store.js';
import { createRelayNodeServer, readRelayServerConfig, type RelayServerConfig } from './node-server.js';
import { createRelayCore } from './relay-core.js';

// Bounds how long an abandoned ciphertext can outlive its 5-minute TTL.
const PURGE_INTERVAL_MS = 10_000;

// Relay timing is relative only; a monotonic clock keeps TTLs and sweeps correct across wall-clock steps.
const monotonicNowMs = (): number => performance.timeOrigin + performance.now();

let config: RelayServerConfig;
try {
  config = readRelayServerConfig(process.env);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Invalid relay configuration.'}\n`);
  process.exit(1);
}

const store = new MemoryRelaySessionStore(DEFAULT_RELAY_LIMITS);
const rateLimiter = new MemoryRelayRateLimiter(DEFAULT_RELAY_LIMITS.rateLimits);
const core = createRelayCore({
  store,
  rateLimiter,
  nowMs: monotonicNowMs,
  limits: DEFAULT_RELAY_LIMITS,
  basePath: config.basePath,
});
const server = createRelayNodeServer({
  core,
  maxBodyBytes: DEFAULT_RELAY_LIMITS.maxBodyBytes,
  trustedProxyHops: config.trustedProxyHops,
});

const purgeTimer = setInterval(() => {
  const nowMs = monotonicNowMs();
  store.purge(nowMs);
  rateLimiter.purge(nowMs);
}, PURGE_INTERVAL_MS);
purgeTimer.unref();

server.listen(config.port, config.host, () => {
  process.stdout.write(`BabuşTV pairing relay listening on ${config.host}:${config.port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    clearInterval(purgeTimer);
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
