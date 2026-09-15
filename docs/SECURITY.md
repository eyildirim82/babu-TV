# SECURITY — BabuşTV

> **Updated:** 2026-09-15 · Replaces the inherited EN TV Player security note.
> **Posture:** standalone TV client with no BabuşTV account or cloud sync; the only BabuşTV-operated service is the optional phone-pairing relay, which carries ciphertext only.

---

## 1. Trust boundaries

```text
[User + remote] ── [TV app] ── HTTPS/HTTP ── [IPTV provider: Xtream API, M3U, EPG, streams]
                      │
                      ├── WidgetData (provider credentials)
                      ├── IndexedDB (catalog, EPG, favorites, watch state)
                      ├── localStorage (preferences)
                      │
                      └── HTTPS ── [pairing relay] ── HTTPS ── [phone browser: pairing page]
```

- **Trusted:** the user, their TV and, during pairing, their phone.
- **Untrusted:** provider responses (playlists, EPG, API data, streams), the network, and the pairing relay operator.

## 2. Data on the TV

| Data | Storage | Notes |
| --- | --- | --- |
| Provider credentials (Xtream password, credential-bearing M3U URLs) | Samsung WidgetData via `CredentialStore` | Never in IndexedDB/localStorage; fails closed if WidgetData is unavailable ([ADR 0002](decisions/0002-tizen-credential-storage.md)) |
| Provider records, channel catalog, EPG | IndexedDB | Rebuildable provider cache; no secrets |
| Favorites, last/frequently watched | IndexedDB | Provider-scoped user state; deleted with the provider |
| Preferences, update-check consent, What's New marker | localStorage | No credentials |

Deleting a provider removes its credential, cache and provider-scoped user state.

## 3. Phone pairing

- For each pairing the TV creates a single-use session and an ephemeral ECDH P-256 key pair whose private key is non-extractable.
- The QR code contains only the session ID, expiry, the TV public key and the relay URL.
- The phone page encrypts the provider data in the browser for that TV key (ECDH P-256 + AES-GCM) and submits only the ciphertext envelope.
- The TV decrypts locally, validates the provider and stores credentials through `CredentialStore`.
- Relay invariants (`relay/`, `relay-cloudflare/`):
  - ciphertext only, delivered once;
  - 5-minute server-side lifetime;
  - per-client rate limits and memory bounds;
  - fixed error bodies;
  - no request, body, session or address logging;
  - no session data written to persistent storage.
- The default relay runs on Cloudflare ([ADR 0003](decisions/0003-pairing-relay-hosting.md)). Worker logs and traces are disabled in its configuration, but Cloudflare processes client IP addresses at its edge like any hosted service.
- Accepted risks (details in the relay design specs):
  - someone who can see the QR code can race or consume a pairing, but cannot decrypt it;
  - a single client can exhaust the Free-plan daily request budget.

## 4. Secrets policy

- No secrets in git — ever: no provider credentials, playlists, EPG exports, tokens, signing keys or certificates.
- Generated Tizen signing material (`tizen/*.p12`, `*.pem`) is git-ignored; packages are signed only with explicit owner approval.
- Test fixtures use reserved `.invalid` / `example` domains and synthetic canary values; CI scans for leaked canaries.
- Never paste credentials, Cloudflare tokens or signing passwords into issues, PRs or chats.

## 5. Input handling and logging

- Provider-derived text is escaped or set via `textContent` before reaching the DOM.
- URLs and structured values pass through `player/src/logging/sanitize.ts` before logging; credential-bearing URLs and secret fields are redacted.
- User-facing errors are fixed, classified messages; raw provider or native error text is not shown.
- No provider or pairing input reaches `eval()` or similar.

## 6. Verification gates

- `node tools/check-m7-security-privacy.mjs` — source and generated-output privacy audit.
- `npm run brand:check` — legacy brand leakage.
- Relay tests assert ciphertext-only bodies, fixed error bodies and silent processes; the Worker bundle is checked for `console` usage.
- GitGuardian runs on pull requests.

## 7. Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository if it is enabled. Otherwise open an issue that describes the affected area without technical exploit details or any credentials, and ask for a private channel.
