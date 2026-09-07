# BabuşTV Upstream Baseline

## Source

- Upstream repository: `Nur-allhi/en-tvplayer`
- Baseline commit: `785bd4dfa13a09bfa947856d4ca43a97d982ecef`
- Upstream release: `v1.10.1`
- Baseline date: `2026-09-07`
- Upstream license: MIT

## Inherited Structure

- `player/` — Vite/Shaka browser application
- `player/src/player.js` — Shaka playback orchestration
- `player/src/avplay.js` — Samsung AVPlay fallback
- `player/src/remote.js` — keyboard/Samsung remote key normalization
- `player/src/utils.js` — M3U parsing and stream URL processing
- `player/src/config.js` — localStorage settings and playback configuration
- `tizen/` — WGT build/install tooling

## Baseline Behaviors We Intentionally Preserve Before Refactoring

1. M3U/M3U8 parsing, including group, channel number, DRM, custom header, and pipe-suffix handling.
2. Shaka remains the primary inherited playback engine.
3. AVPlay is used only as a guarded fallback when available.
4. `avplay.stop()` does not touch the native API when no native session was opened.
5. Arrow, Enter, Back, color/media/channel, and numeric remote mappings continue to normalize into app actions.
6. Existing production build remains Vite-based and targets ES2015 output.
7. Tizen package requires Tizen 5.0 and the TV input-device/internet privileges.

## Baseline Verification

```bash
npm ci
npm test
npm run build
```

WGT packaging is verified separately because it creates local signing material when no author certificate exists.

## Upstream Policy

BabuşTV does not mechanically merge upstream. New upstream commits are reviewed for security, playback, Tizen compatibility, and relevant bug fixes, then ported deliberately with BabuşTV tests.
