# BabuşTV V1 RC Readiness Board

> **M7 CURRENT-TRUTH OVERLAY — 2026-09-12:** The historical RC-F0 / Wave 1 status below is retained as evidence but is no longer the current execution state. Wave 3C is CLOSED; `PAIR-I-WIRE` merged through PR #87; production `main` is exactly `0cdc1ed240707b389d202d48efeaaf5822fe2316`; post-merge verify `34685628558` is SUCCESS. Repository-complete RC implementation work is now **M7 Hardening**. The authoritative current M7 board is `docs/verification/m7-hardening-execution.md`. Six M7 workers (`PERF`, `FAIL`, `MIG`, `NAV`, `PLAY`, `SEC`) are `READY / PLAN-BACKED` from the exact frozen production base. Physical Samsung/Tizen evidence remains `PENDING` / `DEFERRED`; deterministic browser/build/test evidence is not physical PASS.

**Date:** 2026-09-10  
**Owner:** REVIEW / Integration Controller  
**Status:** RC ROADMAP ACTIVE — RC-F0 CLOSED GREEN; 13 WAVE 1 CORE ROLES PLAN-BACKED AND OPEN  
**Starting baseline:** `main@f3061cbad574b507b1f80cf23e19b8af179e90b0`  
**Baseline verify:** `34414698392` SUCCESS

## Purpose

This is the canonical status/evidence board for work between the completed B0 + Xtream integration baseline and the first BabuşTV V1 release candidate.

It separates:

- repository implementation work that can proceed without a physical TV;
- deterministic browser/build/security evidence;
- physical-Tizen acceptance that must remain pending/deferred until an applicable runtime is available.

Detailed roadmap: `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`.

Maximum-parallel execution design: `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`.

Live role/dependency board: `docs/verification/v1-parallel-execution.md`.

Approved product spec: `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `CLOSED GREEN` | Integrated and verified on the required repository gates |
| `PLANNED` | In V1 RC scope; implementation has not started |
| `IN PROGRESS` | Active scoped branch/PR exists |
| `BLOCKED` | Repository work cannot proceed because a concrete dependency is unsatisfied |
| `PENDING` | Required evidence has not yet been obtained |
| `DEFERRED` | Intentionally postponed because the required external environment is unavailable |
| `NOT-AVAILABLE` | A specific verification command/environment is unavailable; not a PASS |

## Current baseline

| Area | Status | Evidence / note |
| --- | --- | --- |
| B0 brand/product separation | `CLOSED GREEN` | B0A–B0G merged |
| Provider Core registration hardening | `CLOSED GREEN` | PR #28 merged |
| Xtream onboarding core | `CLOSED GREEN` | PR #29 merged |
| Xtream remote-first entry UI | `CLOSED GREEN` | PR #30 merged |
| Xtream application integration | `CLOSED GREEN` | PR #31 merged; post-merge product baseline `640e503...` GREEN |
| Docs closeout baseline | `CLOSED GREEN` | `main@f3061cb...`; verify `34414698392` SUCCESS |
| Maximum-parallel execution design | `CLOSED GREEN` | design and RC-F0 bounded plan integrated before production start |
| RC-F0 shared contracts | `CLOSED GREEN` | PR #37 squash-merged; resulting `main@aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`; post-merge verify `34487321835` SUCCESS |
| Wave 1 implementation base | `CLOSED GREEN` | common exact base frozen at `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` |
| Wave 1 bounded plan pack | `CLOSED GREEN` | 13 independent core roles have controller-authored bounded plans; live status is `OPEN` in `v1-parallel-execution.md` |
| Open implementation blocker | none for the 13 core lanes | `PAIR-WEB` remains separately `BLOCKED-CONTRACT` until pairing interfaces are frozen |

## RC product implementation queue

This table remains product-level. A role becoming `OPEN` means it may start; package status stays `PLANNED` until a scoped worker branch/PR actually begins implementation. The actual worker decomposition is tracked separately in `docs/verification/v1-parallel-execution.md`.

| Order | Work package | Status | TV required to implement? | Exit condition |
| ---: | --- | --- | --- | --- |
| 0 | RC-F0 shared contracts | `CLOSED GREEN` | No | common EPG/user-state/capability seams frozen without feature behavior |
| 1 | M4 EPG core/integration | `PLANNED` | No | normalized current/next/detail + bounded cache/query + malformed/large-data tests |
| 2 | M4 Live TV EPG presentation | `PLANNED` | No | remote-first EPG UI + missing-EPG degradation + 1920×1080 evidence |
| 3 | M4 Favorites | `PLANNED` | No | provider-scoped stable-ID durable favorites + virtual Favorites scope |
| 4 | M4 Local Search | `PLANNED` | No | Turkish-safe local search + large-list benchmark + highlight≠playback preserved |
| 5 | M4 Channel Options | `PLANNED` | No | core actions reachable with six basic remote actions |
| 6 | M3U Provider-Core onboarding parity | `PLANNED` | No | modern M3U add/validate/register/sync/activate flow; no credential leakage |
| 7 | M5 Watch State | `PLANNED` | No | last watched + meaningful watch stats + provider-scoped frequently-watched state |
| 8 | M5 Home | `PLANNED` | No | Provider / Last Watched / Live TV / Favorites / Frequently Watched / Settings flow |
| 9 | M5 Provider Management | `PLANNED` | No | switch/add/edit/delete with provider-scoped cleanup |
| 10 | M5 First Run | `PLANNED` | No | short branded Provider Ekle flow; later boots remain restrained |
| 11 | M6 Secure Pairing | `PLANNED` | No for protocol/browser development | ephemeral encrypted single-use pairing + public/self-host-compatible relay contract |
| 12 | M7 Hardening | `PLANNED` | No for deterministic matrix | large/malformed/offline/migration/focus/security cases GREEN |
| 13 | Browser Release Matrix | `PLANNED` | No | deterministic 1920×1080 release smoke GREEN |
| 14 | Tizen build/package RC gate | `PLANNED` | No for build; environment-dependent for package signing | available package/staging gates GREEN, unavailable paths honestly classified |
| 15 | V1 RC versioning decision | `PLANNED` | No | explicit choice: independent `1.0.0-rc.1` line or inherited version continuation |

## Parallel execution overlay

RC-F0 is merged and its post-merge `main` is GREEN. The common Wave 1 implementation base is frozen at:

```text
aac531b15bad85f6e7ae42c6ff1a6b71eed289d1
```

Post-merge verification: `34487321835` SUCCESS.

The following 13 core roles have bounded plans and are `OPEN`:

```text
EPG-N EPG-X EPG-XML EPG-MAP EPG-Q
FAV-D SRCH-C M3U-V WATCH-R WATCH-S
PAIR-C PAIR-S PAIR-R
```

`PAIR-WEB` remains `BLOCKED-CONTRACT` until the pairing crypto/session/relay interfaces are merged and frozen. Recommended active concurrency is 8–12 workers so controller review and CI remain effective even though all 13 independent core roles are eligible to start.

All 13 production branches must start from exact `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`, not from later documentation-only `main` commits unless the controller explicitly records a new production base. Shared runtime/storage hot-zone changes remain deferred to named persistence/integration/composition roles.

## Required per-package workflow

Each production package must have a bounded scope and independent review gate:

```text
fresh exact GREEN allowed base
  → approved role spec/plan
  → characterization
  → RED
  → minimum implementation
  → focused GREEN
  → full regression/typecheck/build/security gates
  → exact diff + file-ownership review
  → browser/Tizen evidence as applicable
  → Draft PR
  → controller review
  → explicit merge authority
  → post-merge main GREEN
```

Parallel work is allowed only when file ownership and semantic dependencies do not overlap. Dependent packages must wait for their required predecessor to merge and return GREEN.

## RC deterministic release matrix

Before an RC is declared ready, record evidence for these scenarios where applicable:

| Scenario | Required before RC | Physical TV required? | Current status |
| --- | --- | --- | --- |
| Cold boot / branded shell | Yes | No | `PLANNED` for final matrix; earlier B0 evidence exists |
| Xtream add / fail / success | Yes | No | existing implementation GREEN; rerun in final matrix |
| M3U add / fail / success | Yes | No | `PLANNED` |
| Home and default focus | Yes | No | `PLANNED` |
| Provider switching | Yes | No | `PLANNED` |
| Live TV overlay/navigation | Yes | No | existing deterministic tests; rerun after M4/M5 changes |
| Explicit channel play vs highlight | Yes | No | existing M3 invariant; must remain GREEN |
| CH± logical behavior | Yes | No | deterministic simulation possible |
| Numeric zap logical behavior | Yes | No | deterministic simulation possible |
| EPG present/missing/broken | Yes | No | `PLANNED` |
| Favorites | Yes | No | `PLANNED` |
| Search | Yes | No | `PLANNED` |
| Last Watched | Yes | No | `PLANNED` |
| Frequently Watched | Yes | No | `PLANNED` |
| Settings/provider management | Yes | No | `PLANNED` |
| Offline/provider failure | Yes | No | extend deterministic matrix |
| Cache fallback | Yes | No | extend deterministic matrix |
| Back/layer ownership | Yes | No | existing M3 behavior; rerun after new surfaces |
| Focus restoration | Yes | No | stable-ID regression required |
| Reduced motion | Yes | No | B0 baseline exists; rerun on final surfaces |
| Secret/log/artifact audit | Yes | No | `PLANNED` final gate |

## Physical-Tizen evidence debt

These rows are not repository implementation blockers while TV access is unavailable, but they block final `BabuşTV 1.0.0` release acceptance.

| Gate | Current status | Required evidence |
| --- | --- | --- |
| M2 WidgetData credential-store runtime probe | `PENDING` | API access + synthetic write/read + relaunch persistence + replace + remove + absence + sanitized failure |
| M3 13-row Live TV UI/playback runtime matrix | `DEFERRED` | directly observable supported Tizen runtime with remote/human/screen evidence |
| Real optional Samsung keys | `DEFERRED` | supported-key discovery and behavior on device |
| Real CH± / numeric keys | `DEFERRED` | physical remote acceptance |
| Shaka → AVPlay/native fallback | `DEFERRED` | reproducible on-device fallback evidence |
| Lifecycle / suspend / resume / relaunch | `DEFERRED` | real-device lifecycle smoke |
| Back / exit convention | `DEFERRED` | real Samsung behavior observed |
| Repeated real-device zapping | `DEFERRED` | stability and interruption observation |
| Long playback / memory | `DEFERRED` | extended physical-runtime session |
| On-device network loss/recovery | `DEFERRED` | observable recovery/failure behavior |
| Persisted settings/provider after relaunch | `DEFERRED` | real Tizen persistence check |
| Supported Tizen floor/model acceptance | `DEFERRED` | applicable hardware/RTL/emulator matrix |
| Final release install/package smoke | `DEFERRED` | candidate WGT installed and exercised on release-truth environment |

No row in this table may be converted to PASS solely because unit tests, browser smoke, package construction, install, or launch succeeded.

## RC command gate

Expected repository commands at the first RC candidate:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
npm run tizen:package
```

For every command record:

- exact candidate head;
- command;
- exit result;
- relevant test counts/output summary;
- any `NOT-AVAILABLE` environmental limitation;
- clean-diff status.

## Security/privacy release gate

Final audit must demonstrate that active source, storage, logs, errors, screenshots, and CI artifacts do not expose:

- passwords;
- credential-bearing provider URLs;
- tokens;
- transient stream URLs;
- decrypted pairing payloads;
- plaintext Provider Core credentials in localStorage or ordinary IndexedDB.

Synthetic/fake provider data only in public CI and screenshots.

## Controller state

Current controller state:

- RC roadmap documentation and maximum-parallel design are integrated;
- RC-F0 plan was implemented on `foundation/v1-rc-contracts`, final worker head `8a216600b8244c58e7fabb8069f2320b906b21b4`;
- RC-F0 plan-required exact-head gates are GREEN, including `brand:check` and `tizen:build` evidence from verification run `34486768193`;
- PR #37 was squash-merged to `main@aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`;
- post-merge `main` verify `34487321835` is SUCCESS;
- `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` is the common exact Wave 1 implementation base;
- 13 independent core roles have approved bounded plans and are `OPEN`; the live plan paths/ownership are recorded in `v1-parallel-execution.md`;
- `PAIR-WEB` remains `BLOCKED-CONTRACT` until the pairing core interfaces are merged/frozen;
- dependent Wave 2/UI roles remain blocked until their required core predecessors merge and post-merge verification is GREEN;
- old B0/M3G/Xtream worker branches are historical evidence, not implementation bases;
- merge authority remains Controller / explicit user instruction.

## RC completion rule

An RC candidate may be produced when all TV-optional V1 work and deterministic release gates are GREEN, with external physical-Tizen rows explicitly still `PENDING`/`DEFERRED`.

Final `BabuşTV 1.0.0` may be called release-accepted only after the mandatory physical-Tizen debt is satisfied.
