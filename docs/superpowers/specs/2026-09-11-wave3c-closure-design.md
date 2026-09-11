# BabuşTV Wave 3C Closure Design

Date: 2026-09-11  
Status: APPROVED DESIGN — awaiting written-spec review before implementation planning  
Repository: `eyildirim82/babu-TV`  
Frozen closure base: `92af4f5b9d445ced236a63f581716a55bf87ebeb`

## 1. Purpose

Wave 3C has completed and merged the M5 application composition and PAIR-WEB phone surface, but three acceptance edges remain before the wave can close:

- existing-provider credential re-entry must be integrated into the merged M5 provider-management flow;
- provider deletion must clean provider-scoped watch/favorites state through the real browser runtime;
- pairing core must be integrated end-to-end without creating a second provider persistence or credential-storage architecture.

This design applies the approved throughput policy: a wave is a synchronization/integration boundary, not a serial queue. Independent work runs in parallel until it reaches a real semantic or hot-zone dependency.

Canonical process policy:

- `docs/verification/wave-throughput-policy.md`
- `docs/verification/parallel-development-control.md`
- `docs/verification/v1-parallel-execution.md`

## 2. Current frozen state

Closure work starts from exact GREEN `main`:

`92af4f5b9d445ced236a63f581716a55bf87ebeb`

At this base:

- M5-COMP is merged/frozen;
- PAIR-WEB is merged/frozen;
- PAIR-C, PAIR-S, and PAIR-R are merged/frozen;
- PROV-REENTRY PR #81 contains validated core/presenter behavior but is intentionally not directly mergeable as the final product integration;
- provider deletion still lacks provider-scoped Favorites/watch cleanup in the production browser runtime;
- pairing integration is not yet wired into the TV/application composition;
- physical Samsung/Tizen runtime remains NOT VERIFIED unless separately proven.

The old `v1-parallel-execution.md` role statuses that still describe M5/PAIR-I as blocked are historical and must be updated as part of the closure planning/docs work. They are not authoritative over this frozen state.

## 3. Chosen execution model

Use three parallel starting lanes plus one short dependent wiring lane:

```text
main@92af4f5... GREEN
        |
        +--> PROV-REENTRY-I -----------+
        |
        +--> PROV-DEL-I ---------------+--> controller merge/retarget gates
        |
        +--> PAIR-I-CORE --------------+
                                          |
                                          +--> PAIR-I-WIRE
                                                |
                                                +--> exact-main GREEN
                                                      |
                                                      +--> WAVE 3C CLOSED
```

The key rule is that PAIR-I-CORE does not own application hot-zone wiring. This lets it progress in parallel with PROV-REENTRY-I without both editing `app-composition.ts` / `browser-app-dependencies.ts`.

## 4. Lane A — PROV-REENTRY-I

### Goal

Integrate the already-validated provider re-entry transaction into the merged M5 provider-management/application flow.

### Inputs

Consume the validated semantics from PR #81, especially:

```text
existing provider guard
-> immutable kind guard
-> credential-store availability guard
-> exact previous credential snapshot
-> write-free candidate network preflight
-> credential commit
-> non-destructive refresh
```

PR #81 remains historical/frozen evidence and is not merged directly to `main` as the final integration vehicle.

### Required product behavior

- provider ID is preserved exactly;
- provider kind cannot change during re-entry;
- Xtream <-> M3U conversion is rejected before network/write;
- stored credentials, server URLs, playlist URLs, usernames, or passwords are never prefilled into the UI;
- Favorites/watch state is untouched;
- activation state is unchanged by the transaction itself;
- provider-management highlight/focus causes no operation;
- explicit Edit opens the existing provider-kind entry surface in edit mode;
- edit submission invokes `ProviderReentryService` for that existing provider ID;
- successful edit returns to provider management and refreshes presentation;
- failure stays sanitized and does not leak candidate or previous credentials;
- no playback/navigation side effect beyond the explicit route transition to/from the edit surface.

### Expected ownership

The bounded implementation plan should minimize scope, but may need ownership in:

- `player/src/providers/provider-reentry-service.ts`
- `player/src/provider-management/provider-management-presenter.ts`
- `player/src/app/app-composition.ts`
- `player/src/app/browser-app-dependencies.ts`
- provider-management surface/tests
- existing Xtream/M3U entry surface contracts/tests only where required to distinguish add vs edit submission.

It must not modify playback/session engines, watch semantics, Favorites semantics, storage schema, PAIR-* modules, or provider-delete cleanup.

### Merge rule

This lane may merge once its exact-head canonical gates and controller audit pass. If another lane merges first and touches a consumed hot-zone or contract, retarget to the latest GREEN `main` and re-run exact-head evidence before merge.

## 5. Lane B — PROV-DEL-I

### Goal

Make provider deletion clean provider-scoped watch/Favorites state through the real browser runtime without creating a broken intermediate `main` state.

### Required deletion ordering

```text
provider existence guard
-> required user-state cleanup dependency available
-> credentials.remove(providerId)
-> catalog.removeProviderCatalog(providerId)
-> EPG cleanup best-effort
-> watch.deleteProvider(providerId)
-> favorites.deleteProvider(providerId)
-> providers.removeProvider(providerId)   # logical commit
```

### Semantics

- watch cleanup runs before Favorites cleanup;
- user-state cleanup is strict: failure prevents provider metadata removal;
- EPG cleanup remains best-effort and keeps its existing failure-isolation semantics;
- deletion is explicitly partial/non-atomic: credentials/catalog may already be removed when later cleanup fails;
- no rollback claim is made for partial deletion;
- retries must remain safe/idempotent under existing provider-scoped delete behavior;
- cleanup errors are sanitized;
- one provider's deletion must never touch another provider's state.

### Runtime wiring

`createBrowserProviderRuntime()` already creates the structured watch and Favorites repositories. This lane must construct the cleanup service there and inject it into `ProviderCoreService` in the same integration PR.

There must be no merge state in which `ProviderCoreService.deleteProvider()` requires cleanup but the production browser runtime cannot supply it.

### Expected ownership

- `player/src/providers/provider-core-service.ts`
- `player/src/providers/provider-user-state-cleanup.ts` (new)
- `player/src/providers/create-browser-provider-runtime.ts`
- focused provider-core / cleanup / runtime tests.

It must not enter app navigation, provider-management UI semantics, pairing, playback, or storage schema implementation.

## 6. Lane C — PAIR-I-CORE

### Goal

Implement the TV-side pairing orchestration as a focused testable module while avoiding application hot-zone ownership.

### Dependencies

Consume merged/frozen:

- PAIR-C crypto;
- PAIR-S session lifecycle;
- PAIR-R relay contract/client;
- PAIR-WEB payload/bootstrap contract;
- final Xtream/M3U onboarding transaction contracts;
- existing `CredentialStore` / provider persistence architecture.

### Owned flow

```text
TV creates single-use session
-> TV exposes public bootstrap / QR payload data
-> phone encrypts and uploads ciphertext through relay
-> TV polls relay
-> TV decrypts ciphertext
-> strict payload decode
-> provider-kind dispatch
-> existing Xtream or M3U onboarding transaction handoff
-> single-use completion
```

### Required invariants

- no plaintext provider credential enters relay contracts;
- no private TV key is exported or persisted;
- bootstrap contains only approved public/session data;
- decrypted payload uses the existing strict Xtream/M3U union;
- unknown/extra/malformed payloads fail sanitized;
- expired, missing, replayed, consumed, network, crypto, and onboarding failures remain distinguishable only where the approved public contract requires it; raw errors/secrets are never surfaced;
- session consumption is single-use;
- pairing does not invent provider registration, credential storage, or activation semantics;
- onboarding is delegated to the existing services;
- no implicit playback.

### Forbidden hot zones in this lane

- `player/src/app/app-composition.ts`
- `player/src/app/browser-app-dependencies.ts`
- `player/src/main.js`
- provider-management composition
- Live TV runtime/controller

PAIR-I-CORE should prefer new focused pairing orchestrator/presentation-contract modules plus focused tests.

## 7. Lane D — PAIR-I-WIRE

### Start gate

PAIR-I-WIRE begins only after:

- PAIR-I-CORE is controller-ready/frozen;
- any earlier merge that changes application/provider composition has landed;
- resulting exact `main` push verification is GREEN.

### Goal

Wire the tested pairing core into the latest application composition with the smallest possible hot-zone diff.

### Responsibilities

- add the TV pairing route/surface entry point required by the approved V1 UX;
- instantiate/inject PAIR-I-CORE dependencies in browser composition;
- connect successful decrypted Xtream/M3U payloads to the existing onboarding services;
- preserve current Home / First Run / Provider Management / Live TV behavior;
- preserve `highlight != playback` and provider selection/navigation semantics;
- Back closes pairing cleanly without mutating unrelated application state;
- pairing failure must not leave a partially registered provider unless the existing onboarding transaction contract explicitly permits that state.

### Hot-zone ownership

This is the lane allowed to touch the relevant application composition files, including when required:

- `player/src/app/app-composition.ts`
- `player/src/app/browser-app-dependencies.ts`
- `player/src/main.js`
- new pairing TV view/surface files and tests.

It must not modify PAIR-C/PAIR-S/PAIR-R algorithms or Provider Core transaction semantics merely to simplify wiring.

## 8. Parallelism and merge order

PROV-REENTRY-I, PROV-DEL-I, and PAIR-I-CORE may start from the same frozen closure base because their intended ownership is non-overlapping.

Merge order between PROV-REENTRY-I and PROV-DEL-I is readiness-driven, not pre-fixed:

1. first controller-ready lane merges;
2. exact resulting `main` push verify must be SUCCESS;
3. any remaining integration lane consuming changed files/contracts retargets to that exact GREEN `main`;
4. new exact-head canonical evidence is required before its merge.

PAIR-I-CORE can be completed/frozen independently because it does not own app hot zones.

PAIR-I-WIRE always targets the latest GREEN `main` after the relevant provider/application integrations.

No lane may silently rebase onto another active worker branch. Cross-lane consumption happens only from frozen artifacts or controller-recorded GREEN `main` states.

## 9. Canonical verification gates

Every production lane requires exact-head evidence for:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check <exact-frozen-base>...HEAD
```

Each lane also requires:

- exact production SHA checkout/assertion in canonical evidence;
- exact changed-file scope assertion;
- no temporary verification workflow in final production diff;
- controller audit of security/provider/playback invariants;
- Draft PR until controller authorizes Ready/merge.

After every merge that changes a dependency edge, the push-triggered standard verify on the resulting exact `main` SHA must be SUCCESS before dependent work advances.

## 10. Wave 3C completion criteria

Wave 3C closes only when all of the following are true:

- provider re-entry is reachable from the real M5 provider-management flow and preserves provider identity/user state;
- provider deletion cleans provider-scoped watch and Favorites state through the real browser runtime;
- pairing performs TV session -> relay ciphertext -> TV decrypt -> existing onboarding handoff with single-use completion;
- no lane creates a second credential/provider persistence path;
- no known broken intermediate production composition remains on `main`;
- all required final integration PRs have controller approval;
- resulting exact `main` push verification is SUCCESS;
- `v1-parallel-execution.md` and the controller board are updated to show Wave 3C CLOSED and the next hardening lanes unblocked.

Physical Samsung/Tizen pairing and runtime acceptance remains separately `NOT VERIFIED` unless actual device/emulator evidence is collected. Repository completion must not be misrepresented as physical runtime acceptance.

## 11. Next wave boundary

After Wave 3C closes on a GREEN exact `main`, the next wave fans out the hardening packages described by the V1 execution design (PERF / FAIL / MIG / NAV / PLAY / SEC) using the throughput policy:

- prefer 3–5 independent active production lanes;
- centralize controller/merge authority;
- freeze exact bases and contracts;
- wait only at real semantic/hot-zone dependencies;
- keep runtime-device acceptance explicit and separate.
