# BabuşTV V1 Wave 3C M5 Cross-Provider Playback Handoff Design

**Date:** 2026-09-11  
**Status:** Design approved in chat; written amendment pending Controller review  
**Repository:** `eyildirim82/babu-TV`  
**Frozen production base:** `860d9efa8efac7c9872bf31f7f592ae12a414889`  
**Target production branch:** `integration/m5-app-composition`

## 1. Purpose

This document amends the approved M5 application-composition design after implementation audit exposed a playback/session ownership ambiguity during provider changes.

The approved product decision is:

> Changing the selected provider is navigation only. Existing playback continues unchanged. A cross-provider playback handoff occurs only when the user explicitly invokes playback for the newly browsed provider.

This preserves the existing M5 invariant that highlight, navigation, provider selection, and scope entry are not playback actions.

## 2. Problem discovered during implementation audit

`createBrowserLiveTvRuntime()` currently creates a playback stack containing one `PlayerSessionCoordinator`, `PlaybackWatchObserver`, `WatchObservingPlayerSession`, Shaka/AVPlay adapters, `ChannelIntentCoordinator`, and `LiveTvController`.

The first M5 implementation created another complete browser runtime when browsing provider B after provider A. That is unsafe because both logical runtimes wrap the same physical legacy player, while only A's watch observer/session knows that A currently owns playback.

Creating a second B session before B playback is requested does not itself stop A, but when B later starts playback its independent `PlayerSessionCoordinator` cannot deterministically finalize/stop A through A's existing watch/session owner. M5 must not repair this by duplicating WATCH-I logic or changing playback recovery semantics.

## 3. Architectural decision: one reusable browser Live TV runtime

M5 will maintain **one browser Live TV runtime for the application lifetime**, not one runtime per provider.

That single runtime owns exactly one:

- `ShakaAdapter`;
- `AvplayAdapter`;
- `PlayerSessionCoordinator`;
- `PlaybackWatchObserver`;
- `LegacyPlaybackTerminalBinder`;
- `WatchObservingPlayerSession`;
- `ChannelIntentCoordinator`;
- `LiveTvController`.

Changing providers changes only the provider snapshot currently presented by that controller. It does not construct a new physical playback/session owner.

This preserves application-wide last-intent-wins inside one `ChannelIntentCoordinator` and lets the existing `WatchObservingPlayerSession` remain the only watch-session owner.

## 4. Reusable provider-entry seam

`createBrowserLiveTvRuntime()` receives one additive M5 lifecycle capability on its M3 result:

```ts
interface ReusableLiveTvRuntime {
  mode: 'm3';
  controller: LiveTvController;
  refresh: Promise<void>;
  enterProvider(providerId: ProviderId): Promise<void>;
}
```

`enterProvider(providerId)` reuses the already-created resolver/session/controller stack and performs only provider-context loading:

1. verify the requested provider is still configured and credential-capable through existing repository/store seams;
2. call existing cache-first Provider Core loading for that exact provider;
3. call `controller.enter(cachedSnapshot)`;
4. start the existing bounded background refresh and `controller.syncCatalog(refreshedSnapshot)`;
5. never call `session.stop()`, never open an engine, and never emit a playback request.

The current initial startup path remains compatible: `createBrowserLiveTvRuntime()` may still enter the current active provider on first creation and return `legacy` under the same existing fallback conditions.

No general router/runtime framework is introduced.

## 5. Product behavior

### 5.1 Provider selection

When Provider A has a playing channel and the user selects Provider B from Home:

1. Provider Core switches application/provider context to B;
2. Home refreshes for B;
3. A playback continues unchanged;
4. A's watch session stays active;
5. no stop, watch finalization, or new play occurs.

Provider selection is navigation only.

### 5.2 Browsing Provider B

When the user enters B Live TV, M5 calls `enterProvider('B')` on the same reusable runtime.

The controller now renders/focuses B's snapshot, while the shared physical session may still be playing A underneath. Because `controller.enter()` is presentation/state entry only, this must perform:

- zero physical engine stops;
- zero new playback requests;
- zero A watch-session finalization.

The same applies to B `all`, B `favorites`, B channel focus, Search navigation, EPG/program-info display, Favorites toggle, and Actions-menu opening.

### 5.3 Explicit cross-provider playback

When the user explicitly plays a B channel, all playback still flows through the existing shared `ChannelIntentCoordinator`.

The existing order is retained:

1. resolve B's requested stream;
2. if resolution fails, report failure and leave A playback/watch ownership untouched;
3. after resolution succeeds, `ChannelIntentCoordinator` calls the single shared `WatchObservingPlayerSession.switchTo()`;
4. its existing `onHandoffStarted` observation finalizes A with reason `switch`;
5. the existing single `PlayerSessionCoordinator` stops its active A engine exactly once;
6. existing retry/fallback policy opens B;
7. successful B playback starts a B watch session through the existing WATCH-I path.

No M5-specific watch finalization, engine stop, retry, fallback, or rollback algorithm is added.

Because the same `ChannelIntentCoordinator` and session are reused across providers, overlapping playback intents retain the existing application-wide last-intent-wins behavior instead of creating independent per-provider intent domains.

## 6. Failure and rollback behavior

Required rules:

- Provider B selection/navigation failure must not stop A playback.
- B stream-resolution failure happens before the disruptive handoff and therefore leaves A playback/session active.
- Once the shared existing session begins handoff, retry/fallback/rollback behavior remains owned entirely by frozen playback semantics.
- M5 does not synthesize cross-provider rollback to A when B fails after handoff has begun; it does not have an approved cross-provider rollback contract.
- A failed B playback attempt must not attribute B watch time unless the existing WATCH-I contract records meaningful playback.
- No provider credential, stream URL, watch payload, or native playback error is newly logged/rendered.

## 7. Same-provider and cross-provider re-entry

- Home -> Live TV -> Home -> Live TV for the same provider reuses the same runtime/controller/session and must not create a second owner.
- A -> Home -> switch to B -> browse B reuses the same runtime/session and changes only controller provider context.
- Switching browsing context back to A without explicit playback does not stop whatever provider currently owns physical playback.
- Explicit playback after returning to A again uses the same shared coordinator/session and performs the normal existing handoff.

Provider-specific presentation state may be re-entered/reset when switching providers; it must never leak a channel identity from one provider into another provider's snapshot.

## 8. Back behavior

Back remains route/layer ownership only.

Leaving B Live TV for Home does not stop A or B playback merely because the Live TV route closes. M4 root Back still routes Home through the scoped Platform adapter. Application exit behavior remains as defined by the approved M5 design.

## 9. Scope amendment

Three files are explicitly added to the approved M5 scope:

```text
player/src/app/browser-app-dependencies.ts
player/src/live-tv/create-live-tv-runtime.ts
player/test/m3-live-tv-wiring.test.js
```

Rationale:

- `browser-app-dependencies.ts` keeps `main.js` as bootstrap glue while constructing the already-approved Home/onboarding/provider-management/M4 dependency graph and now owns reuse of the one browser Live TV runtime.
- `create-live-tv-runtime.ts` owns construction of the playback/session stack, so the additive `enterProvider(providerId)` lifecycle seam belongs there. This seam reuses existing semantics; it does not change `PlayerSessionCoordinator`, `ChannelIntentCoordinator`, adapters, or WATCH-I behavior.
- `m3-live-tv-wiring.test.js` is an existing characterization test whose old M3 startup short-circuit conflicts with the approved M5 application-root boot. Updating it is test-only scope required to keep intentional legacy/M3 fallback coverage.

No other scope expansion is authorized by this amendment.

## 10. Forbidden implementation changes

This amendment does not authorize changes to:

- `PlayerSessionCoordinator`;
- `ChannelIntentCoordinator` playback ordering/last-intent semantics;
- Shaka or AVPlay adapter playback semantics;
- WATCH-I observer/session semantics;
- watch scoring or persistence;
- Provider Core transaction behavior beyond already-approved switching/loading use;
- Favorites or EPG semantics;
- IndexedDB schema/version;
- pairing;
- provider re-entry/edit;
- provider-delete user-state cleanup.

If `enterProvider(providerId)` cannot be implemented by reusing existing Provider Core load/cache seams and `controller.enter()` without changing any forbidden item, M5 stops and reports a new design blocker.

## 11. Acceptance invariants

Fresh M5 regression evidence must prove:

1. same-provider Home -> Live TV -> Home -> Live TV constructs one browser runtime/session owner;
2. Provider A playback + Home provider switch to B emits zero stop and zero play;
3. B `enterProvider`, `all`, `favorites`, and channel focus emit zero stop/play;
4. B stream-resolution failure leaves A playback/watch session untouched;
5. explicit successful B play finalizes A exactly once through existing WATCH-I handoff and issues one B playback;
6. subsequent B playback reuses the same shared runtime/session;
7. browsing back to A without explicit play does not steal physical playback ownership;
8. explicit A playback after B uses the same shared coordinator/session handoff;
9. provider/channel presentation identity remains provider-scoped;
10. existing playback recovery, watch, M3/M4, Home, provider, and onboarding tests remain green.

## 12. Verification contract

Final exact M5 production head must provide fresh evidence for:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Canonical evidence must assert the amended exact changed-file set. Verification-only workflow files must not remain in production diff.

Physical Samsung/Tizen runtime remains `NOT VERIFIED` unless actually run on a device/emulator.

## 13. Controller consequence

M5-COMP remains Draft and blocked from Ready/merge until:

1. this written amendment is approved;
2. a corresponding implementation plan is written;
3. the cross-provider regression matrix is RED then GREEN;
4. final exact-head canonical evidence succeeds;
5. final scope matches the amended approved file set.

Independent M5 final-acceptance blockers remain unchanged:

- PROV-REENTRY;
- PROV-DEL-I.
