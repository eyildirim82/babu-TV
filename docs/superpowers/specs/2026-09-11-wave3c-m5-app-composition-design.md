# BabuşTV V1 Wave 3C M5 Application Composition Design

**Date:** 2026-09-11  
**Status:** Design direction approved; written spec requires Controller review before implementation planning  
**Repository:** `eyildirim82/babu-TV`  
**Controller production base:** `860d9efa8efac7c9872bf31f7f592ae12a414889`  
**Post-M4 main verification:** `34568089899` SUCCESS

## 1. Purpose

M5-COMP turns the already-merged Home, provider-management, first-run, modern M3U/Xtream onboarding, watch-state, and M4 Live TV components into one application-level navigation/runtime composition without moving provider, persistence, or playback semantics into the UI shell.

The target production branch is:

`integration/m5-app-composition`

M5-COMP owns application composition. It does not redesign Provider Core, Favorites, watch scoring, onboarding transactions, M3 playback/recovery, EPG, Search, or channel-action semantics.

## 2. Current exact-base facts

At `860d9efa8efac7c9872bf31f7f592ae12a414889`:

- `HomeView` is a real DOM view and emits only frozen `HomeActionIntent` values.
- `HomeActionIntent` already distinguishes provider selection, Live TV scope entry, channel focus entry, explicit channel playback, and Settings.
- `FirstRunView`, `XtreamEntryView`, and `M3uEntryView` are real DOM views with injected callbacks.
- `ProviderManagementPresenter` is a presentation state machine, not a DOM view.
- `createBrowserProviderRuntime()` exposes provider/catalog/watch/credential/EPG/core seams, but does not currently expose the durable Favorites repository required by Home and M4 feature ports.
- `createBrowserLiveTvRuntime()` accepts optional M4 `featurePorts`, but current `main.js` does not supply them.
- `LiveTvController` has no explicit application-entry API for Home deep links (`all`, `favorites`, focus channel, explicit play channel).
- current `main.js` owns boot, legacy fallback, remote initialization, Settings, onboarding entry, and the M3 startup short-circuit; it returns immediately when M3 starts, so Home is not yet the application root.

These are composition seams, not reasons to duplicate the underlying feature implementations.

## 3. Architectural decision

Use a focused application orchestrator and keep `main.js` as bootstrap glue.

The primary new module is:

`player/src/app/app-composition.ts`

It owns:

- top-level application route/state;
- one remote-input dispatch boundary;
- Home data refresh and intent routing;
- first-run/onboarding navigation;
- provider-management presentation mounting;
- Live TV application entry/return-to-Home behavior;
- application-level Back ownership.

It consumes existing services through injected ports. It must be testable without browser storage, real provider network access, real playback, or a Samsung device.

## 4. Application routes

The application route union is intentionally small:

```ts
type AppRoute =
  | { kind: 'first-run' }
  | { kind: 'home' }
  | { kind: 'live-tv' }
  | { kind: 'provider-management' }
  | { kind: 'xtream-entry'; returnTo: 'first-run' | 'provider-management' }
  | { kind: 'm3u-entry'; returnTo: 'first-run' | 'provider-management' };
```

There is no general-purpose router framework. The orchestrator owns one active application route and hides/unmounts the previous route before showing the next.

Boot routing:

1. load configured providers;
2. if there are no configured providers, show `first-run`;
3. otherwise show `home` even when there is temporarily no active provider, because HOME-D already projects a safe provider-selector state;
4. boot/network/EPG refresh failure must not route directly into playback or destroy usable cached state.

## 5. Home data composition

Create a focused loader, preferably:

`player/src/app/home-data-source.ts`

It reads existing repositories/services and calls `createHomeViewModel()`; it does not reimplement Home ordering or ranking.

Required inputs:

- `providers.listProviders()`;
- `providers.getActiveProviderId()`;
- active-provider `catalog.listChannels()`;
- active-provider durable Favorites;
- active-provider last watched and watch aggregates;
- `Date.now()` through an injected clock;
- one application-level `WatchScorePolicy`.

For V1 composition, freeze the existing WATCH-S example policy as the initial product policy:

```ts
{
  durationWeightPerMinute: 1,
  openWeight: 5,
  recencyHalfLifeMs: 7 * 24 * 60 * 60 * 1000,
}
```

The policy remains a composition constant and can be product-tuned later without changing WATCH-S interfaces.

Home current-program values are optional in HOME-D. M5-COMP must not introduce an N-per-channel EPG query loop merely to decorate Home. If no existing bounded/bulk query seam can populate current programs efficiently, M5 passes no `currentPrograms`; EPG remains available inside M4 Live TV. Performance tuning belongs to the later PERF lane.

## 6. Browser provider runtime exposure

M5 may make one additive runtime-composition change in:

`player/src/providers/create-browser-provider-runtime.ts`

Construct `StructuredFavoriteRepository` from the existing `IndexedDbStructuredStore` and expose it as `favorites` alongside `providers`, `catalog`, `watchState`, and `epgRepository`.

This is repository exposure only. M5 must not change Favorites persistence semantics, IndexedDB schema/version, or Provider Core transaction behavior in this step.

The same durable Favorites repository can back:

- Home Favorites projection;
- `FavoriteService` used by M4 `LiveTvFeaturePorts`.

M5 constructs the existing `RepositoryEpgQuery` over the existing EPG repository and the existing `FavoriteService`; these become the real M4 `featurePorts` supplied to `createBrowserLiveTvRuntime()`.

## 7. Home intent routing

The orchestrator maps frozen Home intents exactly:

| Home intent | M5 behavior |
|---|---|
| `SELECT_PROVIDER` | call existing `ProviderCoreService.switchActiveProvider(providerId)`, then refresh Home; never start playback |
| `OPEN_LIVE_TV` / `all` | enter Live TV on the selected provider in `all` scope; no playback |
| `OPEN_LIVE_TV` / `favorites` | enter Live TV in the virtual Favorites scope; no playback |
| `OPEN_LIVE_TV_CHANNEL` | enter Live TV, focus that provider-scoped channel in normal `all` scope; no playback |
| `PLAY_CHANNEL` | enter Live TV and explicitly request playback of that provider-scoped channel |
| `OPEN_SETTINGS` | open application provider-management surface |

If an intent provider is not the active provider, M5 first uses the existing Provider Core switch operation and only then creates/enters the Live TV runtime. Provider switching alone is never playback.

## 8. Minimal Live TV application-entry seam

M5 needs a real programmatic seam; simulating remote keystrokes is forbidden.

A minimal additive change to `LiveTvController` is allowed for three public application-entry operations:

```ts
openScope(scope: { kind: 'all' } | { kind: 'favorites' }): void;
openChannel(channelId: ChannelId): void;
playChannel(channelId: ChannelId): Promise<void>;
```

Requirements:

- `openScope` updates scope/presentation only and emits zero playback requests;
- `openChannel` validates the channel belongs to the active provider, sets normal `all` scope, opens/focuses the channel surface, and emits zero playback requests;
- `playChannel` is the only new application-entry method allowed to call the existing private playback-request path;
- existing remote Select/zap/numeric/action behavior remains unchanged;
- Favorites scope may be selected before async Favorites refresh completes; the existing `SYNC_FAVORITES` refresh path fills/reconciles the projection without implicit playback;
- Search activation may share/refactor the same channel-focus helper but must preserve its current no-play semantics.

This is an application-entry contract only, not a playback architecture change.

## 9. Live TV Back ownership

Inside Live TV, feature-layer -> option-layer -> overlay Back behavior remains owned by M4.

When M4 reaches its existing root-exit path, M5 must return to Home rather than exit the TV application. Do this without teaching `LiveTvController` about Home: supply a scoped `Platform` adapter to the Live TV runtime whose `exitApp()` callback routes to Home while all capability/key-registration behavior delegates to the real platform.

At the Home root, Back delegates to the real platform exit operation.

This preserves one-layer-at-a-time behavior and keeps the platform exit decision at the application boundary.

## 10. Remote-input ownership

M5 initializes the remote exactly once.

The app orchestrator dispatches arrows/Select/Back according to the active route:

- Home -> `HomeView.handleAction()`;
- first run -> `FirstRunView.handleAction()`;
- Xtream -> `XtreamEntryView.handleAction()`;
- M3U -> `M3uEntryView.handleAction()`;
- provider management -> application-shell provider-management adapter;
- Live TV -> existing `LiveTvController.handleInput()` plus numeric/channel/options actions.

The Samsung `tizenhwkey` Back listener also exists once at the application boundary.

No route may independently install a second global remote/back listener.

## 11. Provider-management surface

Because merged PROV-UI exposes `ProviderManagementPresenter` state rather than a DOM view, M5 may create a small materialization adapter, preferably:

`player/src/app/provider-management-surface.ts`

It may:

- render `ProviderManagementState` using safe DOM APIs/textContent;
- use presenter-provided focus IDs/order;
- map remote next/previous/select/back into presenter methods/application navigation;
- refresh/render after presenter async operations;
- route `requestAddProvider()` to the existing first-run provider-kind chooser or directly to the Xtream/M3U choice surface.

It may not duplicate provider switch/delete/confirmation rules already owned by the presenter.

## 12. Provider-management gaps discovered during design review

The RC roadmap requires two behaviors that the current merged seams do not fully provide:

1. **Edit/re-enter provider configuration.** `ProviderManagementPresenter` currently exposes switch, add, and confirmed delete only. Existing Xtream/M3U onboarding services create new provider IDs; they are not safe edit-in-place transactions.
2. **Provider-scoped user-state cleanup on provider deletion.** `StructuredFavoriteRepository` and `StructuredWatchStateRepository` each expose `deleteProvider()`, but current `ProviderCoreService.deleteProvider()` does not invoke them.

M5-COMP must not silently invent either semantic inside presentation code.

Controller consequence:

- M5 application composition may be implemented and reviewed over the currently frozen contracts;
- it must **not** claim final M5 Provider Management / V1 RC acceptance until bounded provider-reentry and provider-user-state-deletion integration are separately specified and merged;
- those follow-up lanes must preserve existing provider isolation and user-owned state safety.

This written gap supersedes any assumption that merging PROV-UI alone completed every M5C roadmap item.

## 13. Onboarding and first-run flow

First run stays presentation-only and short.

- `FirstRunView.onXtreamSelected` opens the existing Xtream entry view.
- `FirstRunView.onM3uSelected` opens the existing M3U entry view.
- successful existing onboarding transactions return to Home and refresh provider/Home state;
- failure remains inside the onboarding view and preserves its existing input/error semantics;
- adding a provider from provider management uses the same chooser/onboarding views; there is no second add-provider transaction.

The existing Xtream and M3U services remain the only transaction owners.

## 14. Styling and DOM attachment

M5 attaches already-merged scoped styles from the application bootstrap, including:

- `ui/home.css`;
- `ui/first-run.css`;
- `ui/m3u-entry.css`;
- existing Xtream entry CSS;
- one new scoped provider-management surface stylesheet only if needed.

Prefer module CSS imports from `main.js`/the application entry rather than adding static duplicate stylesheet tags to `index.html`. `index.html` changes are allowed only if a mount/accessibility requirement cannot be satisfied through the existing body-based views.

## 15. Legacy fallback

Do not delete the legacy player/settings path in M5 unless exact tests prove it is unreachable and intentionally retired.

`createBrowserLiveTvRuntime()` may still return `legacy`. In that case the application must preserve the current usable legacy path rather than leaving a dead Home/Live TV route.

Legacy fallback must not become a reason to bypass Provider Core when a valid M3 provider runtime is available.

## 16. Error handling

- Home load failure -> Home error presentation; no implicit provider switch/playback.
- provider switch failure -> remain on Home/provider management with sanitized presentation error.
- M4 feature-port failure -> existing M4 graceful degradation; Live TV remains usable.
- Live TV runtime failure/legacy result -> controlled legacy fallback.
- onboarding failure -> existing sanitized Xtream/M3U view behavior.
- no raw provider credential, playlist URL, stream URL, relay secret, repository exception, or native playback error is newly rendered/logged by M5.

## 17. Preferred production scope

Primary files:

```text
player/src/app/app-composition.ts                         new
player/src/app/home-data-source.ts                        new
player/src/app/provider-management-surface.ts             new
player/src/providers/create-browser-provider-runtime.ts    minimal additive repository exposure
player/src/live-tv/live-tv-controller.ts                  minimal application-entry methods
player/src/main.js                                        bootstrap/navigation composition
player/src/ui/provider-management.css                     new only if required
player/test-ts/m5-app-composition.test.ts                 new
player/test-ts/m5-provider-management-surface.test.ts     new if surface split warrants it
```

`player/index.html` is not expected to change. If implementation proves it is required, the PR must explain the exact mount/accessibility reason.

Forbidden scope expansion:

- Provider Core transaction redesign;
- provider edit/re-entry semantics;
- IndexedDB schema/version changes;
- watch scoring implementation changes;
- Favorites semantics changes;
- EPG parser/provider semantics;
- Shaka/AVPlay/session/recovery semantics;
- pairing implementation;
- unrelated legacy UI refactors.

## 18. Acceptance invariants

M5-COMP acceptance must prove at minimum:

- configured providers -> Home; zero providers -> First Run;
- Home default-focus behavior remains HOME-D/HOME-UI owned;
- focus/highlight/navigation alone emits zero playback;
- Home provider selection switches provider but emits zero playback;
- Home `OPEN_LIVE_TV` all/favorites enters the requested scope with zero playback;
- Home `OPEN_LIVE_TV_CHANNEL` focuses the stable provider-scoped channel with zero playback;
- Home `PLAY_CHANNEL` produces one explicit play request for the requested provider/channel;
- M4 Favorites/EPG/Search/Actions feature ports are actually injected in production composition;
- Back closes the current child layer and Live TV root Back returns Home before application exit;
- onboarding success returns Home through the existing Xtream/M3U transactions;
- provider-management add uses the same onboarding views;
- provider list/switch/delete presentation remains presenter-driven;
- cross-provider focus/channel identity remains provider-scoped;
- legacy fallback remains usable;
- physical Samsung/Tizen runtime remains `NOT VERIFIED` unless a real device/emulator run is performed.

## 19. Verification contract

Final M5 production head must provide fresh exact-head evidence for:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

The PR must list the exact changed-file set and distinguish repository build/staging evidence from physical runtime evidence.

## 20. Non-goals

M5-COMP does not:

- implement secure pairing;
- solve provider edit/re-entry without a separately approved transaction contract;
- claim atomic provider deletion across credential storage and IndexedDB on failure paths;
- redesign Home/Provider Core/M4 domain semantics;
- add a routing framework;
- perform final hardening/performance/release verification.
