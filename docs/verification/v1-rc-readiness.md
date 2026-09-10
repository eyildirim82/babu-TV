# BabuşTV V1 RC Readiness Board

**Date:** 2026-09-10  
**Owner:** REVIEW / Integration Controller  
**Status:** RC ROADMAP + MAX-PARALLEL DESIGN APPROVED — RC-F0 PLAN DRAFTED; PRODUCTION NOT STARTED  
**Starting baseline:** `main@f3061cbad574b507b1f80cf23e19b8af179e90b0`  
**Baseline verify:** `34414698392` SUCCESS

## Purpose

This is the canonical status/evidence board for work between the completed B0 + Xtream integration baseline and the first BabuşTV V1 release candidate.

It separates repository implementation work that can proceed without a physical TV, deterministic browser/build/security evidence, and physical-Tizen acceptance that must remain pending/deferred until an applicable runtime is available.

Canonical execution documents:

- Product scope: `docs/superpowers/specs/2026-09-10-babustv-v1-rc-scope.md`
- Master roadmap: `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`
- Maximum-parallel design: `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`
- Parallel role board: `docs/verification/v1-parallel-execution.md`
- RC-F0 plan: `docs/superpowers/plans/2026-09-10-v1-rc-f0-shared-contracts.md`
- Approved product spec: `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `CLOSED GREEN` | Integrated and verified on required repository gates |
| `PLAN-DRAFTED` | Bounded plan exists but production execution has not been authorized/opened |
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
| Maximum-parallel execution design | approved in current docs stack | no production implementation started |
| RC-F0 shared contracts | `PLAN-DRAFTED` | contract-only plan; awaits documentation integration + explicit execution/opening |
| Open production blocker | none | production intentionally gated on docs integration and RC-F0 approval |

## RC execution sequence

```text
RC docs + maximum-parallel design
        ↓
RC-F0 shared contracts (serial)
        ↓ exact GREEN post-F0 main
        ↓
Wave 1 independent core lanes (8–12 active recommended; ~13 core lanes available)
        ↓
Persistence/provider integrations
        ↓
Independent UI lanes
        ↓
M4 / M5 / Pairing composition
        ↓
Parallel hardening
        ↓
Browser + package release verification
        ↓
BabuşTV RC candidate
```

The detailed role/dependency matrix is authoritative in `docs/verification/v1-parallel-execution.md`.

## Immediate repository gate

No production branch is OPEN yet.

Required next sequence:

1. integrate the RC roadmap/parallel-execution docs through controller authority;
2. verify resulting `main` exact GREEN;
3. approve the RC-F0 plan;
4. create `foundation/v1-rc-contracts` from that exact GREEN `main`;
5. run RC-F0 RED → minimum contracts/test doubles → GREEN;
6. exact-head CI + controller review + explicit merge authority;
7. verify post-F0 `main` GREEN;
8. record that SHA as the common Wave 1 base;
9. open approved independent Wave 1 roles.

RC-F0 explicitly does **not** bump IndexedDB schema/version, implement provider-specific EPG, Favorites behavior, Search behavior, watch scoring, M3U onboarding, pairing, Home, UI, playback, or runtime composition.

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

For every command record exact candidate head, command, exit result, relevant test counts/output summary, any `NOT-AVAILABLE` environmental limitation, and clean-diff status.

## Security/privacy release gate

Final audit must demonstrate that active source, storage, logs, errors, screenshots, and CI artifacts do not expose passwords, credential-bearing provider URLs, tokens, transient stream URLs, decrypted pairing payloads, or plaintext Provider Core credentials in localStorage/ordinary IndexedDB.

Synthetic/fake provider data only in public CI and screenshots.

## Controller state

At this docs-planning checkpoint:

- repository product baseline is GREEN;
- maximum-parallel design has user approval;
- RC-F0 implementation plan is drafted;
- no production role is OPEN yet;
- old B0/M3G/Xtream worker branches are historical evidence, not implementation bases;
- merge authority remains Controller / explicit user instruction.

## RC completion rule

An RC candidate may be produced when all TV-optional V1 work and deterministic release gates are GREEN, with external physical-Tizen rows explicitly still `PENDING`/`DEFERRED`.

Final `BabuşTV 1.0.0` may be called release-accepted only after the mandatory physical-Tizen debt is satisfied.
