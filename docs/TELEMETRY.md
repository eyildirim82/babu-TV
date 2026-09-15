# Telemetry (opt-in only)

> **Updated:** 2026-09-15 for BabuşTV.

BabuşTV collects no analytics and has no account. The only telemetry-like feature is an opt-in update check.

The app asks once: "Uygulama açılırken güncellemeler denetlensin mi? Yalnızca anonim sürüm kontrolü yapılır; kişisel veri gönderilmez." Default is **off**. The choice lives in Settings → Oynatma → "Güncellemeleri denetle" and can be revoked anytime. Declining disables all network activity described in this section.

## What is sent (only when opted in)

| Data | Purpose |
|------|---------|
| Update check: GET of the static `version.json` from this repository via jsDelivr (`cdn.jsdelivr.net/gh/eyildirim82/babu-TV@main/version.json`) | Learn whether a newer release exists |
| Usage ping: app version + `tizen`/`browser` device class | Count active installs per version — **not active**, see below |

No identifiers, viewing data, provider details or playlist URLs are sent. The CDN (jsDelivr) sees the requesting IP address as with any download.

## Status: ping endpoint not deployed

`player/src/update.js` ships with `PING_URL = ''`. While it is empty the ping is a no-op and only the update check runs. Enabling install counting would need a separately reviewed endpoint, a privacy note here and an entry in the deploy log.

## Phone pairing is not telemetry

The pairing relay (`docs/decisions/0003-pairing-relay-hosting.md`) is contacted only while the user is actively pairing a phone. It receives the session ID and an encrypted envelope; it does not log requests, and the Cloudflare deployment disables Worker logs and traces. Cloudflare still processes client IP addresses at its edge.

Developer tooling: CI sets `WRANGLER_SEND_METRICS=false` so Wrangler's own usage telemetry is not sent from BabuşTV builds.

## Deploy log

| Date | Change |
|------|--------|
| — | Ping endpoint not deployed |
| 2026-09-14 | Pairing relay deployed to Cloudflare (not a telemetry endpoint) |
