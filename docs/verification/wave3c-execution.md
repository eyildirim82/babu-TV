# BabuşTV V1 Wave 3C Controller Execution Overlay

**Date:** 2026-09-11  
**Repository:** `eyildirim82/babu-TV`  
**Authority:** This overlay supersedes historical Wave 1 / Wave 3B lane statuses for the lanes listed here. Historical evidence remains valid for its exact production SHA only.

## 1. Current production baseline

Current `main`:

`860d9efa8efac7c9872bf31f7f592ae12a414889`

Push-triggered verify on that exact SHA:

`34568089899` — **SUCCESS**

This is the controller base for all new Wave 3C designs unless a later Controller merge advances `main` before a production lane is opened. Every implementation lane must freeze the then-current exact GREEN main SHA in its approved plan before production work starts.

## 2. Wave 3B merge closure

| Lane | PR | Squash result on `main` | Post-merge verify | Status |
|---|---:|---|---:|---|
| PAIR-C | #74 | `3c768a8d89750f4f189e0015c9a65ba2f6596db6` | `34567883477` SUCCESS | MERGED/FROZEN |
| PAIR-S | #72 | `afc428d72545ddf336cbfe81b76c484afd65df50` | `34567959149` SUCCESS | MERGED/FROZEN |
| PAIR-R | #73 | `8f25c99e6841ff23757684549530c8bc7e084e13` | `34568001634` SUCCESS | MERGED/FROZEN |
| HOME-UI | #71 | `3a4d60dd5baa0c3fa5f7dd8a7b8bc48292bc3fd9` | `34568048330` SUCCESS | MERGED/FROZEN |
| M4-COMP | #70 | `860d9efa8efac7c9872bf31f7f592ae12a414889` | `34568089899` SUCCESS | MERGED/FROZEN |

No physical Samsung/Tizen runtime PASS is claimed by these repository verify runs.

## 3. Wave 3C design lanes

### 3.1 M5-COMP

**Target branch:** `integration/m5-app-composition`  
**Design:** `docs/superpowers/specs/2026-09-11-wave3c-m5-app-composition-design.md`  
**Status:** `DESIGN-WRITTEN / REVIEW-REQUIRED`

The Home + M4 dependency gate is closed GREEN, but design review found two M5 Provider Management roadmap gaps in the current merged contracts:

- provider edit/re-entry is not implemented by current PROV-UI/onboarding contracts;
- durable Favorites/watch provider cleanup exists in repositories but is not integrated into current Provider Core deletion.

Therefore:

- M5 app composition design may be reviewed now;
- implementation planning must preserve these gaps explicitly;
- M5-COMP must not absorb unapproved provider-edit or destructive-cleanup semantics merely to claim the milestone complete;
- final M5 Provider Management / V1 RC acceptance remains blocked until the two gaps are closed by bounded Controller-approved work.

M5 also requires a minimal application-entry seam into M4 Live TV for Home `all`, `favorites`, focus-channel, and explicit play intents. The M5 design allows this as an additive controller contract with no change to existing playback semantics.

### 3.2 PAIR-WEB

**Target branch:** `feature/pairing-phone-ui`  
**Design:** `docs/superpowers/specs/2026-09-11-wave3c-pair-web-phone-ui-design.md`  
**Status:** `DESIGN-WRITTEN / REVIEW-REQUIRED`

PAIR-C/S/R are merged/frozen. The design freezes:

- public phone bootstrap data;
- exact versioned Xtream/M3U plaintext DTO;
- UTF-8 JSON -> PAIR-C -> serialized PAIR-C envelope -> PAIR-R ciphertext-only flow;
- browser UI state/error/privacy rules;
- no hosted relay/site claim in this lane.

After written-spec approval, PAIR-WEB may receive a bounded implementation plan from the then-current exact GREEN main.

### 3.3 PAIR-I

**Target branch:** `integration/pairing-onboarding`  
**Status:** `BLOCKED`

Opening gates:

1. PAIR-WEB written design approved;
2. PAIR-WEB implementation merged/frozen;
3. pairing core remains frozen;
4. TV QR/bootstrap contract is bounded to the approved PAIR-WEB bootstrap contract;
5. existing Xtream/M3U onboarding transactions remain final.

PAIR-I must not start before these gates close.

## 4. Newly surfaced provider prerequisites

These are Controller blockers discovered by comparing the M5 roadmap to exact `main`. They are not open implementation lanes yet.

### 4.1 Provider re-entry/edit

**Suggested role:** `PROV-REENTRY`  
**Suggested branch:** `feature/provider-reentry`  
**Status:** `DESIGN-REQUIRED`

Required product behavior: safely edit/re-enter an existing provider configuration without implementing it as delete+add and without breaking provider-scoped user state.

The bounded design must decide the Provider Core transaction first; UI follows that contract. M5-COMP must not invent this transaction in application navigation code.

### 4.2 Provider user-state deletion integration

**Suggested role:** `PROV-DEL-I`  
**Suggested branch:** `integration/provider-user-state-cleanup`  
**Status:** `DESIGN-REQUIRED`

Current exact-main facts:

- `StructuredFavoriteRepository.deleteProvider(providerId)` exists;
- `StructuredWatchStateRepository.deleteProvider(providerId)` exists;
- `ProviderCoreService.deleteProvider(providerId)` currently removes credential, catalog, EPG and provider metadata but does not call those user-state repositories.

The bounded design must integrate provider-scoped cleanup without touching another provider and without falsely claiming atomicity the storage/credential abstractions cannot provide.

## 5. Concurrency decision

After the written specs are approved:

- PAIR-WEB can run independently from M5/provider-gap work;
- PROV-REENTRY and PROV-DEL-I require their own designs before production branches open;
- M5-COMP implementation may proceed only under the approved M5 plan and must remain explicit about unresolved provider-management acceptance if either prerequisite is still open;
- PAIR-I stays blocked on PAIR-WEB.

Preferred dependency shape:

```text
main@860d9efa... GREEN
  ├─ PAIR-WEB design -> plan -> implementation -> merge
  │      └─ then PAIR-I design/plan may open
  │
  ├─ PROV-REENTRY design -> bounded implementation
  ├─ PROV-DEL-I design -> bounded implementation
  │
  └─ M5-COMP design -> plan -> application composition
         └─ M5 Provider Management acceptance requires provider gaps closed
```

## 6. Worker evidence contract

Every new Wave 3C production head must provide fresh exact-head evidence for:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check <frozen-exact-base>...HEAD
```

The PR body must record:

- ROLE;
- branch;
- frozen exact base SHA;
- final production head SHA;
- exact changed-file set;
- RED evidence and expected failure;
- GREEN evidence;
- canonical exact-head gate evidence;
- invariant/scope review;
- physical runtime as `NOT VERIFIED` unless a real device/emulator/browser deployment test was actually executed.

Verification-only workflow files must not remain in production diffs.

## 7. Controller merge policy

For each accepted production PR:

1. refresh current main and PR head;
2. verify frozen evidence still targets the unchanged production head;
3. audit exact changed-file scope and semantic invariants;
4. mark Ready only from Controller authority;
5. merge with exact expected head SHA;
6. fetch the resulting main SHA;
7. require push-triggered standard verify on that exact SHA to complete SUCCESS;
8. only then open or merge dependent/conflicting work.

## 8. Immediate next gate

No Wave 3C production implementation begins from these documents until the written M5 and PAIR-WEB specs are reviewed/approved.

After approval, create separate implementation plans. Do not combine M5-COMP and PAIR-WEB into one plan because they are independent subsystems with different ownership/security boundaries.
