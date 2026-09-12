# BabuşTV V1 Wave 3C Controller Execution Overlay

**Date:** 2026-09-11  
**Repository:** `eyildirim82/babu-TV`  
**Authority:** This overlay supersedes historical Wave 1 / Wave 3B statuses and pre-approval status headers inside the Wave 3C design specs for the lanes listed here.

## 1. Current production baseline

Current exact `main`:

`860d9efa8efac7c9872bf31f7f592ae12a414889`

Push-triggered verification on that exact SHA:

`34568089899` — **SUCCESS**

No physical Samsung/Tizen runtime PASS is inferred from repository CI.

## 2. Wave 3B merge closure

| Lane | PR | Squash result on `main` | Post-merge verify | Status |
|---|---:|---|---:|---|
| PAIR-C | #74 | `3c768a8d89750f4f189e0015c9a65ba2f6596db6` | `34567883477` SUCCESS | MERGED/FROZEN |
| PAIR-S | #72 | `afc428d72545ddf336cbfe81b76c484afd65df50` | `34567959149` SUCCESS | MERGED/FROZEN |
| PAIR-R | #73 | `8f25c99e6841ff23757684549530c8bc7e084e13` | `34568001634` SUCCESS | MERGED/FROZEN |
| HOME-UI | #71 | `3a4d60dd5baa0c3fa5f7dd8a7b8bc48292bc3fd9` | `34568048330` SUCCESS | MERGED/FROZEN |
| M4-COMP | #70 | `860d9efa8efac7c9872bf31f7f592ae12a414889` | `34568089899` SUCCESS | MERGED/FROZEN |

## 3. Human/Controller approval record

On 2026-09-11 the user explicitly approved both original Wave 3C architectural designs and their implementation plans:

- `docs/superpowers/specs/2026-09-11-wave3c-m5-app-composition-design.md`
- `docs/superpowers/plans/2026-09-11-wave3c-m5-app-composition-final.md`
- `docs/superpowers/specs/2026-09-11-wave3c-pair-web-phone-ui-design.md`
- `docs/superpowers/plans/2026-09-11-wave3c-pair-web-phone-ui-final.md`

During M5 implementation audit, a cross-provider physical playback/session ownership ambiguity was discovered. Production implementation stopped before silently changing playback semantics. The user chose and approved decision **A**:

> Provider selection/navigation does not stop or replace current playback. Cross-provider ownership handoff happens only on explicit playback for the newly browsed provider.

The approved written amendment and implementation plan are:

- `docs/superpowers/specs/2026-09-11-wave3c-m5-cross-provider-playback-handoff-design.md`
- `docs/superpowers/plans/2026-09-11-wave3c-m5-cross-provider-playback-handoff.md`

The amendment also explicitly authorizes three files omitted from the original M5 owned-file list:

- `player/src/app/browser-app-dependencies.ts`
- `player/src/live-tv/create-live-tv-runtime.ts`
- `player/test/m3-live-tv-wiring.test.js`

The amended final M5 scope is exactly fifteen files. Frozen production base remains `860d9efa8efac7c9872bf31f7f592ae12a414889`.

The user also explicitly approved the `PROV-REENTRY` architecture `write-free candidate preflight -> credential commit point -> non-destructive derived-cache refresh`, including its compensation, concurrency, provider-identity, user-state, activation, privacy, and presenter invariants. The approved written artifacts are:

- `docs/superpowers/specs/2026-09-11-wave3c-provider-reentry-design.md`
- `docs/superpowers/plans/2026-09-11-wave3c-provider-reentry.md`

`PROV-REENTRY` production scope is exactly four files and its production branch starts from the same frozen base `860d9efa8efac7c9872bf31f7f592ae12a414889`. Planning documents stay on the docs branch and are read-only inputs to the production worker.

## 4. Open implementation lanes

### 4.1 M5-COMP

**Branch:** `integration/m5-app-composition`  
**Draft PR:** #78  
**Original spec:** `docs/superpowers/specs/2026-09-11-wave3c-m5-app-composition-design.md`  
**Original plan:** `docs/superpowers/plans/2026-09-11-wave3c-m5-app-composition-final.md`  
**Approved amendment spec:** `docs/superpowers/specs/2026-09-11-wave3c-m5-cross-provider-playback-handoff-design.md`  
**Approved amendment plan:** `docs/superpowers/plans/2026-09-11-wave3c-m5-cross-provider-playback-handoff.md`  
**Frozen base:** `860d9efa8efac7c9872bf31f7f592ae12a414889`  
**Current known implementation head before amendment execution:** `886941cb6c833119da604708a4a19d5b9742b70d`  
**Last standard verify on that head:** `34599256214` — SUCCESS  
**Status:** `AMENDMENT DESIGN-APPROVED / PLAN-WRITTEN / IMPLEMENTATION-RESUME-READY`

The approved ownership model is one reusable browser Live TV runtime/session/coordinator for the application lifetime. Provider context re-entry changes only catalog/presentation state. Provider selection and browsing emit zero stop/play. Explicit cross-provider play reuses the existing shared `ChannelIntentCoordinator -> WatchObservingPlayerSession -> PlayerSessionCoordinator` handoff path.

Final M5 canonical evidence has not yet been claimed after the amendment. PR #78 remains Draft.

Final M5 Provider Management / V1 RC acceptance remains independently blocked on:

- provider re-entry/edit transaction support (`PROV-REENTRY`);
- provider-scoped Favorites/watch cleanup integration during provider deletion (`PROV-DEL-I`).

### 4.2 PAIR-WEB

**Branch:** `feature/pairing-phone-ui`  
**Draft PR:** #79  
**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-pair-web-phone-ui-design.md`  
**Plan:** `docs/superpowers/plans/2026-09-11-wave3c-pair-web-phone-ui-final.md`  
**Frozen base:** `860d9efa8efac7c9872bf31f7f592ae12a414889`  
**Exact production head verified:** `159edf58a8b0c8a3e87baacd544b9b09623e5142`  
**Canonical run:** `34599276236` — SUCCESS  
**Final branch-head standard verify:** `34599406885` — SUCCESS  
**Status:** `WORKER-COMPLETE / CONTROLLER-AUDIT-READY / DRAFT`

Final PR diff is exactly the approved six PAIR-WEB files. Verification-only workflow has no net production diff. Phone deployment and physical Samsung pairing runtime remain `NOT VERIFIED`.

PAIR-I stays blocked until PAIR-WEB is actually merged/frozen by Controller.

### 4.3 PROV-REENTRY

**Branch:** `feature/provider-reentry`  
**Draft PR:** #81  
**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-provider-reentry-design.md`  
**Plan:** `docs/superpowers/plans/2026-09-11-wave3c-provider-reentry.md`  
**Frozen base:** `860d9efa8efac7c9872bf31f7f592ae12a414889`  
**Exact production head verified:** `e096c62eb959aad59ef033f8e748682fc1eaba53`  
**Canonical run:** `34608984593` — SUCCESS  
**Current branch head after verification-workflow cleanup:** `6c8ab7eef1142a87248cd33c808f5d900a8487f8`  
**Final branch-head standard verify:** `34609091028` — SUCCESS  
**Status:** `WORKER-COMPLETE / CONTROLLER-AUDIT-READY / DRAFT`

Implemented transaction shape:

```text
write-free candidate preflight
  -> credential commit point
  -> non-destructive derived-cache refresh
```

Final net PR diff is exactly the approved four files:

- `player/src/providers/provider-reentry-service.ts`
- `player/src/provider-management/provider-management-presenter.ts`
- `player/test-ts/provider-reentry-service.test.ts`
- `player/test-ts/provider-management-presenter.test.ts`

TDD evidence includes service RED `34608074579`, service GREEN `34608277530`, presenter RED `34608395561`, presenter GREEN `34608500027`, and an additional raw edit-error sanitization RED `34608606813` before final production-head standard GREEN `34608788670`.

Canonical `34608984593` pinned checkout to exact production head `e096c62eb959aad59ef033f8e748682fc1eaba53`, asserted the exact four-file scope, and passed `npm test`, `npm run typecheck`, `npm run brand:check`, `npm run build`, `npm run tizen:build`, `git diff --exit-code`, and frozen-base `git diff --check`. The temporary canonical workflow was then removed; it has no net PR diff.

Delete+add is not used. Provider ID/kind, activation, Favorites/watch state, post-commit credential semantics, usable-cache failure semantics, same-provider duplicate-submit bounding, and secret-free result/presentation behavior are covered by the implementation/tests. M5 routing/surface integration is explicitly outside this lane. Physical Samsung/Tizen runtime remains `NOT VERIFIED`.

PR #81 remains Draft. Controller audit is required before Ready/merge.

## 5. Blocked/deferred lanes

### 5.1 PAIR-I

**Branch:** `integration/pairing-onboarding`  
**Status:** `BLOCKED`

Opening gates:

1. PAIR-WEB implementation merged/frozen;
2. pairing core remains frozen;
3. TV QR/bootstrap is bounded to the approved PAIR-WEB bootstrap contract;
4. existing Xtream/M3U onboarding transactions remain final.

### 5.2 PROV-DEL-I

**Suggested branch:** `integration/provider-user-state-cleanup`  
**Status:** `DESIGN-REQUIRED`

Exact-main facts:

- `StructuredFavoriteRepository.deleteProvider(providerId)` exists;
- `StructuredWatchStateRepository.deleteProvider(providerId)` exists;
- current `ProviderCoreService.deleteProvider(providerId)` does not invoke either repository.

This lane must integrate scoped cleanup without touching another provider and without claiming stronger cross-store atomicity than the abstractions provide.

## 6. Concurrency decision

PAIR-WEB and PROV-REENTRY worker implementations are complete and waiting for Controller audit. M5-COMP may resume only under the approved handoff amendment; no additional playback/session lane is authorized unless the bounded reusable-runtime design proves infeasible. `PROV-DEL-I` remains design-blocked.

```text
main@860d9efa... GREEN
  ├─ M5-COMP #78 Draft
  │    └─ approved handoff amendment -> RED -> minimal fix -> GREEN -> canonical exact-head audit
  │         └─ full M5 acceptance still waits on PROV-REENTRY merge/freeze + PROV-DEL-I
  ├─ PAIR-WEB #79 Draft
  │    └─ worker-complete -> Controller audit -> merge/freeze required before PAIR-I opens
  └─ PROV-REENTRY #81 Draft
       └─ worker-complete -> Controller audit -> merge/freeze

PROV-DEL-I: design required before production branch opens
```

The docs branch itself contains no production implementation.

## 7. Worker evidence contract

Every production worker must use fresh exact-head evidence:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

M5 canonical evidence must additionally assert its exact amended fifteen-file scope. PAIR-WEB canonical evidence asserted its exact six-file scope. PROV-REENTRY canonical evidence asserted its exact four-file production/test scope.

Draft PR bodies record ROLE, branch, frozen base, final production head, exact changed files, RED evidence, focused GREEN evidence, canonical exact-head evidence, invariant/scope review, and physical runtime as `NOT VERIFIED` unless actually executed.

Verification-only workflow files must not remain in production diffs.

## 8. Controller merge policy

For each accepted production PR:

1. refresh current `main` and PR head;
2. verify the PR still matches its frozen base/head evidence;
3. audit exact changed-file scope and semantic/security invariants;
4. mark Ready only under Controller authority;
5. merge using the exact expected head SHA;
6. fetch resulting `main` SHA;
7. require push-triggered standard verification on that exact SHA to complete SUCCESS;
8. only then open/merge dependent work.

## 9. Immediate next action

Controller-audit **PROV-REENTRY #81** against exact production head `e096c62eb959aad59ef033f8e748682fc1eaba53`, canonical run `34608984593`, and exact four-file scope. Keep it Draft until Controller acceptance; do not Ready/merge from the worker lane.

M5-COMP #78 may independently continue under its approved playback-handoff amendment. PAIR-WEB #79 may independently proceed to Controller audit.
