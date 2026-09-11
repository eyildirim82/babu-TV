# BabuşTV V1 Wave 3C M5 Cross-Provider Playback Handoff Design

**Date:** 2026-09-11  
**Status:** Design approved in chat; written amendment pending Controller review  
**Repository:** `eyildirim82/babu-TV`  
**Frozen production base:** `860d9efa8efac7c9872bf31f7f592ae12a414889`  
**Target production branch:** `integration/m5-app-composition`

## 1. Purpose

This document amends the approved M5 application-composition design after implementation audit exposed a playback/session ownership ambiguity during provider changes.

The approved product decision is:

> Changing the selected provider is navigation only. Existing playback continues unchanged. A cross-provider playback handoff occurs only when the user explicitly invokes `PLAY_CHANNEL` for the new provider.

This preserves the existing M5 invariant that highlight, navigation, provider selection, and scope entry are not playback actions.

## 2. Problem discovered during implementation audit

`createBrowserLiveTvRuntime()` currently creates a fresh playback stack each time it is constructed, including:

- `ShakaAdapter`;
- `AvplayAdapter`;
- `PlayerSessionCoordinator`;
- `PlaybackWatchObserver`;
- `LegacyPlaybackTerminalBinder`;
- `WatchObservingPlayerSession`;
- `LiveTvController`.

M5 already needed same-provider runtime reuse because leaving Live TV for Home and re-entering the same provider otherwise created a second session owner over the same physical legacy player.

A second ambiguity appears when the active provider changes from A to B while A may still be playing. Constructing a completely independent B runtime before any explicit playback request risks two logical session/observer owners around one physical player. M5 must not solve this by silently changing WATCH-I or playback recovery semantics.

## 3. Product behavior

### 3.1 Provider selection

When Provider A is selected and a channel from A is currently playing:

1. user returns to Home;
2. user selects Provider B;
3. Provider Core switches the active provider to B;
4. Home refreshes for B;
5. playback from A continues unchanged;
6. A's current watch session remains active;
7. no player stop, session stop, watch finalization, or new playback is caused by provider selection alone.

Provider selection changes browsing/application context only.

### 3.2 Provider B navigation

The following B actions remain non-disruptive while A playback continues:

- `OPEN_LIVE_TV` / `all`;
- `OPEN_LIVE_TV` / `favorites`;
- `OPEN_LIVE_TV_CHANNEL`;
- highlight/focus movement;
- Search highlight/navigation;
- EPG/program-info presentation;
- Favorites toggle;
- Actions-menu opening.

These actions must emit:

- zero physical playback stop requests;
- zero new playback requests;
- zero watch-session finalization caused solely by navigation.

### 3.3 Explicit cross-provider playback

When the user explicitly invokes:

```ts
{ type: 'PLAY_CHANNEL', providerId: 'B', channelId: 'target' }
```

while Provider A owns the current playback session, M5 performs one deterministic ownership handoff:

1. resolve/prepare the B navigation/runtime context without starting playback;
2. transfer the single application playback owner from A to B through one application-owned handoff seam;
3. the outgoing A session is finalized by the existing WATCH-I observation path at that handoff boundary;
4. the outgoing physical engine is stopped exactly once through the existing session coordinator semantics;
5. only after ownership transfer may B's explicit play request proceed;
6. B issues exactly one explicit channel play intent through the existing Live TV/controller path.

M5 does not invent a second watch-finalization algorithm. It must reuse the existing session stop/handoff observation behavior.

## 4. Ownership model

The application may cache navigation/runtime state per provider, but there is only one active physical playback owner at a time.

M5 therefore separates:

- **navigation runtime/context** — may exist for the currently browsed provider and may be reused when returning to the same provider;
- **physical playback ownership** — singular application-wide ownership of the existing Shaka/AVPlay-backed session stack.

A provider context must not become physical playback owner merely because it is opened, focused, or selected.

The ownership transition occurs only on explicit cross-provider `PLAY_CHANNEL`.

## 5. Minimal composition seam

The preferred implementation is a focused application-level Live TV runtime manager rather than changes to playback engines or WATCH-I internals.

The manager must expose behavior equivalent to:

```ts
interface AppLiveTvRuntimeManager {
  open(providerId: ProviderId): Promise<LiveTvController>;
  play(providerId: ProviderId, channelId: ChannelId): Promise<void>;
}
```

Semantics:

- `open(providerId)` returns/reuses the provider navigation controller and never changes physical playback ownership;
- `play(providerId, channelId)` is the only operation allowed to perform cross-provider ownership handoff before delegating to `controller.playChannel(channelId)`;
- repeated `open()` for the same provider reuses its existing navigation/runtime state;
- repeated `play()` within the current playback-owning provider uses the existing controller/session path and does not synthesize an extra stop/finalize step;
- a cross-provider `play()` performs at most one outgoing-owner stop/finalization boundary.

If the existing browser runtime cannot be cleanly separated into navigation and physical-session ownership without modifying frozen playback semantics, M5 must stop and report a blocker rather than alter `PlayerSessionCoordinator`, Shaka/AVPlay adapters, WATCH-I, or storage contracts.

## 6. Failure behavior

Cross-provider handoff must preserve last-intent-wins and existing recovery semantics.

Required failure rules:

- Provider B selection/navigation failure must not stop A playback.
- B channel resolution failure before the disruptive handoff point must leave A playback/session untouched.
- Once the existing playback handoff has begun, failure/rollback behavior remains owned by the frozen `PlayerSessionCoordinator` semantics; M5 must not add a second rollback policy.
- A failed B playback attempt must not attribute B watch time unless the existing WATCH-I contract says playback became meaningful.
- No provider credential, stream URL, watch event payload, or native playback error is newly logged/rendered by M5.

## 7. Back behavior

Back remains route/layer ownership only.

Returning from Provider B Live TV to Home must not stop Provider A playback merely because A is not the currently browsed provider. Application exit behavior remains unchanged from the approved M5 design.

## 8. Scope amendment discovered with this design

Two implementation files are explicitly added to M5's approved scope because they are required by the approved architecture and current repository characterization:

```text
player/src/app/browser-app-dependencies.ts
player/test/m3-live-tv-wiring.test.js
```

Rationale:

- `browser-app-dependencies.ts` keeps `main.js` as bootstrap glue while constructing the already-approved Home, onboarding, provider-management, EPG, Favorites, and Live TV dependency graph in one typed module.
- `m3-live-tv-wiring.test.js` is an existing characterization test whose historical M3 early-return expectation directly conflicts with the approved M5 rule that Home/application composition becomes the root. Updating this test is test-only scope required to preserve intentional legacy/M3 fallback coverage.

No other scope expansion is authorized by this amendment.

## 9. Forbidden implementation changes

This amendment does not authorize changes to:

- `PlayerSessionCoordinator` recovery/retry policy;
- Shaka or AVPlay adapter playback semantics;
- WATCH-I observer/session semantics;
- watch scoring or persistence;
- Provider Core transaction behavior beyond already-approved switching use;
- Favorites or EPG semantics;
- pairing;
- IndexedDB schema/version;
- provider re-entry/edit or provider-delete user-state cleanup.

If the required single-owner handoff cannot be expressed entirely through M5 composition and existing playback/session public seams, Controller must open a separately designed playback-integration lane.

## 10. Acceptance invariants

M5 must add fresh regression evidence proving all of the following:

1. same-provider Home -> Live TV -> Home -> Live TV reuses one runtime/session owner;
2. Provider A playback + Home provider switch to B performs zero stop and zero play;
3. opening B `all` scope performs zero stop and zero play;
4. opening B `favorites` scope performs zero stop and zero play;
5. focusing a B channel performs zero stop and zero play;
6. explicit B `PLAY_CHANNEL` causes one ownership handoff/finalization boundary and one B play request;
7. repeated B explicit plays use B's existing owner and do not create an additional cross-provider handoff;
8. switching browsing context back to A without explicit play does not steal physical ownership from B;
9. navigation/highlight remains independent from playback throughout;
10. existing playback recovery and watch tests remain unchanged and green.

## 11. Verification contract

After implementation reaches a stable exact production head, canonical evidence remains:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Canonical evidence must also assert the final exact M5 changed-file set. Verification-only workflow files must not remain in the production diff.

Physical Samsung/Tizen runtime remains `NOT VERIFIED` unless actually run on a device/emulator.

## 12. Controller consequence

M5-COMP remains Draft and blocked from Ready/merge until:

1. this written amendment is approved;
2. a corresponding bounded implementation plan is written;
3. the cross-provider regression matrix is RED then GREEN;
4. final M5 exact-head canonical evidence succeeds;
5. final scope matches the amended approved file set.

The independent M5 final-acceptance blockers remain unchanged:

- PROV-REENTRY;
- PROV-DEL-I.
