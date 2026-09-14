# BabuşTV Pairing Relay on Cloudflare — Design

**Date:** 2026-09-14
**Status:** Draft
**Risk:** CRITICAL (public network service on the provider-credential pairing path)
**Decision:** `docs/decisions/0003-pairing-relay-hosting.md`
**Relay design:** `docs/superpowers/specs/2026-09-14-pairing-relay-server-design.md`

## 1. Goal

Run the merged relay core as BabuşTV's default public relay on Cloudflare Workers Free, and serve the phone pairing page from the same origin over HTTPS, without changing the relay protocol, its semantics or its privacy invariants.

## 2. Scope

Included:

- `relay-cloudflare/`: a standalone package (not a root workspace) containing a Worker entry, one Durable Object class, Wrangler configuration, Workers-runtime tests and an owner deployment guide;
- a pure-TypeScript client-address normalizer in `relay/src/` (the Worker runtime has no `node:net`), plus a shared preflight response;
- a CI workflow that runs the Cloudflare tests and a Wrangler dry-run build without credentials.

Excluded:

- creating a Cloudflare account or deploying (owner actions);
- `BABUSTV_PAIRING_CONFIG` wiring into TV/web builds (next increment, needs the real `workers.dev` hostname);
- any player, protocol, crypto or Tizen change.

## 3. Architecture

```text
phone / TV ──HTTPS──> Worker (fetch)
                        ├─ /v1/pairing/sessions[...]  -> RelayShard "shard-0" (RPC handle)
                        │                                 └─ createRelayCore + MemoryRelaySessionStore + MemoryRelayRateLimiter
                        └─ other paths                 -> static assets (player build: /babustv/ phone route)
```

- **One Durable Object instance** (`getByName("shard-0")`) runs the entire relay core. The protocol's put/poll requests carry only the session ID, so any sharding would make per-client and global caps approximate; one instance keeps every limit exact and every transition atomic (single-threaded object, synchronous store operations). Expected load (about 1 request/s at the full Free allowance) is far below one object's documented capacity.
- **State stays in memory.** The existing in-memory store and limiter run unchanged inside the object. No session, ciphertext or client address is written to Durable Object storage, which preserves the relay invariant "ciphertext exists only in process memory". If Cloudflare evicts or restarts the object, open pairings are lost and users retry — the same trade-off as restarting the Node relay. An active pairing keeps the object alive because the TV polls every 2 s.
- **Rate limiting** uses the existing in-memory limiter. The Workers Rate Limiting binding is not used: its Free-plan availability is unverified, it has no peek operation and supports only 10/60 s windows.
- **One RPC per relay request.** The Worker answers preflight, non-relay paths and oversized bodies itself, so those never bill a Durable Object request. Every other request under `/v1/pairing/sessions` — including ones the core rejects with `404`, `405` or `429` — is one Durable Object request.
- **Memory limits sized for 128 MB.** The object uses `CLOUDFLARE_RELAY_LIMITS`: 2,000 live sessions, 5,000 tombstones, a 4,000,000-character budget for retained ciphertext (`503` when exhausted) and 20,000 rate-limit windows. The VPS defaults would let a distributed client exhaust the object's memory and reset it; the Free daily request budget cannot sustain more than a few hundred concurrent pairings anyway.

## 4. Worker behaviour

| Request | Handling |
| --- | --- |
| path not starting with `/v1/pairing/sessions` | delegated to the static asset binding; unmatched paths (including `/v1/pairing`) get the asset layer's plain `404` |
| `OPTIONS` on a relay path | shared preflight response, no Durable Object call |
| declared `Content-Length` above 32 KiB, or a streamed body exceeding it | `413`, no Durable Object call; the stream is read with a byte cap, never fully buffered |
| any other relay request | `stub.handle({method, path, clientKey, body})` |
| Durable Object call throws | fixed `503 {error:'unavailable'}` |

Client key: `CF-Connecting-IP`, normalized like the Node relay (IPv4 as-is, IPv6 grouped by /64). `X-Forwarded-For` is ignored.

## 5. Expiry without a timer

Workers have no background interval. The object purges on requests at most every 10 s, and schedules one Durable Object alarm for the earliest live-session expiry (rounded up to a 10 s granularity) whenever live sessions exist. The alarm purges and re-arms while sessions remain. This keeps abandoned ciphertext bounded to about 5 minutes plus 10 seconds even when no further requests arrive, at the cost of at most one alarm run per 10 s (each alarm is one Durable Object request and one written row). The alarm is not deleted when a ciphertext is taken early, so a completed pairing still costs one later alarm run.

## 6. Privacy and configuration

- `observability.enabled = false` and invocation logs disabled before the first deploy; the code never calls `console`.
- Cloudflare still processes client IP addresses at its edge; the public privacy statement must say so.
- `workers_dev = true`; `preview_urls = false`.

## 6a. Accepted Free-plan risks

- **Single-client quota exhaustion.** About 1.2 requests per second from one client uses the whole daily Free budget of Worker and Durable Object requests; the relay then fails for everyone until 00:00 UTC. The in-object rate limiter cannot prevent this because rejected requests are still billed. Mitigation, if it happens: add a Cloudflare WAF rate-limiting rule or move to a paid plan.
- **Distributed memory pressure** is bounded by the limits above; beyond them clients receive `503` rather than resetting the object.
- **Phone page loads** also request `/babustv/$WEBAPIS/webapis/webapis.js` (a Tizen-only script referenced by the player's `index.html`), which misses the asset layer and invokes the Worker once per load.
- **Durable Object duration.** One object kept in memory all day uses about 11,059 of the 13,000 GB-s/day Free allowance; eviction when idle lowers this.

## 7. Verification

- Workers-runtime tests (`@cloudflare/vitest-plugin`, local Miniflare/workerd, no account):
  - full pairing flow through the Worker;
  - the merged `PairingRelayClient` + `FetchPairingRelayTransport` against the Worker;
  - preflight and non-relay paths without Durable Object calls;
  - declared and streamed `413`;
  - `CF-Connecting-IP` keying with `X-Forwarded-For` ignored;
  - alarm scheduling and ciphertext purge using an injected clock;
  - eviction losing in-flight sessions;
  - static phone page served under `/babustv/`.
- Node tests prove the pure address normalizer matches `node:net` validation on valid and invalid samples.
- Wrangler `deploy --dry-run` bundles the Worker without credentials.
- Independent review before a PR is marked ready.
