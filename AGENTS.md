# AGENTS.md — BabuşTV

> Read this file, the active spec, and the active implementation plan before changing code.

## Product

BabuşTV is a Tizen-first, open-source, privacy-first Live TV client. It inherits a proven Tizen/Shaka/AVPlay baseline from EN TV Player and deliberately evolves into an independent product.

## Source of Truth

- Product/architecture design: `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`
- V1 release-candidate scope: `docs/superpowers/specs/2026-09-10-babustv-v1-rc-scope.md`
- Current status and evidence: `docs/verification/v1-rc-readiness.md`
- Decisions: `docs/decisions/` (0001 upstream divergence, 0002 credential storage, 0003 pairing relay hosting)
- Pairing relay: `docs/superpowers/specs/2026-09-14-pairing-relay-server-design.md`, `docs/superpowers/specs/2026-09-14-pairing-relay-cloudflare-design.md`
- Upstream baseline: `docs/UPSTREAM_BASELINE.md`
- Repository workflow: `docs/REPO_RULES.md`
- Implementation plans: `docs/superpowers/plans/`

Documents with a "Historical record" or "Inherited" banner describe past waves or the EN TV Player era; do not treat their status lines as current.

## Hard Rules

- Never develop directly on `main`.
- Never merge or deploy without explicit user approval.
- Before each new task, fresh-check `main`, active branch/PR, exact-head CI, and relevant upstream state.
- Do not blindly trust prior SHA, CI, PR, or upstream-version information.
- Bugs follow: root cause -> RED -> minimum fix -> GREEN -> review -> full verification.
- Preserve working playback behavior unless the active task explicitly changes it.
- Tizen API calls stay inside platform adapters; AVPlay calls stay inside playback adapters.
- Never commit or log IPTV credentials, credential-bearing URLs, provider dumps, tokens, signing keys, certificates, or real playlists/EPG exports.
- Sanitize URLs before logging.
- The pairing relay carries ciphertext only: never add plaintext provider fields, request/body logging, or persistence of sessions, ciphertext or client addresses.
- Deploying the public relay (`relay-cloudflare`) and signing Tizen packages use the owner's accounts and certificates: ask every time.
- Keep text sources plain text (no NUL or other binary bytes).
- Do not introduce React or another UI framework without a new approved ADR.
- Keep changes bounded; no big-bang rewrites.
- Never auto-merge upstream; inspect, establish relevance, port deliberately, and verify.

## Repository Layout

- `player/` — the TV app (Vite, TypeScript domain/UI modules plus inherited JS shell)
  - `src/app/` composition, `src/providers/` Xtream/M3U Provider Core, `src/repository/` and `src/storage/` IndexedDB persistence, `src/credentials/` WidgetData credential store
  - `src/live-tv/`, `src/epg/`, `src/favorites/`, `src/search/`, `src/watch/`, `src/home/`, `src/first-run/`
  - `src/playback/` Shaka/AVPlay adapters and session coordinator; `src/platform/` browser/Tizen adapters
  - `src/pairing/` TV and phone pairing, crypto, relay client
  - inherited shell: `src/main.js`, `src/player.js`, `src/avplay.js`, `src/remote.js`, `src/settings.js`, `src/ui.js`, `src/utils.js`, `src/config.js`
  - `public/pairing-config.js` — public default relay and phone-page endpoints
- `relay/` — relay core, in-memory store and limiter, Node self-host server (root npm workspace)
- `relay-cloudflare/` — Worker + Durable Object deployment of the relay; **not** a root workspace (own `package-lock.json`)
- `tizen/` — package/install tooling
- `tools/` — brand and M7 security audits, `rc-browser/` Playwright release qualification

## Verification

Run the baseline checks on a fresh dependency install:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run relay:build
npm run brand:check
node tools/check-m7-security-privacy.mjs
```

When `relay/` or `relay-cloudflare/` changes:

```bash
cd relay-cloudflare
npm ci
npm run typecheck
npm test
npm run build
```

On Windows checkouts with `core.autocrlf=true`, a few source-text tests fail only because of CRLF; run the full chain in an LF worktree (`git -c core.autocrlf=false worktree add ...`). Linux CI (`verify`, `relay-cloudflare`) is authoritative.

Run WGT packaging only in an environment where generated signing material remains uncommitted and secret-safe.
