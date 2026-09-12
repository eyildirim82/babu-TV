# BabuşTV V1 Parallel Execution Board

> **M7 CURRENT-TRUTH OVERLAY — 2026-09-12:** The Wave 1–6 status tables and “Current action” below are retained as historical execution evidence and are superseded as live state. Wave 3C is CLOSED; `PAIR-I-WIRE` merged through PR #87; production `main` is exactly `0cdc1ed240707b389d202d48efeaaf5822fe2316`; verify `34685628558` is SUCCESS. The live execution board is now `docs/verification/m7-hardening-execution.md`. `PERF`, `FAIL`, `MIG`, `NAV`, `PLAY`, and `SEC` are `READY / PLAN-BACKED`, all initially branch from exact `0cdc1ed240707b389d202d48efeaaf5822fe2316`, and may execute concurrently. Preferred controller merge order is `MIG → FAIL → PERF → NAV → PLAY → SEC-FINAL`. Physical-Tizen acceptance remains `PENDING` / `DEFERRED` and cannot be inferred from browser/build evidence.

**Date:** 2026-09-10  
**Owner:** REVIEW / Integration Controller  
**Status:** RC-F0 CLOSED GREEN — WAVE 1 BASE FROZEN; 13 CORE ROLES PLAN-BACKED AND OPEN  
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

Recommended active concurrency: **8–12 workers**. Thirteen core roles are OPEN so workers can be scheduled flexibly, but controller/CI capacity remains the practical simultaneous-work limit.

## Wave 0 — serial foundation

| ROLE | Branch | Status | Depends on | Ownership summary |
| --- | --- | --- | --- | --- |
| `RC-F0` | `foundation/v1-rc-contracts` | `CLOSED GREEN` | complete | shared EPG/user-state repository contracts, capability seams, test doubles; no feature behavior |

RC-F0 worker head `8a216600b8244c58e7fabb8069f2320b906b21b4` passed its complete plan-required gate set and was squash-merged as PR #37. Resulting production base is `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`; post-merge verify run `34487321835` is SUCCESS.

## Wave 1 — independent core lanes

**Common exact Wave 1 implementation base:** `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`  
**Post-RC-F0 main verification:** `34487321835` SUCCESS

All Wave 1 production branches must start from this exact SHA, even though later controller documentation commits exist on `main`. Do not silently rebase a Wave 1 core branch onto another worker or onto later docs-only `main` without a controller-recorded base change.

| ROLE | Branch | Status | Bounded plan | Produces |
| --- | --- | --- | --- | --- |
| `EPG-N` | `feature/epg-normalizer` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-n-normalizer.md` | common EPG normalization/time rules |
| `EPG-X` | `feature/epg-xtream-adapter` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-x-xtream-adapter.md` | Xtream EPG decoding/source boundary |
| `EPG-XML` | `feature/epg-xmltv-parser` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-xml-xmltv-parser.md` | XMLTV parser primitives |
| `EPG-MAP` | `feature/epg-channel-mapper` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-map-channel-mapper.md` | stable EPG↔channel reconciliation |
| `EPG-Q` | `feature/epg-query-engine` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-q-query-engine.md` | current/next/detail query logic |
| `FAV-D` | `feature/favorites-domain` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-fav-d-favorites-domain.md` | Favorites domain/service + repository interface use |
| `SRCH-C` | `feature/search-core` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-srch-c-search-core.md` | Turkish-safe local Search core |
| `M3U-V` | `feature/m3u-entry-validation` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-m3u-v-entry-validation.md` | modern M3U entry validation primitives |
| `WATCH-R` | `feature/watch-state-domain` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-watch-r-watch-domain.md` | last-watched/watch-event domain |
| `WATCH-S` | `feature/watch-score` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-watch-s-scoring.md` | pure frequently-watched scoring |
| `PAIR-C` | `feature/pairing-crypto` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-pair-c-crypto.md` | pairing crypto primitives |
| `PAIR-S` | `feature/pairing-session` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-pair-s-session.md` | TTL/single-use/replay session state |
| `PAIR-R` | `feature/pairing-relay-contract` | `OPEN` | `docs/superpowers/plans/2026-09-10-v1-wave1-pair-r-relay-contract.md` | ciphertext-only relay contract/client |
| `PAIR-WEB` | `feature/pairing-phone-ui` | `BLOCKED-CONTRACT` | not yet written | phone pairing UI after pairing core interfaces are frozen |

Wave 1 workers must prefer new focused modules and memory/test doubles. They do not own IndexedDB schema migration, `main.js`, shared Live TV composition, provider runtime composition, or another worker's files.

## Wave 2 — persistence/provider integration

| ROLE | Branch | Status | Depends on |
| --- | --- | --- |
| `EPG-P` | `integration/epg-persistence` | `BLOCKED-CORE` | RC-F0 + EPG normalization/query contracts |
| `USER-P` | `integration/user-state-persistence` | `BLOCKED-CORE` | `FAV-D` + `WATCH-R` + RC-F0 |
| `EPG-PI` | `integration/epg-provider-capability` | `BLOCKED-CORE` | `EPG-N/X/XML/MAP/P` as applicable |
| `M3U-C` | `integration/m3u-provider-core` | `BLOCKED-CORE` | `M3U-V` + existing Provider Core |
| `WATCH-I` | `integration/watch-playback-events` | `BLOCKED-CORE` | `WATCH-R` + `WATCH-S` + `USER-P` |

`EPG-P` and `USER-P` may both require IndexedDB schema ownership. They must not independently merge incompatible database version changes. Controller assigns ordering/base when that conflict becomes concrete.

## Wave 3 — UI lanes

| ROLE | Branch | Status | Depends on |
| --- | --- | --- |
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

A core worker must not edit a hot-zone file unless its approved bounded plan explicitly grants that file. If a missing hot-zone change is required, report it as an integration requirement instead of expanding scope.

## Worker contract

Every active role has an approved bounded plan containing:

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

The plan is authoritative for that worker's production/test file ownership. The board is authoritative for live status and dependency gating.

## Short prompts

OPEN workers can now be started with:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=EPG-N.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=EPG-X.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=EPG-XML.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=EPG-MAP.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=EPG-Q.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=FAV-D.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=SRCH-C.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=M3U-V.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=WATCH-R.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=WATCH-S.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=PAIR-C.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=PAIR-S.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=PAIR-R.
```

Controller prompt remains:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=CONTROLLER.
```

## Current action

RC-F0 is integrated. Thirteen independent Wave 1 core roles now have bounded plans and are OPEN from frozen implementation base `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.

Execution policy:

1. start each worker branch from exact `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`;
2. run 8–12 workers concurrently by default even though all 13 are OPEN;
3. every worker follows its own TDD plan and opens a Draft PR only;
4. no worker marks Ready/merges itself;
5. Controller reviews exact-head evidence and merge order;
6. dependent Wave 2/UI roles remain blocked until required core merges are GREEN;
7. keep `PAIR-WEB` `BLOCKED-CONTRACT` until pairing core interfaces are merged/frozen.

Physical-TV evidence remains governed by the existing RC readiness/controller boards and is not changed by this parallelization design.
