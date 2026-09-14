# BabuşTV Pairing Relay Server Design

**Date:** 2026-09-14
**Status:** Draft — awaiting owner review (independent review findings applied)
**Risk:** CRITICAL (public network service on the provider-credential pairing path)
**Parent spec:** `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md` §11
**Client contract (merged):** `player/src/pairing/relay-contracts.ts`, `player/src/pairing/relay-client.ts`

## 1. Problem

M6 merged the TV side, the phone side, the end-to-end encryption and a relay *client* contract. No relay *server* exists in the repository, and no build supplies `window.BABUSTV_PAIRING_CONFIG`, so the shipped TV package cannot offer phone pairing. The V1 spec requires "a default public relay plus a custom self-host relay endpoint. Both implement the same protocol."

## 2. Scope of this increment

Included:

- `relay/` workspace: a dependency-free TypeScript relay server;
- a platform-neutral core (routing, validation, rate limiting, HTTP mapping) over an atomic session store;
- an in-memory session store and in-memory rate limiter for single-instance hosting;
- a `node:http` adapter and CLI entry for self-hosting behind a TLS reverse proxy;
- a compatibility test that drives the merged player `PairingRelayClient` against the relay core;
- self-host documentation;
- CI wiring (`npm test`, `npm run typecheck`).

Excluded (separate, later increments):

- choosing and deploying the public relay host (owner decision; see §9);
- a hosted-platform adapter (for example a Cloudflare Durable Object store);
- hosting the phone page on HTTPS;
- supplying `BABUSTV_PAIRING_CONFIG` to TV/web builds;
- any change to player pairing code, crypto or protocol.

## 3. Protocol (frozen by the merged client)

```text
POST {base}/v1/pairing/sessions                    body {sessionId, expiresAtMs}
POST {base}/v1/pairing/sessions/{sessionId}/ciphertext   body {ciphertext}
GET  {base}/v1/pairing/sessions/{sessionId}/ciphertext   -> {status: pending|ready|expired|consumed}
```

The client treats any non-2xx response as `NETWORK`, accepts an empty 2xx body for POSTs, and requires poll bodies to be exactly `{status}` or `{status:'ready', ciphertext}`.

## 4. Session state machine

```text
(create) -> PENDING --put--> READY --take--> CONSUMED
              |                 |
              +---- now >= expiresAt ----> EXPIRED
```

| Request | Stored state | HTTP result | Transition |
| --- | --- | --- | --- |
| create | absent | `204` | new PENDING, `expiresAt = serverNow + 5 min` |
| create | any present record | `409` | none (no overwrite) |
| create | client already holds 10 live sessions | `429`, `Retry-After` until that client's oldest session expires | none |
| create | 50,000 live sessions | `503` | none |
| put | absent | `404` | none |
| put | PENDING, not expired | `204` | READY |
| put | expired | `410` | none |
| put | READY with the identical ciphertext (phone retry) | `204` | none |
| put | READY with different ciphertext, or CONSUMED | `409` | none |
| poll | absent | `404` | none |
| poll | PENDING, not expired | `200 {status:'pending'}` | none |
| poll | READY, not expired | `200 {status:'ready', ciphertext}` | CONSUMED; ciphertext dropped from memory |
| poll | expired (PENDING or READY) | `200 {status:'expired'}` | ciphertext dropped |
| poll | CONSUMED | `200 {status:'consumed'}` | none |

Decisions:

- **Server-owned TTL.** The client `expiresAtMs` is type-checked but never trusted: TV clocks can be skewed. The TV still enforces its own local expiry and single use (`player/src/pairing/session.ts`).
- **Tombstones.** Expired/consumed records keep only their status for a 10-minute grace window so a late poll receives `expired`/`consumed` instead of a `404`. Ciphertext is never retained in a tombstone. Tombstones do not count toward the live-session cap; at most 20,000 are kept and the oldest are evicted first (an evicted tombstone only turns a late poll into `404`).
- **Prompt expiry.** A periodic purge (every 10 s in the Node entry) converts expired live sessions into tombstones even when nobody polls again, so an abandoned ciphertext lives at most 5 minutes plus one purge interval.
- **Idempotent retry.** A phone whose first submit succeeded but whose response was lost can resend the same ciphertext and receive `204`.
- **Single delivery.** The first successful poll consumes the ciphertext. If that response is lost in transit, the user restarts pairing; the relay never re-delivers.
- **Atomicity.** Every transition is a single synchronous read-modify-write inside the store, so concurrent polls cannot both receive the ciphertext.

## 5. Validation and limits

- `sessionId`: `^[A-Za-z0-9_-]{16,64}$` (the TV generates 22 base64url characters from 16 random bytes).
- Request bodies: JSON objects with the exact key set; any extra key, wrong type or invalid JSON is `400`.
- `ciphertext`: non-empty string, at most 16,384 characters.
- Request body: at most 32 KiB, otherwise `413`.
- Session store: at most 50,000 live (PENDING/READY) sessions, otherwise create returns `503`; at most 10 live sessions per client key, otherwise `429`; at most 20,000 tombstones (oldest evicted). Live sessions are kept in expiry order, so expiry sweeps stop at the first unexpired session.
- Unknown path `404`; known path with wrong method `405`.

## 6. Abuse controls

Fixed-window, per-client-key rate limits (defaults, configurable in code):

| Bucket | Limit |
| --- | --- |
| create | 10 per minute |
| put | 20 per minute |
| poll | 120 per minute |
| miss (any `404` on a session path) | 30 per 10 minutes |

Exceeding a bucket returns `429` with `Retry-After`. The miss bucket makes session-ID probing expensive on top of the 128-bit random ID space.

Client key:

- IPv4 addresses (including every IPv4-mapped IPv6 form) are used as-is; IPv6 addresses are grouped by /64, since one subscriber usually controls a whole /64. Proxy-appended ports (`203.0.113.7:4711`, `[2001:db8::1]:443`) are stripped; anything that is not an IP falls back to the socket address.
- By default the key is the socket address and `X-Forwarded-For` is ignored.
- With `RELAY_TRUSTED_PROXY_HOPS=N`, the key is the N-th address from the right of `X-Forwarded-For`, i.e. the address appended by the outermost trusted proxy. The leftmost entry is never trusted because common proxies preserve client-supplied values there.
- The rate-limit table holds at most 100,000 windows; when full it evicts the oldest window in constant time instead of scanning or denying new clients.

Accepted residual risks, documented for operators:

- whoever learns a session ID (the QR is visible on the TV screen) can race a ciphertext in before the phone; the TV then decrypts nothing (wrong key) or the attacker's own provider data, and the user sees a failure or an unexpected provider;
- a poll by a third party consumes the payload (denial of service, no disclosure: the payload is encrypted to the TV key);
- in-memory state is lost on restart; open pairings fail and are retried;
- carrier-grade NAT can make unrelated users share one client key, so a busy or abusive neighbour can exhaust a shared bucket or the per-client session cap;
- a distributed attacker with thousands of addresses (for example many /64s from one IPv6 /48) can still exhaust the live-session store or churn the rate-limit table; a public deployment should add host- or CDN-level protection;
- any `4xx` from the relay is reported by the merged client as a generic network failure, so the TV stops polling and the user restarts pairing. Clients should poll no faster than once per second (2 s recommended) to stay well inside the 120/min poll limit.

## 7. HTTP surface

- CORS: `Access-Control-Allow-Origin: *`, no credentials. The protocol carries no cookies or ambient authority, the phone page and the Tizen widget have different and partly unknown origins, and CORS does not restrict non-browser clients anyway.
- Preflight `OPTIONS` on protocol paths: `204` with `GET, POST, OPTIONS` and `Content-Type`.
- Every response: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; JSON bodies use `application/json; charset=utf-8`.
- Error bodies are fixed `{error:'<code>'}` strings and never echo request data.
- Node adapter: 3 s deadline to receive a request body (`408`, connection closed), 5 s headers timeout and 10 s request timeout, enforced on a 1 s check interval (Node defaults to 30 s), and at most 2,048 concurrent connections.

## 8. Privacy invariants

- No request, body, session ID, ciphertext, IP address or header is logged. The server prints only a fixed startup line with the listening port.
- Ciphertext exists only in process memory, only while READY, and at most 5 minutes plus one purge interval.
- Client keys (IP addresses or /64 prefixes) are held in memory only, for rate limiting and the per-client session cap, and never written anywhere.
- The relay never decrypts, validates or contacts Xtream/M3U providers.
- HTTPS is terminated by the operator's reverse proxy (the player client refuses non-HTTPS relay URLs). Any public claim about IP/log retention must describe the actual deployed host, not this code alone.

## 9. Public hosting decision (open)

The in-memory store is correct only for one process. A hosted public relay needs either one always-on instance (VPS/container) or a platform store with per-session serialization (for example a Cloudflare Durable Object). The choice changes cost, account ownership, logging behavior and maintenance, so it is an owner decision: `docs/decisions/0003-pairing-relay-hosting.md` selects Cloudflare Workers with a Durable Object store, with this Node relay as the self-host path and fallback.

## 10. Verification

- Unit tests for the state machine, validation, limits, rate limiter, tombstones and purge, all with injected clocks.
- Compatibility tests: the merged `PairingRelayClient` completes create -> put -> poll(ready) -> poll(consumed) against the relay core, and surfaces `expired`.
- Node adapter tests over real loopback HTTP: CORS preflight, 413, 405, headers, trust-proxy keying, no console output.
- Root `npm test`, `npm run typecheck`, `npm run build`, `npm run brand:check`, security audit script.
- Independent review before any PR is marked ready.
