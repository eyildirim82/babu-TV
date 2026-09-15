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

## Deployment record (owner, 2026-09-14/15)

- The owner created a Cloudflare account and ran `npx wrangler login` and `npm run deploy` from a clean `main@36264ec` worktree. Wrangler 4.131.2 reported bindings `RELAY` (Durable Object) and `ASSETS`, version `1c2adf63-23bf-4a47-8a89-fdc8d96cd262`.
- Cloudflare had auto-assigned an e-mail-derived `workers.dev` subdomain. The owner renamed it to `babustv`, and the old hostname stopped resolving (curl DNS failure, exit 6).
- Live checks against `https://babustv-pairing-relay.babustv.workers.dev` with synthetic data only:
  - preflight `204` with `GET, POST, OPTIONS`;
  - phone page `/babustv/` `200 text/html`, with its bundle served;
  - unknown session `404`;
  - create `204` → put `204` → poll `ready` → poll `consumed`, with `no-store`, `nosniff`, `no-referrer` and CORS headers.
- Not observed: the dashboard Observability setting. The deployed configuration disables logs, but no one has looked at the dashboard yet.

## Default pairing config (`feature/pairing-default-relay-config`)

| Gate | Result | Notes |
| --- | --- | --- |
| RED | FAIL as expected | 4 new `PAIR-CFG` tests failed before `player/public/pairing-config.js` and the script tag existed |
| `PAIR-CFG` tests | 4/4 PASS | classic script before the app entry; whitelist-only keys; HTTPS same-origin relay and `/babustv/` phone page; 2 s poll; never overrides an earlier value; ES5-only syntax |
| Web build | PASS | `dist/index.html` loads `/babustv/pairing-config.js` before `/babustv/assets/index.*.js` |
| `npm run tizen:build` | PASS | staged `index.html` loads `./pairing-config.js`; the stage absolute-path guard passed |
| rc-browser suite (all packs, local cached Chromium) | 76/76 PASS | fixtures that inject their own pairing config keep it |
| Live end-to-end pairing | PASS | local TV build with the default config → live relay → **deployed** phone page on Cloudflare (M3U) → TV decrypted and registered the provider and reached Home 2.5 s after the phone submitted. The TV made 4 relay requests (3 polls). Relay bodies held only the envelope keys `algorithm, ciphertext, iv, senderPublicKey, version`. The playlist URL and synthetic canaries never appeared in relay traffic. The M3U playlist itself was a harness mock in the TV browser context. |

Not claimed: pairing on a physical Samsung TV or a real phone camera scanning the QR.
