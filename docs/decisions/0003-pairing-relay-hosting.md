# ADR 0003 — Public Pairing Relay Hosting

**Status:** Accepted by the owner on 2026-09-14; adapter implementation and deployment pending

## Context

The V1 spec requires a default public pairing relay plus a self-host option using the same protocol. `relay/` provides a dependency-free relay whose state is in memory and valid for one process (`docs/superpowers/specs/2026-09-14-pairing-relay-server-design.md`). A public relay also needs the phone pairing page served over HTTPS.

Constraints: a single maintainer, near-zero cost, minimal operations, very low expected traffic, and privacy claims that must match the real host.

A pairing costs 1 create, 1 submit and one poll per interval until completion. With a 2 s interval that is about 17 requests for a 30 s pairing and up to about 152 requests if the full 5-minute TTL is used.

Facts checked on 2026-09-14 from first-party pages:

| Option | Cost | Relevant limits | Operations |
| --- | --- | --- | --- |
| Cloudflare Workers Free + Durable Objects (SQLite) | $0 | 100,000 Worker requests/day; 10 ms CPU/request; Durable Objects on Free use the SQLite backend with 100,000 requests/day and 5 GB storage; operations fail rather than bill when limits are exceeded; `*.workers.dev` needs no domain; static asset requests are free | No servers; configuration only |
| Hetzner CX23 VPS | €5.49/month plus €0.50 IPv4, excluding VAT | 2 vCPU, 4 GB RAM, 20 TB EU traffic | OS updates, TLS, firewall and abuse handling owned by the maintainer |
| Fly.io shared-cpu-1x 256 MB | about $2.02/month; card required; no free allowance | Always-on container | Container deploys and upkeep |
| Render Free | $0 | Sleeps after 15 minutes idle, about one minute to wake, may restart at any time | Unsuitable for interactive pairing |
| Vercel Hobby + Upstash Redis Free | $0 | Hobby is non-commercial only; Upstash Free allows 500,000 commands/month | Tight command budget for polling |

Unverified at decision time: whether the Workers Rate Limiting binding is available on the Free plan, and exactly which request metadata Workers invocation logs contain. New Workers have observability enabled by default. Cloudflare processes visitor IP addresses at its edge regardless of Worker configuration.

Sources:

- `https://developers.cloudflare.com/workers/platform/limits/`
- `https://developers.cloudflare.com/workers/platform/pricing/`
- `https://developers.cloudflare.com/durable-objects/platform/pricing/`
- `https://developers.cloudflare.com/durable-objects/platform/limits/`
- `https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/`
- `https://developers.cloudflare.com/workers/configuration/routing/workers-dev/`
- `https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/`
- `https://developers.cloudflare.com/workers/observability/logs/workers-logs/`
- `https://www.cloudflare.com/privacypolicy/`
- `https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/`
- `https://fly.io/docs/about/pricing/`
- `https://render.com/docs/free`
- `https://vercel.com/docs/plans/hobby`
- `https://upstash.com/pricing/redis`

## Decision

1. The default public relay runs on **Cloudflare Workers Free with a Durable Object store**, initially on a `*.workers.dev` hostname.
2. The phone pairing page is served from the same Cloudflare account as static assets over HTTPS.
3. The relay core, validation and protocol stay shared with `relay/`; the Cloudflare deployment adds a Durable Object–backed session store and a Worker entry, and must pass the same relay and client-compatibility tests.
4. Workers observability/invocation logs are disabled in the deployment configuration.
5. The Node relay remains the supported self-host path.
6. The Cloudflare account is owned by the project owner. Creating the account, deploying and changing DNS are owner-approved actions.

## Consequences

- One more increment is needed before the public relay exists: the Durable Object store and Worker entry, local verification, phone page hosting, and the TV/web `BABUSTV_PAIRING_CONFIG` wiring.
- Rate limiting uses the Workers Rate Limiting binding only if it is confirmed on the Free plan; otherwise limits are enforced inside Durable Objects, and that request cost counts against the daily Durable Object budget.
- At the full 100,000 requests/day, the Free plan supports roughly 650 worst-case or several thousand typical pairings per day. Excess requests fail until the daily reset rather than incurring charges.
- The public privacy statement must say that Cloudflare processes IP addresses at its edge, even with Worker logs disabled.

## Revisit when

- the Rate Limiting binding is unavailable and Durable Object–based limiting would exhaust the free budget;
- daily Free limits are reached in practice;
- Workers logging cannot be disabled to match the privacy statement;
- Cloudflare changes `workers.dev` or Durable Object Free-plan terms.

The fallback is running `relay/` unchanged on a small VPS behind Caddy.

## Implementation note (2026-09-14)

`relay-cloudflare/` implements this decision with one refinement recorded in `docs/superpowers/specs/2026-09-14-pairing-relay-cloudflare-design.md`: the relay core and its existing in-memory store and limiter run inside a single Durable Object instance, and Durable Object storage holds only the expiry alarm. Sessions, ciphertext and client addresses are therefore never written to Cloudflare storage, matching the relay's "ciphertext only in process memory" invariant; eviction drops open pairings. The Workers Rate Limiting binding is not used (Free-plan availability still unverified; no peek or long windows).
