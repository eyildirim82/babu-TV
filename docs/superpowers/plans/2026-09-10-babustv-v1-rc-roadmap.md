# BabuşTV V1 RC Execution Roadmap

**Date:** 2026-09-10  
**Status:** Approved roadmap for TV-optional V1 RC development  
**Repository:** `eyildirim82/babu-TV`  
**Starting baseline:** `main@f3061cbad574b507b1f80cf23e19b8af179e90b0`  
**Baseline verify:** `34414698392` SUCCESS

> This is a master execution roadmap. It does not replace bounded implementation specs/plans for individual production waves.

## Goal

Bring BabuşTV from the current integrated B0 + Xtream + M3 foundation to a release-candidate state that can be completed without continuous access to a physical Samsung TV, while preserving physical-TV acceptance as a mandatory final-release gate.

The target remains the approved BabuşTV V1: a Tizen-first, Turkish-first, privacy-first Live TV client with Xtream and M3U providers, deterministic Live TV navigation, EPG, favorites, local search, Home, local watch state, provider management, secure pairing, and hardened recovery/failure behavior.

## Product rule

Development is TV-optional; release verification is TV-required.

Physical TV unavailability changes evidence classification, not product scope:

- deterministic unit/browser/integration/build evidence may be GREEN;
- physical-TV-only observations remain `DEFERRED` or `PENDING`;
- unavailable runtime rows must never be manufactured as PASS;
- `BabuşTV 1.0.0` is not final-release accepted until the mandatory physical-device gate passes.

## Completed foundation

Before this roadmap starts, the repository has integrated:

- M0/M1 architecture foundations;
- M2 Provider Core foundations, with the real-Tizen WidgetData probe still pending;
- M3 Live TV implementation, with real-Tizen UI/playback acceptance still deferred;
- B0A–B0G product identity, assets, design system, Turkish runtime copy, shell/boot, Live TV presentation, and brand hardening;
- Provider Core registration hardening;
- Xtream onboarding core, remote-first Xtream entry UI, and application integration.

Every new production branch starts from the then-current exact GREEN `main`. Historical worker/evidence branches are not new integration bases.

## RC sequence

```text
RC planning
   ↓
M4 EPG / Favorites / Search
   ↓
M3U Provider-Core onboarding parity
   ↓
M5 Watch State / Home / Provider Management / First Run
   ↓
M6 Secure QR / Phone Pairing
   ↓
M7 Hardening / Security / Migration / Performance
   ↓
Browser Release Matrix + Tizen Build/Package Gate
   ↓
BabuşTV 1.0.0-rc.1
   ↓
[physical TV available]
   ↓
M2 WidgetData probe + M3 runtime matrix + physical release smoke
   ↓
BabuşTV 1.0.0
```

## M4 — EPG, Favorites, Search

### M4A — EPG Core

Build provider-independent EPG contracts, normalization, storage/query boundaries, current/next lookup, detail data, timezone handling, and bounded cache windows.

Acceptance direction:

- Xtream EPG support;
- M3U/XMLTV-compatible EPG path;
- provider-scoped channel-to-EPG mapping using stable identifiers;
- current and next program lookup;
- detail fields suitable for TV presentation;
- malformed or missing EPG never makes Live TV unavailable;
- large EPG inputs use synthetic fixtures and measured performance gates;
- the practical EPG time window is selected from measurements, not guessed;
- credentials and credential-bearing URLs never enter EPG records or logs.

### M4B — Live TV EPG presentation

Extend the existing TV-native Live TV overlay without changing the M3 invariant that highlight is not playback.

Acceptance direction:

- channel rows may show current-program context without visual overload;
- selected-channel detail shows current and next program when available;
- missing EPG degrades cleanly;
- focus remains application state restored by stable ID;
- core interaction remains reachable by Up/Down/Left/Right/OK/Back;
- 1920×1080 deterministic browser screenshots are part of acceptance.

### M4C — Favorites

Favorites are durable user-owned, provider-scoped state keyed by stable channel identity.

Acceptance direction:

- add/remove favorite;
- Favorites appears as a virtual Live TV category instead of a duplicate player screen;
- provider refresh/reorder does not silently lose favorites when stable identity remains valid;
- providers never share favorite state;
- channel deletion/reconciliation is explicit and tested;
- optional TV keys may accelerate actions but are never required.

### M4D — Local Search

Implement lightweight local search over normalized catalog data.

Acceptance direction:

- channel name and category/group are searchable;
- channel number may be searchable when present;
- search is case-insensitive and Turkish-character-safe;
- large provider lists remain responsive under synthetic benchmarks;
- highlighting a search result never implicitly starts playback;
- no heavyweight search dependency is added without measured need.

### M4E — Channel options

Provide a minimal remote-first action surface such as `İzle`, `Favoriye Ekle/Çıkar`, and `Program Bilgisi`.

Tools/Menu may open this surface where supported, but minimal remotes must reach the same actions with arrows, OK, and Back.

## M3U onboarding parity

Xtream onboarding is already integrated through Provider Core. Legacy M3U playlist management must not remain the only V1 M3U entry path.

Target transaction:

```text
Provider Ekle
  → M3U
  → Playlist URL
  → validate
  → register
  → initial sync
  → validate cache
  → activate as final commit point
  → enter normal application flow
```

Requirements:

- reuse Provider Core boundaries;
- keep credentials and credential-bearing playlist URLs out of logs and ordinary provider/catalog persistence;
- failed registration leaves no partial provider state;
- failed sync does not activate an unusable provider;
- existing Xtream behavior remains unchanged;
- legacy playlist behavior is characterized before migration or removal.

## M5 — Home and durable watch state

### M5A — Watch State

Add provider-scoped durable user-owned state for:

- last watched channel;
- meaningful watch duration;
- meaningful opens;
- recency;
- frequently watched ranking.

Very short zaps contribute little or nothing. Scores stay internal and local.

### M5B — Home

Home is a fast-entry dashboard, not a streaming-discovery portal.

Required order:

1. active provider selector;
2. Last Watched / Continue;
3. Live TV;
4. Favorites;
5. Frequently Watched;
6. Settings.

Default focus is Last Watched when available, otherwise Live TV. Favorites `Tümünü Gör` enters Live TV using the virtual Favorites scope.

### M5C — Provider Management

Complete user-visible management for multiple configured providers while keeping exactly one active provider at a time.

Required actions:

- show active provider;
- switch provider;
- add provider;
- safely edit/re-enter provider configuration;
- delete provider with confirmation.

Deleting one provider removes its credential, provider-derived cache, and provider-scoped user state without touching another provider.

### M5D — First Run

First run remains short and branded:

- BabuşTV identity and mascot;
- concise value proposition;
- `Provider Ekle` primary action;
- short privacy note;
- Xtream and M3U choices.

Subsequent launches use the restrained BabuşTV splash and must not wait for decorative animation timing.

## M6 — Secure QR / Phone Pairing

Pairing remains in approved V1 scope as optional convenience; TV keyboard entry remains sufficient.

Protocol invariants:

1. TV creates a random session ID and ephemeral key pair;
2. QR exposes session data and TV public key, never provider credentials;
3. phone collects provider data;
4. phone encrypts locally for the TV;
5. relay carries ciphertext only;
6. TV decrypts locally and stores through `CredentialStore`;
7. session is single-use and short-lived;
8. default V1 TTL is approximately five minutes unless a later approved spec changes it;
9. relay has rate limiting/brute-force resistance and HTTPS;
10. payload and decrypted provider secrets are never logged;
11. public and self-host relay modes use the same protocol.

A later explicit product-spec decision may defer M6 to 1.1, but this roadmap does not silently remove it.

## M7 — Hardening

Hardening is a dedicated wave, not incidental cleanup.

Minimum deterministic matrix:

- 1,000+ channels and large category sets;
- large EPG input;
- malformed M3U;
- malformed Xtream responses;
- duplicate provider/channel identifiers;
- empty provider/catalog;
- HTTP 401/403/404/500;
- timeout and offline transitions;
- stale cache with failed background refresh;
- provider switching and provider deletion;
- token/session expiry;
- repeated rapid zapping;
- stale playback intents/completions;
- target playback failure with bounded rollback;
- corrupted local structured data;
- storage/schema migration;
- repeated Back and layer open/close;
- focus restoration after refresh/re-render;
- Turkish search edge cases;
- reduced-motion presentation;
- release-build compatibility with the supported Tizen floor.

## Security and privacy RC audit

Before RC tagging, audit active product surfaces and generated evidence for:

- passwords;
- credential-bearing Xtream/M3U URLs;
- tokens;
- transient stream URLs;
- decrypted pairing payloads;
- unsafe `console.*` output;
- localStorage credential use;
- ordinary IndexedDB credential use;
- DOM `data-*` credential persistence;
- unsafe error serialization;
- screenshots or CI artifacts containing secrets.

Public CI uses only synthetic/fake provider data.

The M2 WidgetData real-Tizen probe remains `PENDING` until an applicable Tizen runtime verifies API access, synthetic write/read, relaunch persistence, replace, remove, post-remove absence, and sanitized failures.

## Browser release matrix

Until physical hardware is available, the strongest UI acceptance is a deterministic 1920×1080 browser matrix covering, where applicable:

- cold boot;
- first run;
- Xtream add/failure/success;
- M3U add/failure/success;
- Home;
- provider switching;
- Live TV open/close;
- categories;
- channel highlight and explicit play;
- numeric-zap simulation;
- CH± logical actions;
- EPG present/missing/broken;
- Favorites add/remove/scope;
- Search;
- Last Watched;
- Frequently Watched;
- Settings;
- dialogs/errors;
- offline/provider failure;
- cache fallback;
- Back navigation and focus restoration;
- reduced-motion mode.

Remote-first screenshot evidence is paired with mechanical focus/state assertions rather than visual review alone.

## RC command gate

Every release candidate runs the repository-supported equivalents of:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
npm run tizen:package
```

If `tizen:package` is unavailable because tooling/signing configuration is missing, classify it as `NOT-AVAILABLE`; do not substitute a false PASS.

Staged output also verifies:

- BabuşTV package/application identity;
- display title;
- version;
- icon equality/integrity;
- required Tizen privileges;
- relative asset paths;
- legacy-brand scan;
- generated bundle compatibility;
- clean tracked diff after verification.

## Versioning decision gate

The repository currently inherits version `1.10.1` while the product is independently branded as BabuşTV.

Before the first public RC, explicitly choose one strategy:

- reset the independent product line to `1.0.0-rc.1` / `1.0.0`; or
- intentionally continue the inherited semantic-version line.

This roadmap performs no version rewrite. Package/application identity and upgrade implications must be reviewed before changing version numbers.

## Physical-TV deferred release gate

The following remain deferred while no physical TV or usable equivalent is available:

- M2 WidgetData credential persistence probe;
- M3 13-row Live TV UI/playback runtime matrix;
- real Samsung remote optional-key behavior;
- real CH± and numeric keys;
- real Shaka/AVPlay fallback behavior;
- TV lifecycle, suspend/resume, relaunch, Back/exit semantics;
- repeated real-device zapping;
- long-running playback/memory behavior;
- on-device network loss/recovery;
- settings/provider persistence across real relaunch;
- supported-model/Tizen-floor acceptance;
- final install/package/release smoke.

These are not blockers for producing an RC candidate; they are blockers for declaring final `BabuşTV 1.0.0` release acceptance.

## Per-wave development rules

Every production slice follows:

1. refresh exact `main`, PRs, CI, and relevant upstream state;
2. read the approved V1 spec and this roadmap;
3. write/approve a bounded implementation spec/plan for the slice;
4. characterize existing behavior;
5. establish RED for new behavior or bug fixes;
6. implement the minimum change;
7. reach focused GREEN;
8. run full relevant regression, typecheck, build, and security gates;
9. review latest exact diff for scope and secret leakage;
10. capture browser/Tizen evidence appropriate to the change;
11. open Draft PR with exact base/head and evidence;
12. require controller review and explicit merge authority;
13. verify post-merge `main` before starting a dependent slice.

Do not develop directly on `main`. Do not use historical worker branches as new bases. Do not broaden a failing slice into unrelated refactoring.

## V1 RC definition of ready

A BabuşTV V1 RC is ready when all TV-optional V1 implementation work is integrated and:

- Xtream and modern M3U onboarding work through Provider Core;
- cache-first startup remains intact;
- deterministic Live TV behavior and recovery remain GREEN;
- EPG current/next/detail works and fails independently;
- Favorites and local Search are stable-ID/provider-scoped;
- Home, Last Watched, Frequently Watched, and provider management are functional;
- pairing is complete, or a separately approved product-spec change explicitly defers it;
- large/malformed/offline/migration/focus matrices are GREEN;
- secret/log/privacy audits are GREEN;
- deterministic 1920×1080 release smoke is GREEN;
- build and available Tizen package gates are GREEN;
- unavailable physical-runtime checks are explicitly `DEFERRED`/`PENDING`;
- no Critical/Important code blocker is open.

Final `BabuşTV 1.0.0` additionally requires the physical-TV deferred release gate to be satisfied.
