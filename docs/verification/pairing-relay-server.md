# Pairing Relay Server — Verification Record

**Branch:** `feature/pairing-relay-server`
**Base:** `main@3f86fa4` (post-merge verify `34866709641` SUCCESS)
**Design:** `docs/superpowers/specs/2026-09-14-pairing-relay-server-design.md`
**Risk:** CRITICAL — public network service on the provider-credential pairing path

## Why

M6 closed with TV/phone pairing, encryption and a relay client contract, but no relay server exists and no build supplies `BABUSTV_PAIRING_CONFIG` (it is set only by `tools/rc-browser/fixtures/pack-c-security-pairing.mjs`). Shipped packages therefore cannot offer phone pairing.

## Scope delivered

- `relay/` workspace, no runtime dependencies: core, in-memory atomic session store, fixed-window rate limiter, `node:http` adapter, CLI entry, self-host README.
- Root `test`/`typecheck` include the relay; `relay:build`/`relay:start` scripts; CI builds the relay; `relay/dist/` ignored.
- No change to player source, pairing crypto, protocol or Tizen packaging.

## Evidence

| Gate | Result | Notes |
| --- | --- | --- |
| RED | FAIL as expected | `npm run test -w relay` before implementation: `ERR_MODULE_NOT_FOUND` for `relay-core.js`, `memory-session-store.js`, `node-server.js` |
| Relay tests (round 1) | 36/36 PASS | store, rate limiter, core, merged-client compatibility, real-loopback Node adapter |
| RED (review fixes) | FAIL as expected | 15 failing tests plus `normalizeClientAddress` export missing, before the fixes |
| Relay tests (after review fixes) | 48/48 PASS | adds per-client cap, tombstone bound, purge-drops-ciphertext, idempotent put, trusted-hop keying, IPv6 /64, streamed 413, mid-body abort, slow-headers timeout, spawned-process output silence |
| RED (round-2 fixes) | FAIL as expected | store/core tests for per-client Retry-After and new defaults failed; new node-server tests (body deadline, port/bracket/hex-mapped addresses) failed against the previous implementation |
| Relay tests (after round-2 fixes) | 50/50 PASS | adds accurate per-client Retry-After, expiry-ordered sweep, body deadline 408, address port stripping |
| RED (round-3 fix) | FAIL as expected | swept-client regression test returned `full` instead of `client_limit` |
| Relay tests (final) | 51/51 PASS | |
| `npm test` (full chain, final) | PASS | 68 + 637 + 51 tests, LF checkout |
| `npm run typecheck` | PASS | player + relay |
| `npm run build` | PASS | player bundle unchanged in scope |
| `npm run relay:build` | PASS | emits `relay/dist` |
| `npm run brand:check` | PASS | 151 surfaces clean |
| `tools/check-m7-security-privacy.mjs` | PASS | source/privacy scan clean |
| Built-process smoke (final build) | PASS | `PORT=18787 RELAY_BASE_PATH=/relay node dist/main.js`: create 204, poll pending, put 204, poll ready, poll consumed, preflight CORS headers; process output is only the startup line |

Local environment note: in the Windows `core.autocrlf=true` checkout, four pre-existing source-text tests fail (`babustv-copy.test.js` copy.d.ts shape; three `pairing-browser-app-dependencies.test.ts` assertions) because files are materialized with CRLF. The unmodified files are LF in Git. The full chain was therefore re-run in a `core.autocrlf=false` worktree with the identical diff, where every test passed. CI (Linux) remains authoritative.

## Review

Independent review round 1 (read-only agent that did not write the code) found no ciphertext leak, double delivery, overwrite, CORS or logging defect, and reported:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Important | Store could be filled (tombstones counted, full-address IPv6 keys) so all creates got 503 | Live sessions separated from tombstones; 5 live sessions per client key; 20k tombstones, oldest evicted; IPv6 grouped by /64 |
| 2 | Important | Abandoned READY ciphertext survived `purge` for up to 15 minutes | `purge` expires live sessions and drops ciphertext; Node entry purges every 10 s |
| 3 | Important | Trust-proxy used the spoofable leftmost `X-Forwarded-For` entry | `RELAY_TRUSTED_PROXY_HOPS=N` takes the N-th entry from the right; invalid values fall back to the socket |
| 4 | Important | Full rate-limit table scanned on every new key and denied new clients | No request-path purge; O(1) oldest-window eviction |
| 5 | Minor | Node enforced timeouts only every 30 s; no connection cap | `connectionsCheckingInterval` 1 s, `maxConnections` 2,048, real slow-headers test |
| 6 | Minor | Relay rejections end pairing; lost put response caused a false error | Identical-ciphertext retry returns 204; 2 s poll interval documented; miss-bucket-first kept and documented as a CGNAT residual risk |
| 7 | Minor | Streamed 413, abort path and process stdout/stderr untested | Tests added |

Round 2 (fix verification, with probes and a 300k-operation fuzz showing no per-client counter drift) closed findings 2, 5, 6 and 7 and partly closed 1, 3 and 4. It raised further items, resolved as follows:

| Item | Resolution |
| --- | --- |
| 2,000 addresses x 5 sessions could still fill 10k live slots | Defaults raised to 50,000 live sessions, 10 per client; distributed exhaustion documented as a residual risk requiring host/CDN protection |
| Store-full and client-cap paths scanned all live sessions | Expiry-ordered sweep stops at the first unexpired session; the client-cap path checks only that client's sessions |
| `ip:port`, `[v6]:port` and hex IPv4-mapped addresses mis-keyed | Ports/brackets stripped; every IPv4-mapped form maps to IPv4 |
| Slow-body connections could hold all slots | 3 s body deadline (408, socket closed); Caddy example uses `request_buffers` (verified in Caddy docs) |
| Per-client 429 advertised a wrong Retry-After | Retry-After derived from the client's oldest live session expiry |
| Rate-limit window churn by ~50k fresh /64s | Accepted and documented (low impact) |

Round 3 (delta verification, including a 300k-operation fuzz with steady and backwards-stepping clocks, a Retry-After probe and 20 concurrent slow-body clients) confirmed the round-2 fixes and judged the change acceptable for a Draft PR. It found one Minor bug: a store-full sweep could retire a client's last session and leave the new session untracked, allowing the per-client cap to be exceeded. Fixed test-first (RED: `full` instead of `client_limit`). Its optional suggestion was also applied: the Node entry now uses a monotonic clock.

## Not claimed

- No public relay is deployed; no hosting account, domain or TLS endpoint exists.
- No TV or phone has paired through this server; compatibility is proven in-process against the merged client and over loopback HTTP only.
- Rate limiting is per process and per client address; carrier-grade NAT can make unrelated users share a bucket.

## Open decisions and next increments

1. Public relay hosting — decided in `docs/decisions/0003-pairing-relay-hosting.md`: Cloudflare Workers + Durable Objects; next increment is the Durable Object store and Worker entry.
2. Host the phone page over HTTPS.
3. Supply `BABUSTV_PAIRING_CONFIG` (relay URL, phone URL, timeout, poll interval) to TV/web builds; choose a poll interval well under the 120/min poll limit.
4. Physical-TV pairing smoke once a relay and phone page are live.
