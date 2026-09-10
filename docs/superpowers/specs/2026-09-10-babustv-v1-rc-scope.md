# BabuşTV V1 Release Candidate Scope

**Date:** 2026-09-10  
**Status:** Approved execution target for TV-optional development  
**Repository baseline:** `main@f3061cbad574b507b1f80cf23e19b8af179e90b0`  
**Target:** `BabuşTV 1.0.0-rc.1` before physical-TV qualification

## 1. Purpose

This document converts the approved BabuşTV V1 product design into the concrete release-candidate scope that can be completed without physical access to a Samsung TV.

The repository is currently code-clean after B0 brand separation, M1-M3 Live TV architecture, Provider Core hardening and Xtream onboarding integration. The remaining repository work is product completion, hardening and release-candidate evidence. Physical Samsung hardware remains the release truth and is explicitly separated from code completion.

## 2. RC product statement

`BabuşTV 1.0.0-rc.1` is a Turkish-first, remote-first Samsung Tizen Live TV client with:

- Xtream and M3U provider onboarding;
- one active provider at a time with provider switching;
- cache-first startup;
- deterministic Live TV navigation and playback/recovery;
- EPG current/next/detail;
- provider-scoped Favorites;
- Turkish-safe local channel search;
- provider-scoped last watched and frequently watched state;
- a fast-entry Home screen;
- provider management;
- optional encrypted QR/phone pairing if M6 remains in V1;
- browser, CI and Tizen packaging evidence strong enough that only physical-TV qualification remains.

V1 continues to exclude VOD, series, catch-up, Stalker/Ministra, TMDB, Trakt, cloud sync, mandatory accounts and aggregated multi-provider channel lists.

## 3. Current baseline

Current repository state at the start of this RC plan:

- `main@f3061cbad574b507b1f80cf23e19b8af179e90b0`;
- latest `main` verify run `34414698392` SUCCESS;
- B0A-B0G merged and brand gate closed GREEN;
- M1-M3 implementation merged;
- Provider Core hardening #28 merged;
- Xtream onboarding XT-A #29, XT-B #30 and XT-C #31 merged;
- no open implementation PR;
- M3 real-Tizen UI/playback acceptance remains DEFERRED external evidence;
- M2 WidgetData real-Tizen persistence probe remains PENDING external evidence.

New production work starts from the then-current exact GREEN `main`, never from historical worker/evidence branches.

## 4. Release-candidate scope

### P0 — Required before `1.0.0-rc.1`

#### M4A — EPG Core

Build provider-normalized EPG infrastructure with:

- Xtream EPG ingestion;
- M3U/XMLTV EPG ingestion where metadata allows mapping;
- provider-scoped stable channel mapping;
- current/next/detail queries;
- timezone-safe millisecond normalization;
- bounded storage/query window chosen by benchmark;
- partitioned refresh so EPG failure cannot make Live TV unavailable;
- malformed/huge EPG fixtures and deterministic tests.

The existing `EpgProgram` domain type is the starting model, but provider and repository seams must be extended before UI work.

#### M4B — Live TV EPG Presentation

Extend the current Live TV overlay without changing M3 playback semantics:

- channel rows may show current title/time when available;
- selected channel panel shows current title/time/description and next program;
- missing EPG degrades cleanly;
- highlight remains independent from playback;
- remote-first focus remains stable by ID;
- BabuşTV semantic tokens and reduced-motion rules remain authoritative.

#### M4C — Favorites

Add durable provider-scoped Favorites based on stable `ChannelId`, never URL or list index:

- add/remove Favorite;
- virtual Favorites category in Live TV;
- no cross-provider leakage;
- reorder-safe and refresh-safe identity;
- graceful handling of removed channels;
- access through basic arrows/OK/Back, with optional special-key shortcuts only as progressive enhancement.

#### M4D — Local Search

Add lightweight local search over cached channel/category data:

- case-insensitive;
- Turkish-character-safe;
- channel name, category/group and unambiguous channel number support;
- usable with TV keyboard and remote navigation;
- no heavyweight search dependency;
- selecting a search result must preserve the explicit play-intent rule.

#### M4E — Channel Actions

Provide a minimal actions surface reachable without optional remote keys:

- `İzle`;
- `Favoriye Ekle` / `Favorilerden Çıkar`;
- `Program Bilgisi` when EPG exists.

Tools/Menu may open the same surface where supported but cannot be required.

#### Provider Onboarding Parity — M3U

Move M3U provider entry onto the same Provider Core transaction principles as Xtream:

`Provider Ekle -> M3U -> playlist URL -> validate -> register -> initial sync -> cache validation -> active-provider commit -> Home/Live TV`

Requirements:

- no plaintext credential-bearing playlist URL in ordinary app state or logs;
- failure preserves user-entered input where safe;
- activation remains the final commit point;
- existing M3U parser/adapter semantics remain behind Provider Core;
- legacy playlist UI must not remain the final V1 architecture.

#### M5A — Watch State

Add provider-scoped durable user state for:

- last watched channel;
- last played timestamp;
- meaningful watch duration;
- meaningful open count;
- frequently watched ordering.

Very short zaps must contribute little or nothing. Rebuildable provider cache and durable user state remain separate.

#### M5B — Home

Implement the approved fast-entry Home order:

1. active provider selector;
2. Last Watched / continue card;
3. Live TV;
4. Favorites row;
5. Frequently Watched row;
6. Settings.

Default focus is Last Watched when valid, otherwise Live TV. Home is not a discovery portal and must remain fast on older TVs.

#### M5C — Provider Management

Complete remote-first provider management:

- list configured providers;
- show/switch active provider;
- add provider;
- delete provider with confirmation;
- delete only that provider's credentials, provider-derived cache and provider-scoped user state;
- preserve all unrelated providers.

Provider credential editing may be implemented as re-onboarding/replacement rather than mutating secrets in ordinary settings state.

#### M5D — First Run

Complete the short branded first-run path:

- BabuşTV identity/mascot;
- short value proposition;
- `Provider Ekle`;
- brief privacy note;
- Xtream and M3U choices.

After successful setup, subsequent launches use the restrained boot path and normal Home/Live TV startup without artificial animation delay.

#### M7 — Hardening

Run dedicated hardening before RC tagging. Minimum deterministic matrix:

- 1,000+ channels;
- many categories;
- large EPG;
- malformed M3U/XMLTV;
- malformed Xtream response;
- duplicate IDs;
- empty provider;
- HTTP 401/403/404/500;
- timeout/network loss;
- stale cache;
- background refresh failure;
- provider switch/delete;
- deleted/reordered channel;
- token expiry;
- rapid repeated zap;
- stale playback intents;
- target failure with rollback;
- corrupt structured data;
- schema migration;
- repeated overlay/Back transitions;
- stable focus restoration;
- Turkish search edge cases.

No bug is repaired speculatively: reproduce -> root cause -> RED -> minimum fix -> GREEN -> affected smoke.

#### Security / Privacy Final Audit

Before RC tagging, scan active product surfaces, tests and evidence for:

- provider passwords;
- credential-bearing Xtream/M3U URLs;
- stream URLs/tokens;
- raw provider/native error text;
- `console.*` leaks;
- localStorage credential regressions;
- ordinary IndexedDB credential regressions;
- DOM `data-*` secret persistence;
- test/screenshot artifact leakage.

Public CI uses only synthetic fixtures and reserved example domains.

#### Browser Release Smoke

Run deterministic 1920x1080 browser acceptance covering:

- cold boot;
- first-run;
- Xtream entry;
- M3U entry;
- Home;
- Live TV/categories/channel selection;
- numeric-zap simulation;
- EPG;
- Favorites;
- Search;
- last watched/frequently watched;
- provider switching;
- Settings/provider management;
- error dialogs;
- network/provider failure;
- cache fallback;
- Back ownership/focus restoration.

Required screenshots must contain synthetic data only and no provider secrets/transient stream URLs.

#### Tizen Build / Package Gate

For each RC candidate, run where the environment supports it:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
npm run tizen:package
```

Validate staged package identity, app/package IDs, title, icon, privileges, relative asset paths, generated-JS compatibility and legacy-brand cleanliness.

`npm run tizen:package` may remain NOT-AVAILABLE in environments without a compatible Tizen CLI/signing setup; that status must be recorded rather than fabricated as PASS.

## 5. P1 — Included in approved V1 but separable from the first RC cut

### M6 — Encrypted QR / Phone Pairing

The approved V1 product spec includes optional encrypted QR/phone provider entry. It is not required for the TV keyboard path to work.

If M6 stays in `1.0.0`, implement and verify before RC:

- random single-use session ID;
- TV-side ephemeral key pair;
- QR contains session/public information only, never credentials;
- phone encrypts provider data locally for the TV;
- relay handles ciphertext only;
- TV decrypts locally and stores through `CredentialStore`;
- short TTL, default 5 minutes;
- replay rejection;
- rate limiting/brute-force protection;
- HTTPS;
- no payload logging;
- public relay and self-host relay use one protocol.

If schedule/risk requires deferral, the approved V1 scope document must be amended explicitly and M6 moved to `1.1`; it must not silently disappear from V1.

## 6. Physical-TV qualification — explicitly deferred while no TV is available

The following are release gates, not current repository blockers:

- M2 WidgetData real-Tizen write/read/relaunch/replace/remove probe;
- M3 13-item real-Tizen UI/playback matrix;
- real Samsung remote Up/Down/Left/Right/OK/Back;
- real CH+/CH-/numeric capability behavior;
- real Shaka/AVPlay/native fallback;
- repeated physical-device zap;
- suspend/resume/lifecycle;
- restart/settings persistence;
- memory/performance/long playback;
- Back/exit behavior on the target TV;
- representative supported Tizen model coverage.

These remain `PENDING` or `DEFERRED`, never `PASS`, until directly observed on applicable Samsung hardware, Remote Test Lab or an applicable emulator for the specific acceptance item.

## 7. Release staging model

### Stage A — Repository-complete RC

Exit criteria:

- M4 and M5 required scope GREEN;
- M3U onboarding parity GREEN;
- M7 hardening GREEN;
- security/privacy audit GREEN;
- exact-head CI GREEN;
- deterministic browser release matrix GREEN;
- Tizen build/package evidence recorded as PASS or honest environment limitation;
- M6 either GREEN or explicitly re-scoped by an approved V1 amendment.

Candidate label: `BabuşTV 1.0.0-rc.1`.

### Stage B — Physical-TV-qualified release

Exit criteria:

- M2 WidgetData probe satisfied;
- M3 real-Tizen UI/playback matrix satisfied;
- full physical release smoke satisfied;
- no Critical/Important release blocker remains.

Candidate label: `BabuşTV 1.0.0`.

## 8. Versioning decision

The current inherited package version is `1.10.1`, but BabuşTV now owns an independent product identity and release repository.

Recommended release strategy:

- do not change version as part of this documentation PR;
- before the first RC tag, make an explicit version/migration decision;
- preferred independent-product target is `1.0.0-rc.1` -> `1.0.0`;
- verify Tizen upgrade/install behavior before changing any package/application identity or version semantics.

## 9. Global invariants

Every RC task must preserve these constraints:

- remote-first core UX works with Up/Down/Left/Right/OK/Back;
- highlight is not playback;
- last intent wins;
- minimum interruption and bounded recovery remain owned by existing playback/session boundaries;
- provider/network/EPG failure does not erase useful cache or user state;
- no credential plaintext fallback is added;
- no real provider data is committed or logged;
- stable identity uses provider-scoped IDs, never list position;
- Tizen APIs stay behind platform/credential/playback adapters;
- BabuşTV visual tokens/brand gates remain authoritative;
- no VOD/Series/Catch-up scope is pulled into V1.

## 10. Definition of RC ready

The repository may be called **BabuşTV 1.0 repository-complete RC** only when all Stage A P0 gates are GREEN and every hardware-dependent item is explicitly documented as `PENDING` or `DEFERRED`.

The product may be called **BabuşTV 1.0 final release** only after Stage B physical-TV qualification is directly observed and recorded.
