# AGENTS.md — BabuşTV

> Read this file, the active spec, and the active implementation plan before changing code.

## Product

BabuşTV is a Tizen-first, open-source, privacy-first Live TV client. It inherits a proven Tizen/Shaka/AVPlay baseline from EN TV Player and deliberately evolves into an independent product.

## Source of Truth

- Product/architecture design: `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`
- Upstream baseline: `docs/UPSTREAM_BASELINE.md`
- Repository workflow: `docs/REPO_RULES.md`
- Implementation plans: `docs/superpowers/plans/`

## Hard Rules

- Never develop directly on `main`.
- Never merge or deploy without explicit user approval.
- Before each new task, fresh-check `main`, active branch/PR, exact-head CI, and relevant upstream state.
- Do not blindly trust prior SHA, CI, PR, or upstream-version information.
- Bugs follow: root cause -> RED -> minimum fix -> GREEN -> review -> full verification.
- Preserve working playback behavior unless the active task explicitly changes it.
- Once platform boundaries exist, Tizen API calls stay inside platform adapters.
- Once playback boundaries exist, AVPlay calls stay inside playback adapters.
- Never commit or log IPTV credentials, credential-bearing URLs, provider dumps, tokens, signing keys, certificates, or real playlists/EPG exports.
- Sanitize URLs before logging.
- Do not introduce React or another UI framework without a new approved ADR.
- Keep changes bounded; no big-bang rewrites.
- Never auto-merge upstream; inspect, establish relevance, port deliberately, and verify.

## M0 Baseline

Until M1 establishes new boundaries, the inherited layout remains authoritative:

- `player/src/player.js` — Shaka playback orchestration
- `player/src/avplay.js` — Samsung AVPlay fallback
- `player/src/remote.js` — remote normalization
- `player/src/utils.js` — playlist parsing and stream URL processing
- `player/src/config.js` — inherited config/settings
- `tizen/` — package/install tooling

## Verification

Run the baseline checks on a fresh dependency install:

```bash
npm ci
npm test
npm run build
```

Run WGT packaging only in an environment where generated signing material remains uncommitted and secret-safe.
