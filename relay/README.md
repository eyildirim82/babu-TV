# BabuşTV Pairing Relay

A small, dependency-free HTTP service that lets the BabuşTV phone page hand an **encrypted** provider payload to a TV. The relay only ever sees ciphertext encrypted to the TV's one-time key; it cannot read provider credentials and never contacts providers.

Design: [`docs/superpowers/specs/2026-09-14-pairing-relay-server-design.md`](../docs/superpowers/specs/2026-09-14-pairing-relay-server-design.md)

## Protocol

```text
POST /v1/pairing/sessions                         {sessionId, expiresAtMs}  -> 204
POST /v1/pairing/sessions/{sessionId}/ciphertext  {ciphertext}              -> 204
GET  /v1/pairing/sessions/{sessionId}/ciphertext  -> {status: pending|ready|expired|consumed}
```

Sessions live 5 minutes (server clock), accept one ciphertext, and deliver it once.

## Self-hosting

Requirements: Node.js 22 or newer, and a reverse proxy that provides HTTPS. The TV and phone clients refuse plain-HTTP relay URLs.

```bash
npm ci
npm run relay:build
PORT=8787 npm run relay:start
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | Listening port |
| `RELAY_HOST` | `127.0.0.1` | Listening address; keep loopback when a local reverse proxy fronts the relay |
| `RELAY_BASE_PATH` | empty | Serve under a path prefix, for example `/relay` |
| `RELAY_TRUSTED_PROXY_HOPS` | `0` | Number of reverse proxies in front of the relay that append to `X-Forwarded-For`. `0` ignores the header; `1` uses the rightmost address (a single proxy such as Caddy or nginx with `$proxy_add_x_forwarded_for`). Never set it higher than the proxies you actually run, or clients can choose their own rate-limit identity |

Example Caddy site (Caddy obtains the TLS certificate and does not write access logs unless configured to):

```text
relay.example.com {
  reverse_proxy 127.0.0.1:8787 {
    request_buffers 32KiB
  }
}
```

`request_buffers` makes Caddy receive small request bodies before forwarding them, so slow uploads occupy Caddy connections rather than relay connections.

Start the relay with `RELAY_TRUSTED_PROXY_HOPS=1` in this setup.

## Operating notes

- **State is in memory and single-process.** Do not run several instances behind a load balancer; a restart drops open pairings, which users simply retry.
- **Rate limits** per client address (IPv6 grouped by /64): 10 session creates/min, 10 open sessions at a time, 20 submits/min, 120 polls/min, and 30 unknown-session hits per 10 min. Exceeding them returns `429` with `Retry-After`. Configure clients to poll every 2 seconds; anything faster than once per second risks hitting the poll limit.
- **Shared addresses:** users behind the same carrier-grade NAT share these limits.
- **Logging:** the relay prints one startup line and nothing per request. Your reverse proxy, host or CDN may still log IP addresses and paths (paths contain the short-lived session ID, never the payload). Describe the real deployment when you publish a privacy statement.
- **Not a DDoS shield:** an attacker controlling thousands of addresses can still exhaust the in-memory limits. Put a public relay behind host- or CDN-level protection.
- **Known limits:** anyone who can see the QR code on the TV screen can race a payload in or consume it first. The payload stays encrypted to the TV, so the result is a failed or unexpected pairing, not a credential disclosure.
