# BabuşTV V1 Wave 3B Home, M4 and Pairing Execution Design

**Date:** 2026-09-10  
**Controller base:** `b55a01642cd03a555712dd64026f3e22f1a81323`  
**Repository:** `eyildirim82/babu-TV`

## 1. Purpose

This design opens the next maximally parallel V1 execution slice after Wave 3 production UI/domain PRs #58-#65 were merged and the final `main` verification for `b55a01642cd03a555712dd64026f3e22f1a81323` completed successfully.

The slice has two immediate product lanes and three independent pairing-core lanes:

- `HOME-UI` — Home rendering/presentation over the merged HOME-D contract;
- `M4-COMP` — shared Live TV composition for EPG, Favorites, Search and Actions;
- `PAIR-C` — pairing crypto primitives;
- `PAIR-S` — pairing session/TTL/single-use primitives;
- `PAIR-R` — ciphertext-only relay contract/client.

`M5-COMP`, `PAIR-WEB` and `PAIR-I` remain dependency-gated and are not part of this implementation slice.

## 2. Architectural decision

`HOME-UI` and `M4-COMP` start in parallel from the same exact GREEN base because they own disjoint areas. HOME-UI consumes HOME-D and must not touch application composition. M4-COMP owns the shared Live TV hot zone and integrates the already-merged EPG/Favorites/Search/Actions presentation lanes.

In parallel, the three pairing-core workers restart from the same exact base using their existing frozen contracts/plans. They remain mutually independent: PAIR-C owns crypto only, PAIR-S owns session state only, and PAIR-R owns relay transport contracts only.

This structure keeps high-conflict runtime wiring concentrated in composition branches instead of distributing `main.js`, `index.html`, Live TV controller/view/runtime, or provider/storage ownership across UI workers.

## 3. Immediate lane ownership

### 3.1 HOME-UI

**Branch:** `feature/home-ui`  
**Exact implementation base:** `b55a01642cd03a555712dd64026f3e22f1a81323`

**Consumes:**

- `player/src/home/home-domain.ts` and its `HomeViewModel` / `HomeActionIntent` contract;
- existing BabuşTV design tokens/primitives;
- existing remote-first focus conventions.

**Owns:**

- a focused Home DOM/presentation view module;
- Home-specific stylesheet;
- focused Home UI tests.

Preferred production files:

- `player/src/home/home-view.ts`
- `player/src/ui/home.css`
- `player/test-ts/home-view.test.ts`

The worker may split a focused helper into another new `player/src/home/*` file only if the bounded plan proves a clear single-responsibility need. Existing shared application/runtime files are not available to HOME-UI.

**Required behavior:**

- render provider selector, Last Watched, Live TV entry, Favorites row, Frequently Watched row, and Settings from `HomeViewModel`;
- TV-distance layout suitable for 1920x1080 use;
- remote-first deterministic focus movement;
- stable-ID focus restoration where a focused provider/channel still exists;
- HOME-D `defaultFocus` honored on first display or when prior focus cannot be restored;
- empty/loading/error presentation states that do not invent new domain semantics;
- reduced-motion behavior;
- only explicit Select on a focusable action emits the corresponding injected `HomeActionIntent` callback;
- focus/highlight movement alone never emits playback, provider-switch, navigation, or persistence actions.

**Forbidden:**

- `player/src/main.js`;
- `player/index.html`;
- `player/src/live-tv/live-tv-controller.ts`;
- `player/src/live-tv/dom-live-tv-view.ts`;
- `player/src/live-tv/create-live-tv-runtime.ts`;
- `player/src/providers/create-browser-provider-runtime.ts`;
- storage/repository implementations;
- provider activation/switch execution;
- playback/session/recovery behavior;
- application-wide navigation composition.

HOME-UI does not wire its stylesheet into `index.html`; M5-COMP owns final application composition and stylesheet/runtime attachment.

### 3.2 M4-COMP

**Branch:** `integration/m4-live-tv-composition`  
**Exact implementation base:** `b55a01642cd03a555712dd64026f3e22f1a81323`

**Consumes merged lanes:**

- EPG provider/query/persistence integration;
- EPG-UI;
- FAV-D + USER-P + FAV-UI;
- SRCH-C + SRCH-UI;
- ACT-UI;
- existing M3 Live TV state/controller/playback-intent contracts.

**Owns only the minimum shared Live TV composition changes required to make those lanes cooperate.** The bounded plan may grant exact ownership of these hot-zone files as needed:

- `player/src/live-tv/live-tv-controller.ts`
- `player/src/live-tv/dom-live-tv-view.ts`
- `player/src/live-tv/create-live-tv-runtime.ts`
- `player/src/live-tv/contracts.ts` only when an integration contract change is unavoidable and remains Live-TV-specific;
- new focused `player/src/live-tv/*-integration.ts` helpers;
- focused M4 composition tests.

`player/src/main.js` and application-level Home/provider/first-run wiring remain forbidden to M4-COMP.

**Acceptance invariants:**

- channel highlight remains distinct from playback;
- Favorites toggle never starts playback;
- Search result highlight never starts playback;
- Program Information never starts playback;
- `İzle` or another explicitly defined play action is the only action-surface route that may emit a play intent;
- existing channel Select semantics remain explicit and compatible with M3 behavior;
- focus restoration remains stable-ID based after search/favorites/category/list transitions;
- Back closes one UI layer at a time before delegating outward;
- missing/stale EPG degrades presentation only;
- EPG refresh/query failure cannot make Live TV unusable;
- provider/channel identity remains provider-scoped;
- M4 must not alter Shaka/AVPlay/recovery ownership to simplify UI integration.

### 3.3 PAIR-C

**Branch:** `feature/pairing-crypto`  
**Exact implementation base:** `b55a01642cd03a555712dd64026f3e22f1a81323`

Follow the existing PAIR-C frozen plan semantics, retargeted only to this exact base.

**Owns only:**

- `player/src/pairing/crypto.ts`
- `player/test-ts/pairing-crypto.test.ts`

Crypto key material is ephemeral/in-memory. No provider credentials, relay behavior, persistence, UI, or application composition is added.

### 3.4 PAIR-S

**Branch:** `feature/pairing-session`  
**Exact implementation base:** `b55a01642cd03a555712dd64026f3e22f1a81323`

Follow the existing PAIR-S frozen plan semantics, retargeted only to this exact base.

**Owns only:**

- `player/src/pairing/session.ts`
- `player/test-ts/pairing-session.test.ts`

The approved default TTL remains exactly `5 * 60 * 1000` ms unless a later approved design supersedes it. Session payload values remain opaque; no crypto, relay, provider, storage, UI, or application wiring is added.

### 3.5 PAIR-R

**Branch:** `feature/pairing-relay-contract`  
**Exact implementation base:** `b55a01642cd03a555712dd64026f3e22f1a81323`

Follow the existing PAIR-R frozen plan semantics, retargeted only to this exact base.

**Owns only:**

- `player/src/pairing/relay-contracts.ts`
- `player/src/pairing/relay-client.ts`
- `player/test-ts/pairing-relay-client.test.ts`

Relay traffic remains ciphertext-only, HTTPS-only, and sanitized on failure. No real relay endpoint, credentials, session implementation, crypto implementation, UI, storage, or application wiring is added.

## 4. Deferred lanes and opening gates

### 4.1 M5-COMP

`integration/m5-app-composition` stays blocked until:

1. HOME-UI is merged and post-merge `main` is GREEN;
2. M4-COMP is merged and post-merge `main` is GREEN;
3. existing merged M3U/watch/provider/first-run lanes remain compatible with the resulting main.

M5-COMP will then own application-level navigation/runtime wiring, including `player/src/main.js`, Home/provider/first-run routing and stylesheet attachment as needed. It must not change provider or playback semantics merely to simplify composition.

### 4.2 PAIR-WEB

PAIR-WEB stays blocked until PAIR-C, PAIR-S and PAIR-R contracts are merged/frozen and a bounded phone-pairing UI contract/plan is approved. PAIR-WEB must not create an alternative session, crypto, relay, credential, or onboarding architecture.

### 4.3 PAIR-I

`integration/pairing-onboarding` stays blocked until:

- PAIR-C, PAIR-S and PAIR-R are merged/frozen;
- PAIR-WEB contract/UI is available;
- Xtream and M3U onboarding transaction contracts remain final;
- CredentialStore boundary is unchanged or explicitly re-approved.

PAIR-I will translate TV session -> QR -> relay ciphertext -> TV decrypt -> existing onboarding transaction handoff. It must not create a second provider persistence or credential-storage architecture.

## 5. Concurrency and conflict rules

The five immediate lanes may run concurrently because their planned production ownership is disjoint.

The following files remain hot-zone integration-owned and cannot be claimed opportunistically by HOME-UI or pairing workers:

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

M4-COMP is the sole immediate lane allowed to receive bounded ownership of the listed Live TV hot-zone files. It does not own `main.js`, `index.html`, provider runtime, or storage.

If a worker discovers a required change outside its approved production/test set, it must report an integration requirement instead of expanding scope.

## 6. TDD and verification contract

Every worker follows RED -> minimum implementation -> GREEN and opens a Draft PR only.

Before Controller review, each final production head must provide fresh exact-head evidence for:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check <exact-base>...HEAD
```

The PR body must record:

- ROLE;
- branch;
- exact base SHA;
- final production head SHA;
- exact changed-file set;
- RED evidence and expected failure;
- GREEN evidence;
- exact-head gate evidence;
- invariant/scope review;
- physical Tizen runtime as `NOT VERIFIED` unless real device/emulator runtime evidence exists.

Verification-only workflow files must not remain in production PR diffs.

## 7. Controller merge policy

No worker marks itself Ready or merges itself.

Controller merge procedure for each accepted production PR:

1. refresh current `main` and PR head;
2. verify frozen production head has not changed after evidence;
3. confirm mergeability against the current `main`;
4. mark the PR Ready;
5. squash-merge using the exact expected head;
6. fetch the new `main` SHA;
7. require the push-triggered standard `verify` workflow on that exact SHA to complete SUCCESS;
8. only then consider the next dependent or potentially conflicting merge.

Independent PRs may finish in any order. M4-COMP and HOME-UI do not require each other and may be merged in either order if both remain clean against the then-current main. Pairing-core PRs are likewise independent, but each is rechecked after preceding merges.

## 8. Next opening sequence

After this design is approved and bounded implementation plans are written:

```text
b55a01642cd03a555712dd64026f3e22f1a81323 (GREEN main)
  ├─ feature/home-ui
  ├─ integration/m4-live-tv-composition
  ├─ feature/pairing-crypto
  ├─ feature/pairing-session
  └─ feature/pairing-relay-contract
```

Then:

```text
HOME-UI + M4-COMP merged/GREEN -> M5-COMP may open
PAIR-C + PAIR-S + PAIR-R merged/frozen -> bounded PAIR-WEB design/plan may open
PAIR-WEB + pairing core + onboarding contracts -> PAIR-I may open
```

## 9. Non-goals

This execution slice does not:

- perform final application/Home/provider wiring;
- redesign M3 playback/recovery;
- redesign Provider Core or persistence;
- add physical-device PASS evidence without a device/emulator run;
- introduce real provider/relay credentials or URLs;
- implement PAIR-WEB or PAIR-I;
- perform Wave 5 hardening or Wave 6 release verification.
