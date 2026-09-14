# Pairing Relay on Cloudflare — Verification Record

**Branch:** `feature/pairing-relay-cloudflare`
**Base:** `main@9c28e85` (post-merge verify `34887479016` SUCCESS)
**Design:** `docs/superpowers/specs/2026-09-14-pairing-relay-cloudflare-design.md`
**Risk:** CRITICAL — public network service on the provider-credential pairing path

## Scope delivered

- `relay-cloudflare/` (standalone package): Worker entry, `RelayShard` Durable Object running the shared relay core in memory, expiry alarm, static phone page under `/babustv/`, Wrangler config with logs and traces disabled, owner deployment guide.
- `relay/`: pure `client-address.ts` (no `node:net`), shared `relayPreflightResponse`, `nextLiveExpiryMs` on the memory store.
- Fix to merged code: `relay/src/memory-rate-limiter.ts` contained three literal NUL bytes as its key separator (introduced by #144), which made Git treat the file as binary. Replaced with a visible `|` separator and guarded by a test.
- CI workflow `relay-cloudflare` (Node 22, local workerd, Wrangler dry run, no credentials).

## Tooling (installed and inspected, not assumed)

| Package | Version |
| --- | --- |
| `wrangler` | 4.131.2 |
| `@cloudflare/vitest-plugin` | 1.1.9 (peer: Vitest ^4.1.0) |
| `vitest` | 4.1.11 |
| `@cloudflare/workers-types` | 5.20260914.1 |

`relay-cloudflare/node_modules` is about 265 MB on Windows, which is why the package is not a root workspace.

## Evidence

| Gate | Result | Notes |
| --- | --- | --- |
| RED `relay` normalizer/preflight | FAIL as expected | `client-address.js` module missing |
| RED NUL-byte guard | FAIL as expected | `memory-rate-limiter.ts` flagged before the fix |
| RED `nextLiveExpiryMs` | FAIL as expected | method missing |
| RED Worker suites | FAIL as expected | `src/worker.ts` could not be resolved |
| RED static phone page | FAIL as expected | `SELF.fetch` bypasses the asset router (probe: 404 JSON from the Worker, no `ASSETS` binding); fixed by delegating non-relay paths to `env.ASSETS` |
| RED ciphertext memory budget | FAIL as expected | store budget, default value and core `503` tests failed before the change |
| RED Cloudflare memory limits | FAIL as expected | `src/limits.ts` missing |
| Alarm re-arm test mutation check | FAIL with the bug, PASS without | removing `scheduledAlarmMs = null` from `alarm()` makes the test fail; source restored |
| `relay` tests | 59/59 PASS | normalizer validity matches `node:net` `isIP` on 31 valid/invalid samples |
| `relay-cloudflare` tests | 10/10 PASS | pairing flow; merged `PairingRelayClient` + `FetchPairingRelayTransport`; `CF-Connecting-IP` keying with `X-Forwarded-For` ignored; alarm scheduled within TTL..TTL+10 s, purges ciphertext and re-arms for a later session; Cloudflare memory limits in effect; eviction loses sessions; preflight/unknown/declared and streamed 413 without any Durable Object id; phone page served; failing object call → fixed 503 |
| `relay-cloudflare` typecheck | PASS | |
| Wrangler dry run | PASS | bundle 20.9 KiB; bindings `RELAY` (Durable Object) and `ASSETS`; no warnings; bundle contains no `console.` and no `node:` imports |

## Review

Independent review round 1 (read-only reviewer; probes and a 600,000-case normalizer fuzz against the previous `node:net` version) found no Critical issue and judged the change acceptable for a Draft PR:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Important | VPS-sized limits let 400 IPv6 /64 keys fill ~126 MB of the 128 MB object, resetting it | Shared `maxRetainedCiphertextChars` budget (`503` when exhausted); `CLOUDFLARE_RELAY_LIMITS`: 2,000 live sessions, 5,000 tombstones, 4 M ciphertext chars, 20,000 limiter keys; tests |
| 2 | Important | One client at ~1.2 req/s exhausts the Free daily budget; design overstated Worker-side filtering | Documented as an accepted Free-plan risk with mitigation; design §3 corrected |
| 3 | Minor | Unmatched non-relay paths return the asset layer's plain 404, not the documented JSON | Design §4 corrected |
| 4 | Minor | README cost figures omitted alarm runs, the Tizen-only script request and duration budget | README and design updated |
| 5 | Minor | Alarm test would not catch a stale `scheduledAlarmMs` | Re-arm test added and mutation-checked |
| 6 | Minor | CI path filters missed root `package.json`/`package-lock.json` | Added |

Also confirmed sound by the reviewer: nothing stored or logged, `CF-Connecting-IP` keying, Durable Object gates (no double delivery), bounded body reader, meaningful zero-object test, assets contain only the player build, lockfile carries Linux binaries for credential-free CI. The single normalizer fuzz mismatch (`1.2.3.4%eth0`) is not a valid address and never arrives from Cloudflare or a Node socket.

## Not claimed

- Nothing is deployed; no Cloudflare account, `workers.dev` hostname or live endpoint exists.
- Free-plan limits and logging behaviour are taken from Cloudflare documentation (ADR 0003), not observed on a live account.
- Durable Object eviction timing and real-world restart frequency are not measured.
