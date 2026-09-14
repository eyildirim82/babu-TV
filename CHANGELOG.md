# Changelog

All notable changes to EN TV Player will be documented in this file.

## [1.0.0-rc.2] - 2026-09-14

Second BabuşTV V1 release candidate. It fixes defects found by running 1.0.0-rc.1 in a desktop browser at 1920×1080 (#139).

### Fixed
- The First Run brand logo loads again; it used a root-absolute path that broke under the web base path and in the TV package.
- Live TV lists channels and categories in playlist/provider order, so CH+ and CH- step through channels in order.
- Home and Provider Management fit the 1920×1080 screen; "Ayarları Aç" is no longer cut off.
- First Run and TV pairing regain their padding, borders and focus outline (they referenced undefined design tokens).
- Full-screen pages no longer rely on the `inset` shorthand, which older Samsung TV web engines ignore.
- The Live TV favorites, EPG, actions and search panel is styled as a compact strip, and the focused action is clearly visible.
- Two M3U providers are distinguishable ("M3U", "M3U 2") in Home, Provider Management and the delete prompt.

### Known limitations
- Physical Samsung/Tizen acceptance is still pending. The Tizen widget version stays `1.0.0`, as in rc.1.

---

## [1.0.0-rc.1] - 2026-09-14

First BabuşTV V1 release candidate. BabuşTV starts its own version line here; `1.10.1` below is the last inherited release.

### Added
- Provider Core onboarding for Xtream and M3U, with provider management (switch, add, edit, delete) and a branded first-run flow.
- Remote-first Home: provider, Last Watched, Live TV, Favorites, Frequently Watched and Settings.
- Live TV EPG (current/next/detail), provider-scoped Favorites, Turkish-safe local Search and channel actions.
- Secure phone pairing: ephemeral encrypted, single-use sessions over a ciphertext-only relay.

### Changed
- Hardening for large catalogs and EPG, provider failures, storage migrations, focus navigation, Live TV playback and security/privacy.
- The Tizen widget version is derived as numeric `x.y.z` (`1.0.0` for this candidate), and the update check follows semver prerelease precedence.

### Fixed
- Defects found during browser release qualification: provider focus on re-entry, Shaka teardown before channel handoff, media error when clearing the video element, phone pairing route in the built bundle, and Search text entry by remote and keyboard.

### Known limitations
- Physical Samsung/Tizen acceptance (device credential store, real remote keys, AVPlay fallback, lifecycle, long playback, install smoke) is still pending.

---

## [1.10.1] - 2026-09-07

### Fixed
- BUG-018: Fresh install with no playlist — backing out of Settings landed on a dead page. The player shell now initializes with zero channels and a "No channels" empty state, so sidebars and Settings stay reachable.
- BUG-019: Resolution badge lied (froze on the optimistic first pick). It now follows live ABR switches; Auto mode opens low for a fast first frame and climbs correctly (inverted upgrade/downgrade targets fixed).
- BUG-020: Interlaced (576i/1080i) channels played black with no error. Zero-frame watchdog migrates those to native AVPlay with the same proxy/headers.
- BUG-021: Relay rate-limit storms (403/401, "nothing plays"). Polite retries with cool-downs, fresh-token recovery for mid-playback 401, auto-advance on dead links, activity-aware load timeout.

### Changed
- Channel loading is staged: spinner, then first frame, then buffering percent — one indicator at a time.
- Buffering shows a stacked channel-name toast plus an enlarged pill with time-aware hints.
- Boot intro: logo holds, then flies toward the viewer before revealing the player.

---

## [1.10.0] - 2026-09-05

### Added
- Opt-in update checker — first-launch consent (default off), background check for new releases, gentle notice via Settings badge and What's New banner. Toggle in Settings → Playback.
- Download stats (`docs/STATS.md`) and Telegram contact (@nureallhiii) in README.

---

## [1.9.0] - 2026-09-05

### Fixed
- BUG-017: Tokenized live playlists (e.g. kliv) now play — channels no longer die after the first frame with "Connection lost" / Shaka 4032.
  - Stale-segment transmux failures and disabled-variant states are retried with a fresh playlist fetch (new token).
  - Access-denied (403/401) at load is retried twice with a fresh token before showing an error.
  - Accurate messages for stream-breakup errors; removed invalid Shaka config keys; fixed format-probe lookup on retry.

---

## [1.8.0] - 2026-09-05

### Fixed
- BUG-011: Remote OK on Settings now saves — playlist renames persist and quality toggles no longer revert.
- BUG-012: Enter inside Settings text fields now works on TV — Proxy URL saves, playlist name/URL forms submit and advance correctly.
- BUG-013: Channels that crashed inside Shaka on HLS date-time sync are retried once in compatibility mode instead of showing a cryptic engine error.
- BUG-014: Channels Shaka could not identify (extension-less/tokenized links) are now probed from their first bytes and retried with the correct format; error codes corrected to Shaka 5.x (including real 403 detection).
- BUG-015: "Try enabling Proxy" hint now shows bottom-center under the error message.
- BUG-016: Settings back button no longer sticks to the "Settings" title.

---

## [1.7.0] - 2026-09-03

### Fixed
- BUG-010: Some IPTV channels show black screen with no error (critical).
  - Added MIME type detection for direct TS/MP4 stream URLs — Shaka Player now correctly identifies raw IPTV stream formats.
  - Changed `ignoreManifestProgramDateTime` from `true` to `false` — fixes HLS streams that need date-time sync.
  - Enabled `forceTransmuxTS` — raw TS streams are now properly converted for browser playback.
  - Added `segmentFormat: 'mpegts'` for HLS — fixes IPTV servers that serve MPEG-TS segments.
  - Added video element `error`, `stalled`, and `waiting` event listeners — browser-level playback failures are now caught and shown to the user.
  - Reduced load timeout from 30s to 15s with visible error message instead of silent retry.
  - Added reconnect limit (3 attempts) — shows clear error after exhausting retries instead of looping forever.

### Changed
- All error messages rewritten in plain non-technical English — users can now understand and report issues clearly.
  - Removed HTTP codes (403, 404), codec names, DRM terms, and manifest references from user-facing messages.
  - Added actionable hints (e.g., "Try turning on Proxy", "Check your internet connection").
- Improved Shaka player config for Samsung Tizen IPTV compatibility (buffering, prefetch, bufferBehind).

---

## [1.6.0] - 2026-08-31

### Added
- Boot splash loading animation with logo entrance, typewriter tagline, and spinner.
- App version displayed on boot splash screen.
- What's New modal — shows once after update with all recent changes.
- Auto-refresh playlist on app launch (toggle in Settings → Playback).

### Fixed
- BUG-009: Fetch Active intermittent error during stream playback.
- Relay fallback now shows meaningful error messages.
- Fetch Active button disables during loading to prevent double-click.

---

## [1.5.0] - 2026-08-30

### Changed
- Updated app logo with new design.
- Updated Tizen community JSON for auto-release detection.

---

## [1.4.0] - 2026-08-28

### Added
- Channel name marquee scroll — long channel names auto-scroll horizontally in the sidebar.

### Fixed
- Sequential channel numbers in sidebar, channels sorted alphabetically within groups.
- Sidebar scroll not showing focused item at bottom of list.
- Instant channel switch on Up/Down, toast auto-hides after 0.5s.
- Consistent Left/Right sidebar navigation.

---

## [1.3.0] - 2026-08-28

### Added
- Responsive TV scaling — UI components scale proportionally based on screen size.
- Minimum 1.35x scale for comfortable couch viewing on 1080p TVs.

---

## [1.2.0] - 2026-08-28

### Fixed
- BUG-001: Debug console.log statements removed from production code.
- BUG-004: Favorite TODO comment removed.
- BUG-006: Tizen key registration warning added.
- BUG-007: Event listener cleanup added.
- BUG-008: Fresh install playlist fetch fixed.

---

## [1.1.0] - 2026-08-28

### Fixed
- BUG-001: Debug console.log statements removed from production code.
- App version display updated (was showing 1.0.0).
- Playlist fetch fails on first add after fresh install (BUG-008).

### Changed
- Updated README with tested installation methods.
- Added AI agent documentation (AGENTS.md, docs/*).
- Community package contribution.

---

## [1.0.0] - 2026-08-24

### Added
- Initial release — M3U/M3U8 playlist support, DRM channel playback, virtualized channel list, per-channel proxy toggle, Samsung Tizen remote control support, auto quality adjustment.
