# BabuşTV V1 RC Readiness Board

**Date:** 2026-09-10  
**Owner:** REVIEW / Integration Controller  
**Status:** RC ROADMAP OPEN — IMPLEMENTATION NOT STARTED  
**Starting baseline:** `main@f3061cbad574b507b1f80cf23e19b8af179e90b0`  
**Baseline verify:** `34414698392` SUCCESS

## Purpose

This is the canonical status/evidence board for work between the completed B0 + Xtream integration baseline and the first BabuşTV V1 release candidate.

It separates:

- repository implementation work that can proceed without a physical TV;
- deterministic browser/build/security evidence;
- physical-Tizen acceptance that must remain pending/deferred until an applicable runtime is available.

Detailed roadmap: `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`.

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
| Open implementation blocker at roadmap start | none | New work may begin from fresh GREEN `main` after scoped plan approval |

## RC implementation queue

| Order | Work package | Status | TV required to implement? | Exit condition |
| ---: | --- | --- | --- | --- |
| 1 | M4A EPG Core | `PLANNED` | No | Normalized current/next/detail + bounded cache/query + malformed/large-data tests |
| 2 | M4B Live TV EPG presentation | `PLANNED` | No | Remote-first EPG UI + missing-EPG degradation + 1920×1080 evidence |
| 3 | M4C Favorites | `PLANNED` | No | Provider-scoped stable-ID durable favorites + virtual Favorites scope |
| 4 | M4D Local Search | `PLANNED` | No | Turkish-safe local search + large-list benchmark + highlight≠playback preserved |
| 5 | M4E Channel Options | `PLANNED` | No | Core actions reachable with six basic remote actions |
| 6 | M3U Provider-Core onboarding parity | `PLANNED` | No | Modern M3U add/validate/register/sync/activate flow; no credential leakage |
| 7 | M5A Watch State | `PLANNED` | No | Last watched + meaningful watch stats + provider-scoped frequently-watched state |
| 8 | M5B Home | `PLANNED` | No | Provider / Last Watched / Live TV / Favorites / Frequently Watched / Settings flow |
| 9 | M5C Provider Management | `PLANNED` | No | Switch/add/edit/delete with provider-scoped cleanup |
| 10 | M5D First Run | `PLANNED` | No | Short branded Provider Ekle flow; later boots remain restrained |
| 11 | M6 Secure Pairing | `PLANNED` | No for protocol/browser development | Ephemeral encrypted single-use pairing + public/self-host-compatible relay contract |
| 12 | M7 Hardening | `PLANNED` | No for deterministic matrix | Large/malformed/offline/migration/focus/security cases GREEN |
| 13 | Browser Release Matrix | `PLANNED` | No | Deterministic 1920×1080 release smoke GREEN |
| 14 | Tizen build/package RC gate | `PLANNED` | No for build; environment-dependent for package signing | Available package/staging gates GREEN, unavailable paths honestly classified |
| 15 | V1 RC versioning decision | `PLANNED` | No | Explicit choice: independent `1.0.0-rc.1` line or inherited version continuation |

## Required per-package workflow

Each production package must have a bounded scope and independent review gate:

```text
fresh GREEN main
  → approved slice spec/plan
  → characterization
  → RED
  → minimum implementation
  → focused GREEN
  → full regression/typecheck/build/security gates
  → exact diff review
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
| M3 13-row Live TV UI/playback runtime matrix | `DEFERRED` | Directly observable supported Tizen runtime with remote/human/screen evidence |
| Real optional Samsung keys | `DEFERRED` | Supported-key discovery and behavior on device |
| Real CH± / numeric keys | `DEFERRED` | Physical remote acceptance |
| Shaka → AVPlay/native fallback | `DEFERRED` | Reproducible on-device fallback evidence |
| Lifecycle / suspend / resume / relaunch | `DEFERRED` | Real-device lifecycle smoke |
| Back / exit convention | `DEFERRED` | Real Samsung behavior observed |
| Repeated real-device zapping | `DEFERRED` | Stability and interruption observation |
| Long playback / memory | `DEFERRED` | Extended physical-runtime session |
| On-device network loss/recovery | `DEFERRED` | Observable recovery/failure behavior |
| Persisted settings/provider after relaunch | `DEFERRED` | Real Tizen persistence check |
| Supported Tizen floor/model acceptance | `DEFERRED` | Applicable hardware/RTL/emulator matrix |
| Final release install/package smoke | `DEFERRED` | Candidate WGT installed and exercised on release-truth environment |

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

At creation of this board:

- repository baseline is GREEN;
- no production implementation for this roadmap has started;
- the next production package is M4A only after its bounded spec/plan is written and approved;
- old B0/M3G/Xtream worker branches are historical evidence, not implementation bases;
- merge authority remains Controller / explicit user instruction.

## RC completion rule

An RC candidate may be produced when all TV-optional V1 work and deterministic release gates are GREEN, with external physical-Tizen rows explicitly still `PENDING`/`DEFERRED`.

Final `BabuşTV 1.0.0` may be called release-accepted only after the mandatory physical-Tizen debt is satisfied.
