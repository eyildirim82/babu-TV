# BabuşTV V1 Parallel Execution Board

**Date:** 2026-09-14\
**Owner:** REVIEW / Integration Controller\
**Status:** WAVES 0–5 CLOSED GREEN; RC-BROWSER CLOSED GREEN; RC-PACKAGE IN PROGRESS (PREREQUISITE RC FIX VERSION-PRERELEASE PR #135)\
**Parent roadmap:** `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`\
**Execution design:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Purpose

This is the compact role/dependency board used by parallel V1 RC worker windows.

A worker started with `ROLE=<id>` reads this file, the canonical controller board, and its own bounded plan before implementation.

No production role below is OPEN until the V1 RC documentation is merged, resulting `main` is GREEN, and the required bounded plan exists.

Evidence cells give the merged PR, its first-parent merge SHA on `main`, and the SUCCESS post-merge `verify` run.

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

Recommended active concurrency: **8–12 workers**. This concurrency guidance applied to Waves 1–5, which are now integrated; controller/CI capacity remains the practical simultaneous-work limit for any future lanes.

## Wave 0 — serial foundation

| ROLE | Branch | Status | Depends on | Ownership summary |
| --- | --- | --- | --- | --- |
| `RC-F0` | `foundation/v1-rc-contracts` | `CLOSED GREEN` | complete | shared EPG/user-state repository contracts, capability seams, test doubles; no feature behavior |

RC-F0 worker head `8a216600b8244c58e7fabb8069f2320b906b21b4` passed its complete plan-required gate set and was squash-merged as PR #37. Resulting production base is `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`; post-merge verify run `34487321835` is SUCCESS.

## Wave 1 — independent core lanes

**Common exact Wave 1 implementation base (historical):** `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`\
**Post-RC-F0 main verification:** `34487321835` SUCCESS

Wave 1 production branches started from this exact SHA. It is historical and is not a base for new work.

| ROLE | Branch | Status | Evidence | Bounded plan | Produces |
| --- | --- | --- | --- | --- | --- |
| `EPG-N` | `feature/epg-normalizer` | `CLOSED GREEN` | #41 `e6cef93`; verify `34506778803` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-n-normalizer.md` | common EPG normalization/time rules |
| `EPG-X` | `feature/epg-xtream-adapter` | `CLOSED GREEN` | #47 `5139f2a`; verify `34507365929` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-x-xtream-adapter.md` | Xtream EPG decoding/source boundary |
| `EPG-XML` | `feature/epg-xmltv-parser` | `CLOSED GREEN` | #49 `ead7a6d`; verify `34507653188` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-xml-xmltv-parser.md` | XMLTV parser primitives |
| `EPG-MAP` | `feature/epg-channel-mapper` | `CLOSED GREEN` | #42 `8decf90`; verify `34506863377` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-map-channel-mapper.md` | stable EPG↔channel reconciliation |
| `EPG-Q` | `feature/epg-query-engine` | `CLOSED GREEN` | #45 `5260e86`; verify `34507160096` | `docs/superpowers/plans/2026-09-10-v1-wave1-epg-q-query-engine.md` | current/next/detail query logic |
| `FAV-D` | `feature/favorites-domain` | `CLOSED GREEN` | #48 `60556da`; verify `34507449210` | `docs/superpowers/plans/2026-09-10-v1-wave1-fav-d-favorites-domain.md` | Favorites domain/service + repository interface use |
| `SRCH-C` | `feature/search-core` | `CLOSED GREEN` | #51 `87ff82f`; verify `34507744571` | `docs/superpowers/plans/2026-09-10-v1-wave1-srch-c-search-core.md` | Turkish-safe local Search core |
| `M3U-V` | `feature/m3u-entry-validation` | `CLOSED GREEN` | #43 `a7ad1ae`; verify `34507001805` | `docs/superpowers/plans/2026-09-10-v1-wave1-m3u-v-entry-validation.md` | modern M3U entry validation primitives |
| `WATCH-R` | `feature/watch-state-domain` | `CLOSED GREEN` | #44 `c32aa78`; verify `34507076802` | `docs/superpowers/plans/2026-09-10-v1-wave1-watch-r-watch-domain.md` | last-watched/watch-event domain |
| `WATCH-S` | `feature/watch-score` | `CLOSED GREEN` | #46 `3481b9b`; verify `34507251844` | `docs/superpowers/plans/2026-09-10-v1-wave1-watch-s-scoring.md` | pure frequently-watched scoring |
| `PAIR-C` | `feature/pairing-crypto` | `CLOSED GREEN` | #74 `3c768a8`; verify `34567883477` | `docs/superpowers/plans/2026-09-10-v1-wave1-pair-c-crypto.md` | pairing crypto primitives |
| `PAIR-S` | `feature/pairing-session` | `CLOSED GREEN` | #72 `afc428d`; verify `34567959149` | `docs/superpowers/plans/2026-09-10-v1-wave1-pair-s-session.md` | TTL/single-use/replay session state |
| `PAIR-R` | `feature/pairing-relay-contract` | `CLOSED GREEN` | #73 `8f25c99`; verify `34568001634` | `docs/superpowers/plans/2026-09-10-v1-wave1-pair-r-relay-contract.md` | ciphertext-only relay contract/client |
| `PAIR-WEB` | `feature/pairing-phone-ui` | `CLOSED GREEN` | #79 `8d6a94a`; verify `34610551534` | no plan file on `main` | phone pairing UI after pairing core interfaces are frozen |

Wave 1 workers must prefer new focused modules and memory/test doubles. They do not own IndexedDB schema migration, `main.js`, shared Live TV composition, provider runtime composition, or another worker's files.

## Wave 2 — persistence/provider integration

| ROLE | Branch | Status | Evidence | Depends on |
| --- | --- | --- | --- | --- |
| `EPG-P` | `integration/epg-persistence` | `CLOSED GREEN` | #53 `4f2b49b`; verify `34513484334` | RC-F0 + EPG normalization/query contracts |
| `USER-P` | `integration/user-state-persistence` | `CLOSED GREEN` | #52 `e1cec86`; verify `34513384304` | `FAV-D` + `WATCH-R` + RC-F0 |
| `EPG-PI` | `integration/epg-provider-capability` | `CLOSED GREEN` | #56 `aa8f7c2`; verify `34521206939` | `EPG-N/X/XML/MAP/P` as applicable |
| `M3U-C` | `integration/m3u-provider-core` | `CLOSED GREEN` | #54 `79d9ff1`; verify `34513583805` | `M3U-V` + existing Provider Core |
| `WATCH-I` | `integration/watch-playback-events` | `CLOSED GREEN` | #57 `7b9b61c`; verify `34521303374` | `WATCH-R` + `WATCH-S` + `USER-P` |

IndexedDB ordering resolved: `USER-P` (#52) merged first without changing `player/src/storage/indexeddb-structured-store.ts`; `EPG-P` (#53) owned that structured-store change.

## Wave 3 — UI lanes

| ROLE | Branch | Status | Evidence | Depends on |
| --- | --- | --- | --- | --- |
| `EPG-UI` | `feature/epg-live-tv-ui` | `CLOSED GREEN` | #59 `bdacdf4`; verify `34525941328` | EPG query/provider contracts |
| `FAV-UI` | `feature/favorites-ui` | `CLOSED GREEN` | #58 `36cd720`; verify `34525854757` | `FAV-D` + persistence read/write contract |
| `SRCH-UI` | `feature/search-ui` | `CLOSED GREEN` | #62 `515c200`; verify `34526338570` | `SRCH-C` |
| `ACT-UI` | `feature/channel-actions-ui` | `CLOSED GREEN` | #60 `6fff7f4`; verify `34526036336` | Favorite + EPG action contracts |
| `M3U-UI` | `feature/m3u-onboarding-ui` | `CLOSED GREEN` | #61 `203c869`; verify `34526218501` | `M3U-C` |
| `HOME-D` | `feature/home-domain` | `CLOSED GREEN` | #64 `4a79f39`; verify `34526679999` | Favorites/watch/provider read contracts; EPG optional for current-program cards |
| `HOME-UI` | `feature/home-ui` | `CLOSED GREEN` | #71 `3a4d60d`; verify `34568048330` | `HOME-D` |
| `PROV-UI` | `feature/provider-management-ui` | `CLOSED GREEN` | #63 `5dacad6`; verify `34526500991` | stable provider-management operations |
| `FIRST-UI` | `feature/first-run-ui` | `CLOSED GREEN` | #65 `b55a016`; verify `34526851457` | Xtream + M3U entry callbacks |

UI workers do not own central application composition merely to demonstrate their component. Integration happens in the composition wave.

## Wave 4 — composition

| ROLE | Branch | Status | Evidence | Depends on |
| --- | --- | --- | --- | --- |
| `M4-COMP` | `integration/m4-live-tv-composition` | `CLOSED GREEN` | #70 `860d9ef`; verify `34568089899` | EPG + Favorites + Search + Actions lanes |
| `M5-COMP` | `integration/m5-app-composition` | `CLOSED GREEN` | #78 `48c3648`; verify `34610833464` | M3U + watch + Home + provider + first-run lanes + required M4 contracts |
| `PAIR-I` | `integration/pairing-onboarding` | `CLOSED GREEN` | #87 `0cdc1ed`; verify `34685628558` | Pairing core/UI + final onboarding + CredentialStore contracts |

Additional integration PRs merged in this wave:

- `integration/pairing-core` #84 `47cd97b`; verify `34646448598` (pairing core integration before `PAIR-I`);
- `integration/provider-delete-user-state` #83 `55c8a34`; verify `34645740581`;
- `integration/provider-reentry` #86 `97543d3`; verify `34646125895`.

These packages own the high-conflict runtime wiring. They should implement little or no new feature-core logic.

## Wave 5 — hardening

| ROLE | Branch | Status | Evidence | Domain |
| --- | --- | --- | --- | --- |
| `PERF` | `hardening/catalog-epg-performance` | `CLOSED GREEN` | #93 `8dd79a5`; verify `34702006852` | large catalogs/EPG/Search/Home performance |
| `FAIL` | `hardening/provider-failures` | `CLOSED GREEN` | #88 `2e932a9`; verify `34701946366` | 401/403/404/500, malformed, timeout/offline/cache failure |
| `MIG` | `hardening/storage-migrations` | `CLOSED GREEN` | #90 `e76d748`; verify `34701885699` | schema/corruption/user-state preservation |
| `NAV` | `hardening/focus-navigation` | `CLOSED GREEN` | #94 `90fa0f3`; verify `34702092541` | Back/focus/layer/reduced-motion regression |
| `PLAY` | `hardening/live-tv-regression` | `CLOSED GREEN` | #92 `d63b3a4`; verify `34702156562` | zap/stale intent/rollback/new-feature playback regressions |
| `SEC` | `hardening/security-privacy-final` (planned as `hardening/security-privacy-audit`) | `CLOSED GREEN` | #96 `409e416`; verify `34707993412`; plus `integration/m7-sec-legacy-persistence` #95 `1e90030`; verify `34702226663` | secret/log/DOM/storage/artifact audit |

Hardening does not become a general refactor wave. Every production fix follows reproduce → root cause → RED → minimum fix → GREEN.

## Wave 6 — release verification

| ROLE | Branch | Status | Evidence | Output |
| --- | --- | --- | --- | --- |
| `RC-BROWSER` | `verification/v1-rc-browser-h2` (planned as `verification/v1-rc-browser`) | `CLOSED GREEN` | #132 `450f681`; verify `34846072550` | deterministic 1920×1080 release matrix + screenshots/focus evidence |
| `RC-PACKAGE` | `verification/v1-rc-package` | `IN PROGRESS` | prerequisite RC FIX `fix/rc-version-prerelease` (PR #135); verification branch starts after it merges GREEN | exact-head test/typecheck/build/Tizen staging/package evidence |
| `CONTROLLER` | no production branch | `ACTIVE` | — | gate/merge/evidence authority |

RC-BROWSER was accepted by the controller under Task 13 on 2026-09-14 against production `eaa928c` (qualification head `aca5f44`; integrated suite 76/76 PASS in `rc-browser` run `34838069268` attempts 1 and 2). Its actual integration branch was `verification/v1-rc-browser-h2`; PR #132 merged with a merge commit, so the qualification SHAs stay reachable from `main`. Production defects found during qualification were routed to bounded fix PRs #105, #119, #129, #130, #131 and #134; #133 is credential-store hardening. Evidence: `docs/verification/rc-browser-execution.md`.

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

Controller prompt:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=CONTROLLER.
```

RC-PACKAGE prompt (start only after the RC FIX version-prerelease PR has merged and post-merge `main` verify is SUCCESS):

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=RC-PACKAGE.
```

## Current action

Waves 0–5 and RC-BROWSER are integrated on `main` (`main@450f681`, post-merge verify `34846072550` SUCCESS). The remaining repository gate before the first RC candidate is RC-PACKAGE, which waits on one RC FIX.

1. RC FIX `fix/rc-version-prerelease` (PR #135) from current `main`: derive a numeric `x.y.z` Tizen widget version for the staged `config.xml` and make `player/src/update.js` version comparison prerelease-aware; bounded TDD fix; exact-head verify GREEN and review clean; awaiting controller merge.
2. Merge the RC FIX PR; post-merge `main` verify must be SUCCESS.
3. RC-PACKAGE starts on `verification/v1-rc-package` from that exact post-fix `main`:
   - bump the version to `1.0.0-rc.1` (controller decision 2026-09-14, recorded in `v1-rc-readiness.md`);
   - run exact-head `npm test`, `npm run typecheck`, `npm run brand:check`, `npm run build` and `npm run tizen:build`;
   - check the staged `tizen/build/` output: application/package identity, numeric widget version, icon, privileges and asset paths;
   - run `npm run tizen:package`; if signing material or the Tizen CLI is absent, record it honestly as `NOT-AVAILABLE`, not PASS;
   - record exact head, command, exit result, counts and clean-diff status per the RC command gate in `v1-rc-readiness.md`.
4. No worker marks Ready or merges itself; Controller reviews exact-head evidence and merge order.

Open RC-BROWSER observations (interrupted onboarding, phone relay HTTP 500 copy, B06 Search) remain open and non-blocking. Physical-TV evidence remains governed by the existing RC readiness/controller boards and is not changed by this board.
