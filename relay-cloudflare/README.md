# BabuşTV Pairing Relay on Cloudflare

The default public BabuşTV pairing relay: the shared relay core from [`relay/`](../relay/README.md) running inside one Cloudflare Durable Object, plus the phone pairing page served from the same `workers.dev` origin.

- Design: [`docs/superpowers/specs/2026-09-14-pairing-relay-cloudflare-design.md`](../docs/superpowers/specs/2026-09-14-pairing-relay-cloudflare-design.md)
- Hosting decision: [`docs/decisions/0003-pairing-relay-hosting.md`](../docs/decisions/0003-pairing-relay-hosting.md)

This package is intentionally **not** a root npm workspace, so the TV build and the main CI never install Wrangler.

## What runs where

| Path | Served by |
| --- | --- |
| `/v1/pairing/sessions[...]` | Worker → Durable Object `shard-0` (relay core, all state in memory) |
| `/babustv/` | static assets copied from `player/dist` (the phone opens `/babustv/#pairing=…`) |

Sessions, ciphertext and client addresses are never written to Durable Object storage; only an expiry alarm is stored. Worker logs and traces are disabled in `wrangler.jsonc`. Cloudflare itself still processes visitor IP addresses at its edge.

## Local checks (no Cloudflare account needed)

```bash
npm ci && npm run build          # repository root: builds player/dist
cd relay-cloudflare
npm ci
npm run typecheck
npm test                         # runs the Worker and Durable Object in local workerd
npm run build                    # wrangler dry-run bundle into ./dist
```

Set `WRANGLER_SEND_METRICS=false` in your environment to stop Wrangler's anonymous usage telemetry.

## Deploying (project owner)

Deploying creates public infrastructure under your Cloudflare account. Do it only when you intend the relay to be live.

1. Create a free Cloudflare account and, when prompted in **Workers & Pages**, choose a `workers.dev` subdomain. No payment method is required for the Free plan.
2. Build the phone page at the repository root: `npm ci && npm run build`.
3. In `relay-cloudflare/`: `npm ci`, then `npx wrangler login`. This opens the browser; approve access there. Never paste Cloudflare tokens into chats or commits.
4. Run `npm run deploy`. Wrangler prints the URL, for example `https://babustv-pairing-relay.<your-subdomain>.workers.dev`.
5. Check the deployment:
   - `curl -i -X OPTIONS https://babustv-pairing-relay.<your-subdomain>.workers.dev/v1/pairing/sessions` returns `204` with `access-control-allow-methods: GET, POST, OPTIONS`;
   - opening `https://babustv-pairing-relay.<your-subdomain>.workers.dev/babustv/` in a browser loads the BabuşTV page;
   - in the dashboard, the Worker's **Observability** settings show logs disabled.
6. Put the URL into [`player/public/pairing-config.js`](../player/public/pairing-config.js): `relayBaseUrl` is the bare origin and `phoneBaseUrl` is the same origin followed by `/babustv/`. TV and web builds load that file before the app starts.

The default BabuşTV deployment is `https://babustv-pairing-relay.babustv.workers.dev`. If Cloudflare assigned a subdomain derived from your e-mail address, change it under **Workers & Pages → Your subdomain** before publishing the URL.

Undo: `npx wrangler rollback` returns to the previous version; `npx wrangler delete` removes the Worker entirely.

## Free-plan limits to keep in mind

- 100,000 Worker requests and 100,000 Durable Object requests per day, reset at 00:00 UTC; excess requests fail rather than bill.
- A typical 30-second pairing costs about 17 relay requests with the recommended 2-second poll interval, plus one expiry alarm run and one written row; a pairing left open for the full 5 minutes costs about 152 requests. Loading the phone page also invokes the Worker once (a Tizen-only script path that is not an asset).
- **One busy client can use the whole daily budget.** About 1.2 requests per second from a single address exhausts it, and the relay then fails for everyone until 00:00 UTC. If that happens, add a Cloudflare WAF rate-limiting rule or move to a paid plan.
- Memory limits are sized for the 128 MB Durable Object (`src/limits.ts`): 2,000 live sessions and 4,000,000 characters of retained ciphertext; beyond them clients receive `503`.
- A Durable Object kept in memory all day uses about 11,059 of the 13,000 GB-s/day Free duration allowance.
- Evicting or restarting the Durable Object drops open pairings; users simply start pairing again.
- One object serves all clients. A distributed attacker with many addresses can still fill those limits and make pairing unavailable while the attack lasts.
