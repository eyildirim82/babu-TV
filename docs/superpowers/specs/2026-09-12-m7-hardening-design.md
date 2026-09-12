# BabuşTV Wave 7 / M7 Hardening Design

**Date:** 2026-09-12  
**Status:** APPROVED / FROZEN FOR EXECUTION  
**Role:** `M7-F0`  
**Repository:** `eyildirim82/babu-TV`  
**Frozen production base:** `0cdc1ed240707b389d202d48efeaaf5822fe2316`  
**Frozen-base verification:** `34685628558` SUCCESS  
**Docs branch:** `docs/m7-hardening-execution`

## 1. Purpose

M7 is the repository-complete hardening wave after the completed Wave 3C feature/integration program. It exists to prove and, only where a deterministic regression is reproduced, minimally repair release-candidate behavior across performance, provider failures, storage/migrations, focus/navigation, playback and security/privacy.

M7 is not a feature wave and is not a general refactor wave.

The governing repair sequence is:

```text
reproduce
→ RED
→ root cause
→ minimum fix
→ GREEN
```

If a scenario is already GREEN on the frozen base, the lane records deterministic coverage and does not manufacture a production change.

## 2. Frozen current truth

The controller freezes the following as the M7 starting state:

- Wave 3C is CLOSED.
- `PAIR-I-WIRE` merged through PR #87.
- production `main` is exactly `0cdc1ed240707b389d202d48efeaaf5822fe2316`.
- post-merge workflow `34685628558` is SUCCESS for that exact SHA.
- repository-complete RC work is now M7 Hardening.
- no physical Samsung/Tizen device is available for this wave.
- physical Tizen acceptance remains explicitly `DEFERRED` / `PENDING` where applicable.
- deterministic unit/integration/browser/build evidence must never be promoted to physical-device PASS.

Historical Wave 1–3C evidence remains historical evidence. M7 supersedes stale controller wording that still describes early RC lanes as the current execution state; it does not rewrite those historical checkpoints.

## 3. Branch and provenance model

All six production workers branch independently from the exact frozen production base:

| ROLE | Branch | Exact base |
| --- | --- | --- |
| `PERF` | `hardening/catalog-epg-performance` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `FAIL` | `hardening/provider-failures` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `MIG` | `hardening/storage-migrations` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `NAV` | `hardening/focus-navigation` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `PLAY` | `hardening/live-tv-regression` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `SEC` | `hardening/security-privacy-audit` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |

`docs/m7-hardening-execution` is read-only planning input to production workers. Documentation commits from this branch must never be cherry-picked into a production worker branch.

All six workers may execute concurrently. Preferred merge order is a controller integration preference, not worker execution order:

```text
MIG
→ FAIL
→ PERF
→ NAV
→ PLAY
→ SEC-FINAL
```

## 4. Global forbidden hot zones

The following files are forbidden to all six workers:

```text
player/src/main.js
player/src/app/app-composition.ts
player/src/app/browser-app-dependencies.ts
player/src/live-tv/create-live-tv-runtime.ts
player/src/live-tv/live-tv-controller.ts
```

Workers also may not widen arbitrary shared contracts merely to make a hardening test convenient.

If a deterministic RED proves that one of these hot-zone files must change, the worker stops production widening and reports `INTEGRATION FIX REQUIRED`. That report must include the exact failing test command and test name, the minimum required hot-zone path, the bounded root cause, and why no owned file can repair the defect.

The controller may then create a separate `ROLE=M7-I` integration-fix lane from an approved exact base. The originating worker does not edit the hot zone itself.

## 5. Ownership frozen from the production tree

### 5.1 PERF — catalog / EPG / Search / Home performance

PERF owns performance investigation and proven minimum fixes in:

```text
player/src/epg/normalize.ts
player/src/epg/query-engine.ts
player/src/epg/structured-epg-program-repository.ts
player/src/search/search-core.ts
player/src/search/search-view-model.ts
player/src/home/home-domain.ts
player/src/repository/structured-catalog-repository.ts   # query/read performance only
```

It additionally owns M7-specific synthetic large-data fixtures and performance tests.

PERF does not own schema/version semantics, corruption recovery, provider network behavior, presentation navigation or playback. `structured-catalog-repository.ts` is a controller-serialized conditional collision with MIG: PERF may change only proven read/query complexity; MIG may change only migration/corruption/preservation semantics. They never edit that file concurrently.

### 5.2 FAIL — provider failure boundaries

FAIL owns proven provider failure-handling fixes in:

```text
player/src/providers/http/fetch-provider-http-client.ts
player/src/providers/errors.ts
player/src/providers/provider-core-service.ts
player/src/providers/provider-sync-service.ts
player/src/providers/provider-epg-service.ts
player/src/providers/provider-reentry-service.ts
player/src/providers/m3u/m3u-onboarding-service.ts
player/src/providers/m3u/m3u-provider.ts
player/src/providers/xtream/xtream-provider.ts
player/src/epg/xtream-source.ts
```

FAIL owns deterministic regressions for HTTP 401/403/404/500, timeout/offline behavior, malformed provider responses, stale-cache/refresh-failure semantics and provider-status error behavior.

Provider runtime composition remains read-only. Shared provider contracts are read-only unless a concrete failure proves a contract defect; contract widening then requires controller approval before any edit.

### 5.3 MIG — storage, migration and corruption recovery

MIG owns:

```text
player/src/storage/contracts.ts
player/src/storage/indexeddb-structured-store.ts
player/src/storage/memory-structured-store.ts
player/src/epg/structured-epg-program-repository.ts
player/src/repository/structured-catalog-repository.ts
player/src/repository/structured-favorite-repository.ts
player/src/repository/structured-provider-repository.ts
player/src/repository/structured-watch-state-repository.ts
```

Its concern is schema/data corruption behavior, migration safety, structured-repository recovery and durable provider/user-state preservation/isolation. It does not own credentials, provider networking, business-domain rewrites or application composition.

`structured-epg-program-repository.ts` and `structured-catalog-repository.ts` are controller-serialized conditional collisions with PERF. MIG owns persistence integrity; PERF owns only proven read/query performance. The controller prevents simultaneous edits to either path.

### 5.4 NAV — focus, Back and presentation navigation

NAV owns navigation/focus regressions in:

```text
player/src/focus/focus-reducer.ts
player/src/home/home-view.ts
player/src/first-run/first-run-view.ts
player/src/provider-management/provider-management-presenter.ts
player/src/app/provider-management-surface.ts
player/src/live-tv/dom-live-tv-view.ts
player/src/live-tv/live-tv-state.ts
player/src/live-tv/epg-live-tv-presentation.ts
player/src/live-tv/epg-live-tv-view-model.ts
```

Production edits are allowed only when a RED proves the affected presentation-navigation defect. NAV owns focus restoration, one-layer Back behavior, repeated open/close transitions and reduced-motion navigation regressions. It does not own application routing/composition or implicit playback semantics.

### 5.5 PLAY — playback and Live TV intent regression

PLAY owns:

```text
player/src/playback/*
player/src/live-tv/channel-intent-coordinator.ts
player/src/live-tv/provider-stream-resolver.ts
player/src/watch/playback-session-observer.ts
```

It owns rapid zap, stale intent/completion, last-intent-wins, bounded rollback, cross-provider playback handoff and watch playback-session regression behavior.

PLAY must preserve the existing separation that provider selection/navigation alone does not start playback. It does not own central Live TV runtime/controller composition.

### 5.6 SEC — security / privacy audit and proven secret-boundary fixes

SEC owns:

```text
player/test-ts/m7-security-privacy-audit.test.ts
player/src/logging/sanitize.ts                         # only if RED proves a defect
tools/check-m7-security-privacy.mjs                  # audit tooling
```

SEC may make a minimum production fix in an existing credential/provider/pairing secret boundary only when an audit RED proves a concrete leak or unsafe serialization. It does not own general refactoring of credentials, providers or pairing.

Because provider files can also be functionally owned by FAIL, a SEC secret defect in the same file acquires a controller file lock. The controller does not allow concurrent FAIL and SEC edits to one path. Security semantics take the SEC lane; ordinary provider failure semantics stay in FAIL.

SEC performs an early frozen-base audit, but that audit is not final acceptance. `SEC-FINAL` means the full security/privacy audit is rerun after every accepted M7 production merge on the integrated exact `main` head.

## 6. Consumed and produced contracts

| ROLE | Consumes | Produces |
| --- | --- | --- |
| PERF | frozen EPG/query, catalog repository, Search and Home domain contracts | deterministic large-data/work-count evidence; minimum complexity fixes where RED proves need |
| FAIL | frozen provider HTTP, adapter, sync, EPG, onboarding and cache contracts | sanitized deterministic failure behavior and stale-cache preservation evidence |
| MIG | frozen StructuredStore and repository contracts | migration/corruption recovery evidence and preservation/isolation fixes without secret persistence |
| NAV | frozen focus/presentation/view-model contracts | deterministic focus/Back/layer/reduced-motion behavior |
| PLAY | frozen playback/session, stream resolver, intent and watch observer contracts | zap/stale-intent/rollback/cross-provider regression evidence |
| SEC | all active source surfaces read-only plus frozen credential/provider/pairing boundaries | audit tooling/tests; minimum proven leak fixes; integrated `SEC-FINAL` acceptance |

No lane creates a new product-wide abstraction to avoid an existing frozen seam.

## 7. Hardening scenario matrix

The M7 deterministic matrix is divided by owner:

| Scenario | Owner |
| --- | --- |
| 1,000+ channels, many categories | PERF |
| large EPG normalization/query/read | PERF |
| Turkish Search large-list behavior | PERF |
| Home projection on large provider/user state | PERF |
| malformed Xtream/M3U/provider response | FAIL |
| HTTP 401/403/404/500 | FAIL |
| timeout / offline | FAIL |
| stale cache + failed refresh | FAIL |
| background EPG/provider refresh failure | FAIL |
| corrupted structured data | MIG |
| schema migration / upgrade | MIG |
| provider/favorite/watch isolation across migration | MIG |
| repeated overlay/layer Back | NAV |
| stable focus restoration after re-render/reorder | NAV |
| reduced-motion navigation | NAV |
| rapid repeated zap | PLAY |
| stale playback intent/completion | PLAY |
| target failure with rollback | PLAY |
| cross-provider playback failure preserving current stream/session | PLAY |
| watch playback-session regression | PLAY |
| passwords / credential-bearing URLs / tokens / stream URLs in logs/errors/DOM/storage/artifacts | SEC |
| localStorage / ordinary IndexedDB credential regression | SEC |
| decrypted pairing payload leakage | SEC |
| unsafe `console.*` / error serialization | SEC |

Cross-domain bugs follow the owning behavior, not the file most convenient to edit. If the minimum repair is in a forbidden hot zone, use the `M7-I` stop path.

## 8. Performance methodology

M7 does not invent arbitrary wall-clock budgets.

PERF must first measure frozen-base behavior with synthetic deterministic datasets. Assertions should prefer algorithmic/work-count properties where practical, for example bounded repository scans/calls, single normalization passes, stable result counts or non-multiplicative query work.

Wall-clock measurements may be recorded as diagnostics but are not the primary correctness gate unless the repository already has a stable benchmark contract. An optimization is allowed only after a reproducible pathological behavior or complexity defect is proven.

## 9. Failure and preservation semantics

M7 hardening must preserve these product invariants:

- provider/network/EPG failure does not erase useful provider cache or durable user state;
- credential-bearing values never enter normal catalog/provider persistence or public errors;
- a failed refresh does not convert a usable stale cache into empty/unusable state unless the existing contract explicitly requires replacement;
- provider kind and provider identity rules remain unchanged by hardening;
- no hardening lane silently changes activation semantics;
- navigation/highlight never becomes implicit playback;
- playback recovery remains bounded and last-intent-wins.

## 10. Security/privacy acceptance model

SEC has two phases:

1. **SEC-EARLY:** run source/test/tooling audit against frozen base `0cdc1ed240707b389d202d48efeaaf5822fe2316`; create RED tests/tooling for concrete leaks; make only proven bounded fixes.
2. **SEC-FINAL:** after MIG, FAIL, PERF, NAV, PLAY and any required M7-I merges are accepted and the resulting exact `main` verify is GREEN, rerun the complete audit on that integrated exact head.

Only SEC-FINAL may close the M7 security/privacy gate.

Audit scope includes active source, tests, synthetic evidence and generated browser/build artifacts where available. Public evidence uses synthetic/example data only.

## 11. Verification command contract

Every worker uses focused test commands from its bounded plan, then runs the repository-supported full gate set before controller review:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --check 0cdc1ed240707b389d202d48efeaaf5822fe2316...HEAD
git diff --name-only 0cdc1ed240707b389d202d48efeaaf5822fe2316...HEAD
```

`npm run tizen:package` is a later RC/package gate and may be environment-dependent. If it is attempted in M7 and unavailable, it is `NOT-AVAILABLE`, never PASS.

Every production worker opens a Draft PR only. No worker self-merges or marks its own PR Ready.

## 12. M7 integration and completion

M7 completes only when:

```text
PERF GREEN
FAIL GREEN
MIG GREEN
NAV GREEN
PLAY GREEN
required M7-I fixes GREEN, if any
integrated main exact-head verify GREEN
SEC-FINAL GREEN
```

A worker being individually GREEN is not enough to close M7.

After M7 closes, the repository proceeds to:

```text
RC-BROWSER + RC-PACKAGE
→ explicit version decision
→ repository-complete BabuşTV 1.0.0-rc.1 candidate
```

The repository-complete RC is not the same as physical-Tizen release acceptance.

## 13. Physical-Tizen evidence classification

No physical Samsung/Tizen device is available. Therefore hardware-only rows remain `PENDING` or `DEFERRED`, including applicable WidgetData runtime proof, real remote behavior, real playback fallback, lifecycle, long-playback/memory, on-device recovery and release install/smoke.

Unit, integration, browser, build, staged-package or CI success may support repository-complete RC readiness but may not convert a hardware-only row to PASS.

## 14. Controller decision

There is no unresolved architectural blocker to starting the six M7 production lanes from the frozen base. The only pre-declared conflict points are controller-serialized file collisions, not dependency blockers:

- PERF ↔ MIG: `structured-epg-program-repository.ts` / `structured-catalog-repository.ts` when both need the same exact path;
- FAIL ↔ SEC: an existing provider file when SEC proves a secret-boundary defect in that file.

All other lane ownership is disjoint under the forbidden-hot-zone policy. Workers are therefore `READY / PLAN-BACKED` once the corresponding bounded plan in this docs branch is read.
