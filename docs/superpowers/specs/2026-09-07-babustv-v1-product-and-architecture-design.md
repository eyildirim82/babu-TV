# BabuşTV V1 Product and Architecture Design

**Date:** 2026-09-07  
**Status:** Approved  
**Target:** Samsung Tizen TV  
**Upstream baseline:** `Nur-allhi/en-tvplayer@785bd4dfa13a09bfa947856d4ca43a97d982ecef` (`v1.10.1`)

## 1. Product statement

BabuşTV is a Tizen-first, open-source, privacy-first Live TV client. It deliberately starts from EN TV Player's proven Samsung Tizen playback and packaging behavior, then evolves through controlled divergence into an independent product with its own provider model, cache/repository architecture, navigation system, UI, security model, pairing subsystem, tests, brand, and release process.

Core principles:

1. **Remote-first:** the entire core experience works with Up, Down, Left, Right, OK, and Back.
2. **Playback-first:** UI or architecture work must not casually destabilize working playback.
3. **Cache-first:** local data becomes usable before provider refresh completes.
4. **Privacy-first:** provider secrets are never committed or logged and the pairing relay never receives them in plaintext.
5. **TV-optional development, TV-required release verification:** PC/browser tests are the daily loop; real Samsung hardware remains the release truth.
6. **Controlled upstream divergence:** useful EN TV Player security/playback/Tizen fixes are reviewed and deliberately ported; upstream is never blindly merged.
7. **Evidence-based AI development:** root cause/reproduction -> RED -> minimum change -> GREEN -> review -> verification.

## 2. Brand

Product name: **BabuşTV**.

The mascot is the owner's calico cat. Use the mascot for first-run branding, empty/offline states, README/release art, and selected brand surfaces. Do not show it during ordinary fullscreen playback.

Visual direction:

- dark neutral/charcoal base
- fixed violet/purple accent
- white/soft-gray text
- premium/sinematic Home
- fast, minimal Live TV overlay
- restrained motion for older TVs

First install may show the full mascot + BabuşTV intro. Later launches show a minimal logo splash and must not wait for an artificial animation duration.

## 3. V1 scope

Included:

- Xtream provider support
- M3U/M3U8 support
- multiple configured providers with one active provider at a time
- provider switching
- cache-first startup and background refresh
- categories/groups
- Live TV
- favorites
- local search
- EPG current/next/detail
- last watched
- frequently watched
- Samsung remote-first navigation
- optional channel/numeric/Tools/Menu enhancements where supported
- Shaka playback plus Samsung AVPlay/native fallback
- adaptive recovery/retry
- TV keyboard provider setup
- encrypted QR/phone provider entry
- BabuşTV public pairing relay plus self-host option using the same protocol
- local persistence/migrations
- open-source build/install documentation

Explicitly out of V1:

- VOD/movies
- series
- catch-up
- Stalker/Ministra
- TMDB
- Trakt
- cloud sync
- mandatory BabuşTV account
- provider aggregation into a single combined list
- theme marketplace

V1 succeeds by being an excellent Tizen Live TV client; VOD/Series must not delay it.

## 4. First run and provider setup

First run is one short branded onboarding screen with BabuşTV, mascot, value proposition, `Provider Ekle`, and a brief privacy note.

`Provider Ekle` offers two large cards:

- **Xtream:** server URL, username, password
- **M3U:** playlist URL

Xtream TV flow: enter credentials -> `Bağlan` -> validate provider -> save provider -> initial sync -> Home. A failed connection does not erase entered fields. Errors are user-facing classifications such as unreachable server, wrong credentials, timeout, or unsupported response.

TV keyboard is always sufficient. QR/phone input is optional convenience, not a requirement.

## 5. Home

Home is a fast-entry dashboard, not a discovery portal.

Order:

1. active provider selector
2. last watched / continue card
3. Live TV entry
4. Favorites row
5. Frequently Watched row
6. Settings

Default focus is Last Watched when available, otherwise Live TV. Provider selector is available but is not the normal startup focus.

Last Watched opens playback directly. If normal recovery fails, show a short error and open the Live TV overlay so another channel can be chosen.

Favorites and Frequently Watched use responsive channel cards with logo, channel name, and current program when available. Favorites `Tümünü Gör` opens Live TV with a virtual Favorites category rather than a separate duplicate screen.

Frequently Watched is local/provider-scoped behavioral ordering based on meaningful watch duration, meaningful opens, and recency. Very short zaps should contribute little or nothing. The user never sees the score. Show roughly 5–8 cards depending on width.

## 6. Live TV and navigation

Live TV's base state is fullscreen video. `OK` opens a semi-transparent overlay while playback continues.

Overlay zones:

- `CATEGORY`
- `CHANNEL`
- `ACTIONS`

The visible layout uses a left category column, main channel list, and selected-channel EPG detail panel.

Channel movement changes highlight only. `OK` is the explicit channel-play intent. **Highlight is not playback.** Category movement changes the filtered list but does not start streams.

Selected channel detail shows current time/title/description and next program when available. Missing EPG must degrade cleanly rather than break layout.

Focus is application state, not incidental DOM focus:

`FocusState = screen + zone + stable item ID + restore target`.

On overlay open:

1. focus the currently playing channel if visible
2. otherwise restore the last valid highlighted channel
3. otherwise focus the first valid channel

Refresh/re-render restores by stable ID, never raw array index.

`Tools/Menu` may open channel options where supported. Minimal-remotes must still reach actions with arrows/OK/Back, e.g. moving right from the channel list into Favorite/Info/More.

Back closes only the current UI layer. Application exit behavior is verified against Tizen conventions before finalizing any custom confirmation.

Physical Channel Up/Down expresses direct zap intent and may switch immediately. Numeric zap is progressive enhancement only when the remote and provider numbering support it.

No wrap-around navigation is required at list boundaries in V1.

## 7. Playback and recovery

UI never directly owns Shaka or `webapis.avplay` calls once the playback boundary exists.

Target layering:

`UI -> PlaybackService -> PlayerSessionCoordinator -> ShakaAdapter / AVPlayAdapter`.

Normalized app states include `IDLE`, `RESOLVING`, `PREPARING`, `PLAYING`, `BUFFERING`, and `FAILED`.

Desired channel switch: keep Channel A visible while Channel B resolves/prepares, then hand off only when safe. If B fails, keep A whenever technically possible.

This is capability-gated. BabuşTV does not assume that two hardware playback sessions are reliable on all Tizen models. A dedicated spike tests Shaka->Shaka, Shaka->AVPlay, AVPlay->AVPlay, and AVPlay->Shaka. If parallel preparation is unsafe, use the lowest-interruption single-session strategy.

Playback recovery classifies errors rather than blindly retrying:

- `AUTH`: refresh token/session, regenerate URL, bounded retry
- `NETWORK` / `TIMEOUT`: bounded backoff retry
- `ENGINE_FAILURE` / `UNSUPPORTED_CODEC`: try alternate engine when meaningful
- `STREAM_NOT_FOUND`: fail fast
- provider unavailable: clear connectivity message

Internal recovery details remain developer diagnostics; normal users see short states such as `Yayın açılıyor...` or `Yayın açılamadı`.

## 8. Platform architecture

Tizen is an adapter, not the application architecture.

Target boundaries:

- `Platform` -> browser and Tizen implementations
- `ProviderAdapter` -> Xtream and M3U
- `Playback` -> Shaka and AVPlay
- BabuşTV domain/UI depends only on normalized contracts

Tizen remote input is normalized to logical actions such as UP, DOWN, LEFT, RIGHT, SELECT, BACK, OPTIONS, CHANNEL_UP, CHANNEL_DOWN. Optional TV keys are discovered/capability-gated; no core feature depends on them.

Modern developer source may use TypeScript beginning in M1, but the generated bundle must stay compatible with the supported Tizen floor. No React migration is planned; preferred direction is Vite + TypeScript with a lightweight framework-free DOM/UI layer.

## 9. Provider and repository architecture

Provider contract conceptually exposes operations such as authentication/profile, categories, channels, EPG, stream resolution, and refresh.

Xtream and M3U normalize into one domain model. UI must not know Xtream endpoint details or M3U parser internals.

UI reads local repository state; it does not block directly on provider calls:

`Provider -> Adapter -> Normalizer -> Sync Engine -> Repository/IndexedDB -> UI`.

Startup: load active provider and cached data -> make UI usable -> refresh in background -> stable-ID merge into repository.

Provider-owned data is rebuildable; user-owned state such as favorites, last watched, watch stats, and preferences is treated as durable local state.

Refresh is partitioned so one failure does not poison everything: profile, categories, channels, EPG, reconciliation. EPG failure must not make Live TV unavailable.

Primary channel identity is provider-scoped external ID. Reconciliation may use trustworthy provider IDs/tvg-id/stream identity and only carefully fall back to normalized names. Focus/favorites must not depend on list position.

If a playing channel disappears from a refreshed provider list but the stream still works, do not immediately terminate playback.

Search is local, case-insensitive, Turkish-character-safe, and focused on channel/category data. Do not add a heavyweight search engine without need.

EPG is parsed/normalized into a practical time window so huge XMLTV data cannot dominate startup. The exact default window is selected by benchmark, not guessed in the design.

## 10. Persistence and credential security

Ordinary application data is stored behind repository/storage abstractions, with IndexedDB preferred for structured channel/EPG data.

Credentials use a separate `CredentialStore` abstraction. Do not assume ordinary IndexedDB/localStorage is secure credential storage. A mandatory Tizen security spike determines the strongest practical at-rest design for the supported TV range and documents limitations honestly.

Never log:

- passwords
- credential-bearing Xtream/M3U URLs
- tokens
- decrypted pairing payloads
- provider secrets

Logs must sanitize URLs/operations.

Deleting a provider deletes its credentials, provider-derived cache, favorites/watch state associated with that provider, and other provider-scoped local data after confirmation.

Schema migrations prioritize preserving user-owned state. Rebuildable channel/EPG cache may be discarded and regenerated if necessary.

## 11. Pairing security

V1 has no BabuşTV account, e-mail registration, or mandatory cloud identity. The architecture may permit optional future sync without making V1 depend on it.

QR pairing flow:

1. TV creates random session ID and ephemeral key pair
2. QR exposes pairing URL/session information and TV public key, not provider credentials
3. phone enters provider data
4. phone encrypts locally for the TV
5. relay transports ciphertext only
6. TV decrypts locally, validates provider, and stores credentials through `CredentialStore`

Relay invariants:

- cannot decrypt provider payload
- never validates Xtream/M3U itself
- no persistent provider credentials
- no payload logging
- single-use session
- short TTL, V1 default 5 minutes
- rate limiting / brute-force protection
- HTTPS
- open-source and self-hostable

BabuşTV offers a default public relay plus a custom self-host relay endpoint. Both implement the same protocol; the user is not locked to BabuşTV infrastructure.

Any claim about IP/log retention must match the actual deployed hosting platform rather than promising infrastructure behavior that has not been verified.

## 12. Testing and physical-TV strategy

Daily development must not require physical access to the target TV.

Test pyramid:

1. unit tests
2. browser integration
3. Tizen Emulator where practical
4. Samsung Remote Test Lab for Tizen-sensitive work
5. physical TV acceptance for releases

Priorities include provider parsing, M3U, EPG mapping, stable-ID reconciliation, favorites/watch scoring, playback state machine/recovery, focus engine, pairing protocol, migrations, and log sanitization.

Before refactoring inherited code, write characterization tests for important current behavior: playlist parsing, remote input, playback/AVPlay safety, packaging, and settings as appropriate.

Use synthetic fixtures/fake provider behavior for 200/401/403/404/500, timeout, malformed data, duplicates, large lists, broken EPG, and token expiry. Public CI never depends on the owner's real IPTV provider or captures real provider data.

Tizen-sensitive changes (platform, AVPlay/playback, remote, lifecycle, packaging) require stronger emulator/RTL/manual verification.

Release smoke coverage includes cold start, provider loading, Xtream, M3U, categories, overlay, playback, repeated zaps, favorites, search, EPG, Back, restart, network loss, provider failure, cache fallback, native fallback where testable, settings persistence, and provider switching.

## 13. AI-driven development rules

Every task:

1. fresh-check main/branch/PR/CI and relevant upstream state
2. read active spec/plan/AGENTS
3. define a bounded task
4. inspect or reproduce existing behavior
5. establish RED when behavior changes or a bug is fixed
6. make the minimum implementation
7. reach GREEN
8. refactor only when justified
9. run full relevant verification
10. review diff against spec
11. open/update PR
12. require exact-head CI before completion claims

No speculative fixes. Bug workflow is `root cause -> RED -> minimum fix -> GREEN -> regression verification`.

No development directly on `main`. Keep `main` buildable. Prefer one behavior/architectural step per PR. Do not add dependencies casually; evaluate Tizen compatibility, bundle cost, maintenance, and license.

## 14. Upstream strategy

EN TV Player remains the upstream reference. Never auto-merge it.

Review priorities:

1. security
2. playback
3. Tizen compatibility
4. packaging/install
5. product feature
6. UI-only

For a relevant change: inspect exact diff -> determine relevance -> reproduce where practical -> deliberately port/cherry-pick/adapt -> verify against BabuşTV tests and Tizen gates.

## 15. Milestones

- **M0 Baseline & Fork:** exact upstream history/license, build/package baseline, characterization tests, repo rules, CI, design docs. No new product feature.
- **M1 Architecture Foundation:** TypeScript boundary, platform/playback/provider/repository abstractions, domain types, focus foundation, sanitization, fixtures/fake provider.
- **M2 Provider Core:** Xtream auth/categories/live, M3U provider, normalized channel model, provider switching, cache-first sync.
- **M3 Live TV Core:** fullscreen, overlay zones, channel intent, remote enhancements, Back, recovery, Shaka/AVPlay, minimum-disruption switching.
- **M4 EPG/Search/Favorites:** EPG mapping/current/next/detail, local search, favorites, options, stable-ID hardening.
- **M5 Home:** last watched, Favorites, Frequently Watched, provider selector, dark/violet visual system, mascot, onboarding/splash.
- **M6 Pairing:** protocol, ephemeral keys, QR/phone UI, encrypted payload, public/self-host relay, expiry/single-use/rate limiting/log hygiene.
- **M7 Hardening:** huge lists, malformed providers, network/cache/migration/focus/lifecycle/storage/older-Tizen cases.
- **M8 Beta/RC:** RTL matrix, physical TV acceptance, install/contribution/privacy/security docs, known limitations, changelog, beta/RC release.

## 16. Mandatory spikes

Before implementation claims are made, run focused spikes for:

- Tizen secure credential storage
- dual-session/minimum-disruption channel switching
- Tizen Emulator automation reliability
- Samsung Remote Test Lab workflow
- large EPG storage/query window
- Tizen 5 compatibility (generated JS, storage, network, CSS, Shaka, memory)

## 17. Definition of Done

A normal task is done only when applicable tests, typecheck, lint/format, build, packaging gate, secret/log checks, docs, diff review, and exact-head CI are green. Tizen-sensitive work additionally satisfies its emulator/RTL/manual gate. A release additionally passes physical-device smoke testing.

## 18. V1 success criteria

V1 is successful when:

1. users can add Xtream or M3U
2. startup is fast from cache
3. large provider lists remain usable
4. the full core app works with the six basic remote actions
5. channel switching/recovery is stable and predictable
6. EPG, favorites, and search are reliable
7. provider/network failures do not brick the app or erase useful state
8. another developer can clone, build, package, and install BabuşTV from public documentation

## 19. Conclusion

BabuşTV V1 is an independent Tizen Live TV product built through controlled divergence from a proven EN TV Player baseline. The architecture isolates Tizen, provider, playback, persistence, focus, and pairing concerns so the product can be developed incrementally and safely even when real-TV access is intermittent.
