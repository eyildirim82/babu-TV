# BabuşTV V1 Parallel Execution Board

**Date:** 2026-09-10  
**Owner:** REVIEW / Integration Controller  
**Status:** DESIGN APPROVED — PRODUCTION NOT STARTED  
**Parent roadmap:** `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`  
**Execution design:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Purpose

This is the compact role/dependency board used by parallel V1 RC worker windows.

A worker started with `ROLE=<id>` reads this file, the canonical controller board, and its own bounded plan before implementation.

No production role below is OPEN until the V1 RC documentation is merged, resulting `main` is GREEN, and the required bounded plan exists.

## Gate model

```text
RC roadmap docs
      ↓
RC-F0 shared contracts
      ↓ exact GREEN post-F0 main
      ↓
FIRST WAVE: independent core lanes
      ↓
PERSISTENCE / PROVIDER INTEGRATION
      ↓
UI LANES
      ↓
M4 / M5 / PAIRING COMPOSITION
      ↓
HARDENING
      ↓
RC-BROWSER + RC-PACKAGE
```

Recommended active concurrency: **8–12 workers**. The first-wave architecture allows approximately **13–14 independent core branches**, but controller review/CI capacity is the practical limit.

## Wave 0 — serial foundation

| ROLE | Branch | Status | Depends on | Ownership summary |
| --- | --- | --- | --- | --- |
| `RC-F0` | `foundation/v1-rc-contracts` | `WAITING-FOR-PLAN` | RC docs merged + GREEN main | shared EPG/user-state repository contracts, capability seams, test doubles; no feature behavior |

Only RC-F0 may intentionally prepare shared contract seams before the first fan-out. RC-F0 must remain small.

## Wave 1 — independent core lanes

All Wave 1 production branches start from the same exact GREEN post-RC-F0 `main` SHA unless controller records an exception.

| ROLE | Branch | Status | Produces |
| --- | --- | --- | --- |
| `EPG-N` | `feature/epg-normalizer` | `BLOCKED-RC-F0` | common EPG normalization/time rules |
| `EPG-X` | `feature/epg-xtream-adapter` | `BLOCKED-RC-F0` | Xtream EPG decoding/source boundary |
| `EPG-XML` | `feature/epg-xmltv-parser` | `BLOCKED-RC-F0` | XMLTV parser primitives |
| `EPG-MAP` | `feature/epg-channel-mapper` | `BLOCKED-RC-F0` | stable EPG↔channel reconciliation |
| `EPG-Q` | `feature/epg-query-engine` | `BLOCKED-RC-F0` | current/next/detail query logic |
| `FAV-D` | `feature/favorites-domain` | `BLOCKED-RC-F0` | Favorites domain/service + repository interface use |
| `SRCH-C` | `feature/search-core` | `BLOCKED-RC-F0` | Turkish-safe local Search core |
| `M3U-V` | `feature/m3u-entry-validation` | `BLOCKED-RC-F0` | modern M3U entry validation primitives |
| `WATCH-R` | `feature/watch-state-domain` | `BLOCKED-RC-F0` | last-watched/watch-event domain |
| `WATCH-S` | `feature/watch-score` | `BLOCKED-RC-F0` | pure frequently-watched scoring |
| `PAIR-C` | `feature/pairing-crypto` | `BLOCKED-RC-F0` | pairing crypto primitives |
| `PAIR-S` | `feature/pairing-session` | `BLOCKED-RC-F0` | TTL/single-use/replay session state |
| `PAIR-R` | `feature/pairing-relay-contract` | `BLOCKED-RC-F0` | ciphertext-only relay contract/client |
| `PAIR-WEB` | `feature/pairing-phone-ui` | `BLOCKED-CONTRACT` | phone pairing UI using frozen pairing interfaces |

Wave 1 workers must prefer new focused modules and memory/test doubles. They do not own IndexedDB schema migration, `main.js`, or shared Live TV composition.

## Wave 2 — persistence/provider integration

| ROLE | Branch | Status | Depends on |
| --- | --- | --- | --- |
| `EPG-P` | `integration/epg-persistence` | `BLOCKED-CORE` | RC-F0 + EPG normalization/query contracts |
| `USER-P` | `integration/user-state-persistence` | `BLOCKED-CORE` | `FAV-D` + `WATCH-R` + RC-F0 |
| `EPG-PI` | `integration/epg-provider-capability` | `BLOCKED-CORE` | `EPG-N/X/XML/MAP/P` as applicable |
| `M3U-C` | `integration/m3u-provider-core` | `BLOCKED-CORE` | `M3U-V` + existing Provider Core |
| `WATCH-I` | `integration/watch-playback-events` | `BLOCKED-CORE` | `WATCH-R` + `WATCH-S` + `USER-P` |

`EPG-P` and `USER-P` may both require IndexedDB schema ownership. They must not independently merge incompatible database version changes. Controller assigns ordering/base when that conflict becomes concrete.

## Wave 3 — UI lanes

| ROLE | Branch | Status | Depends on |
| --- | --- | --- | --- |
| `EPG-UI` | `feature/epg-live-tv-ui` | `BLOCKED-INTEGRATION` | EPG query/provider contracts |
| `FAV-UI` | `feature/favorites-ui` | `BLOCKED-INTEGRATION` | `FAV-D` + persistence read/write contract |
| `SRCH-UI` | `feature/search-ui` | `BLOCKED-CORE` | `SRCH-C` |
| `ACT-UI` | `feature/channel-actions-ui` | `BLOCKED-CONTRACT` | Favorite + EPG action contracts |
| `M3U-UI` | `feature/m3u-onboarding-ui` | `BLOCKED-INTEGRATION` | `M3U-C` |
| `HOME-D` | `feature/home-domain` | `BLOCKED-CONTRACT` | Favorites/watch/provider read contracts; EPG optional for current-program cards |
| `HOME-UI` | `feature/home-ui` | `BLOCKED-CORE` | `HOME-D` |
| `PROV-UI` | `feature/provider-management-ui` | `BLOCKED-CONTRACT` | stable provider-management operations |
| `FIRST-UI` | `feature/first-run-ui` | `BLOCKED-CONTRACT` | Xtream + M3U entry callbacks |

UI workers do not own central application composition merely to demonstrate their component. Integration happens in the composition wave.

## Wave 4 — composition

| ROLE | Branch | Status | Depends on |
| --- | --- | --- | --- |
| `M4-COMP` | `integration/m4-live-tv-composition` | `BLOCKED-UI` | EPG + Favorites + Search + Actions lanes |
| `M5-COMP` | `integration/m5-app-composition` | `BLOCKED-UI` | M3U + watch + Home + provider + first-run lanes + required M4 contracts |
| `PAIR-I` | `integration/pairing-onboarding` | `BLOCKED-PAIRING` | Pairing core/UI + final onboarding + CredentialStore contracts |

These packages own the high-conflict runtime wiring. They should implement little or no new feature-core logic.

## Wave 5 — hardening

| ROLE | Branch | Status | Domain |
| --- | --- | --- | --- |
| `PERF` | `hardening/catalog-epg-performance` | `BLOCKED-FEATURES` | large catalogs/EPG/Search/Home performance |
| `FAIL` | `hardening/provider-failures` | `BLOCKED-FEATURES` | 401/403/404/500, malformed, timeout/offline/cache failure |
| `MIG` | `hardening/storage-migrations` | `BLOCKED-PERSISTENCE` | schema/corruption/user-state preservation |
| `NAV` | `hardening/focus-navigation` | `BLOCKED-UI` | Back/focus/layer/reduced-motion regression |
| `PLAY` | `hardening/live-tv-regression` | `BLOCKED-M4` | zap/stale intent/rollback/new-feature playback regressions |
| `SEC` | `hardening/security-privacy-audit` | `BLOCKED-FEATURES` | secret/log/DOM/storage/artifact audit |

Hardening does not become a general refactor wave. Every production fix follows reproduce → root cause → RED → minimum fix → GREEN.

## Wave 6 — release verification

| ROLE | Branch | Status | Output |
| --- | --- | --- | --- |
| `RC-BROWSER` | `verification/v1-rc-browser` | `BLOCKED-HARDENING` | deterministic 1920×1080 release matrix + screenshots/focus evidence |
| `RC-PACKAGE` | `verification/v1-rc-package` | `BLOCKED-HARDENING` | exact-head test/typecheck/build/Tizen staging/package evidence |
| `CONTROLLER` | no production branch | `ACTIVE` | gate/merge/evidence authority |

Verification branches do not make speculative production fixes. Reproduced defects are routed to bounded fix branches.

## Hot-zone ownership

These files/areas are integration-owned by default:

```text
player/src/main.js
player/index.html
player/src/live-tv/live-tv-controller.ts
player/src/live-tv/dom-live-tv-view.ts
player/src/live-tv/create-live-tv-runtime.ts
player/src/providers/create-browser-provider-runtime.ts
player/src/storage/contracts.ts
player/src/storage/indexeddb-structured-store.ts
application-wide settings/navigation composition
global runtime copy/shell presentation
```

A core worker must not edit a hot-zone file unless its approved bounded plan explicitly grants that file. If a missing hot-zone change is discovered, report it as an integration requirement.

## Worker contract

Every active role must have an approved bounded spec/plan containing:

```text
ROLE
exact base SHA
branch
Owns
Read-only dependencies
Forbidden hot zones
Consumes
Produces
RED command / expected failure
GREEN command
full verification command set
Draft PR evidence requirements
```

No ROLE becomes `OPEN` from this board alone.

## Short prompts

After controller marks a role OPEN:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=EPG-N.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=FAV-D.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=WATCH-S.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=PAIR-C.
```

Controller prompt remains:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=CONTROLLER.
```

## Current action

Production implementation is **not started** by this documentation branch.

Next repository gate after documentation approval/merge:

1. post-merge `main` must be exact GREEN;
2. write/approve RC-F0 bounded implementation plan;
3. implement and merge RC-F0;
4. verify post-F0 `main` GREEN;
5. controller records that exact SHA as Wave 1 base;
6. open as many Wave 1 roles as review/CI capacity safely supports, recommended 8–12 concurrently.

Physical-TV evidence remains governed by the existing RC readiness/controller boards and is not changed by this parallelization design.
