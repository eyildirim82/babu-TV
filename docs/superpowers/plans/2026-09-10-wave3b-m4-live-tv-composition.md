# BabuşTV V1 Wave 3B M4-COMP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the merged EPG, Favorites, Search, and Channel Actions feature contracts into the existing M3 Live TV controller/view while preserving highlight ≠ playback, stable focus, cache/failure isolation, and one-layer Back semantics.

**Architecture:** M4-COMP adds a Live-TV-local feature composition seam. The controller consumes injected feature ports and the existing pure UI/domain modules; the DOM view renders the resulting feature presentation state. Provider repositories/runtime remain outside this lane: browser/application wiring supplies the ports later in M5-COMP, avoiding new storage/provider ownership in M4.

**Tech Stack:** TypeScript 5.9, existing M3 controller/state/DOM view, EPG-UI, FAV-UI, SRCH-C/SRCH-UI, ACT-UI, Node `node:test`/`tsx`; no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-10-wave3b-home-m4-pairing-execution-design.md`

## Global Constraints

- ROLE: `M4-COMP`.
- Branch: `integration/m4-live-tv-composition`.
- Exact implementation base: `b55a01642cd03a555712dd64026f3e22f1a81323`.
- Approved hot-zone ownership: `player/src/live-tv/live-tv-controller.ts`, `player/src/live-tv/dom-live-tv-view.ts`, `player/src/live-tv/create-live-tv-runtime.ts`, and `player/src/live-tv/contracts.ts` only if an unavoidable Live-TV-specific contract addition is required.
- New focused helper allowed: `player/src/live-tv/live-tv-feature-composition.ts`.
- Focused tests: `player/test-ts/m4-live-tv-composition.test.ts` plus only narrowly necessary existing Live TV test updates caused by intentional contract extension.
- Forbidden: `player/src/main.js`, `player/index.html`, `player/src/providers/create-browser-provider-runtime.ts`, storage/repository implementations, Provider Core semantics, credential handling, Shaka/AVPlay/recovery behavior.
- Feature ports are injected; M4 must not instantiate a second store/repository stack merely to obtain Favorites or EPG data.
- Favorites toggle, Program Info, Search highlight/result focus, EPG display, and highlight movement never start playback.
- Explicit channel Select and explicit `PLAY_CHANNEL` action remain the only play-intent routes.
- Back closes exactly one active Live TV UI layer per invocation before delegating to existing outer behavior.

---

### Task 1: Freeze injected M4 feature ports and local layer state

**Files:**
- Create: `player/src/live-tv/live-tv-feature-composition.ts`
- Create: `player/test-ts/m4-live-tv-composition.test.ts`

**Interfaces:**
- Consumes: `EpgQuery`, Favorites domain/service-compatible read/toggle seam, `searchCatalog`, SRCH-UI projection/input contracts, ACT-UI channel-action contracts, provider/channel IDs.
- Produces: `LiveTvFeaturePorts`, `LiveTvFeatureState`, `LiveTvFeatureComposition`.

- [ ] **Step 1: Write RED contract test**

Start with an import-failure RED test and freeze a narrow port surface similar to:

```ts
export interface LiveTvFavoritePort {
  isFavorite(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  toggle(providerId: ProviderId, channelId: ChannelId, nowMs: number): Promise<boolean>;
}

export interface LiveTvFeaturePorts {
  epg: Pick<EpgQuery, 'getCurrent' | 'getNext'>;
  favorites: LiveTvFavoritePort;
  nowMs(): number;
}

export type LiveTvFeatureLayer = 'none' | 'search' | 'actions' | 'program-info';
```

Do not expose repositories, credentials, provider URLs, storage objects, or playback engines through these ports.

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP"
npm run typecheck -w player
```

Expected: FAIL because `live-tv-feature-composition.ts` does not exist.

- [ ] **Step 3: Implement local feature state**

State must retain only presentation/focus data: active feature layer, Search query/focus/restore key, Channel Actions state/context, optional EPG presentation, favorite flag for the highlighted channel, and Program Info presentation. It must not own provider catalog, playback status, or session state already owned by M3.

- [ ] **Step 4: Add explicit failure-degradation test**

Injected EPG/favorite read failures must produce unavailable/non-destructive presentation state and must not throw through the controller path. A failed favorite toggle must preserve the previous displayed favorite state and return a sanitized feature result rather than alter playback state.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP"
npm run typecheck -w player
git add player/src/live-tv/live-tv-feature-composition.ts player/test-ts/m4-live-tv-composition.test.ts
git commit -m "feat(live-tv): add injected M4 feature composition"
```

---

### Task 2: Compose EPG and Favorites without changing M3 playback ownership

**Files:**
- Modify: `player/src/live-tv/live-tv-feature-composition.ts`
- Modify: `player/src/live-tv/live-tv-controller.ts`
- Modify: `player/test-ts/m4-live-tv-composition.test.ts`

**Interfaces:**
- Consumes: `buildEpgLiveTvViewModel`, `presentEpgLiveTv`, `favoriteActionPresentation`, existing Favorites contracts.
- Produces: async presentation refresh tied to current provider + visible/highlighted stable channel IDs.

- [ ] **Step 1: Write RED EPG/favorite integration tests**

Prove:

1. entering/syncing a provider can request presentation refresh for only that provider's stable channel IDs;
2. EPG current/next failures resolve to missing/unavailable presentation and do not change `LiveTvState.playbackStatus`, `playingChannelId`, or pending intent;
3. highlighting another channel refreshes selected-channel EPG/favorite presentation but emits no `ChannelIntentPort.requestChannel` call;
4. favorite toggle updates only favorite presentation/domain port; it emits zero play requests.

- [ ] **Step 2: Add feature dependency to controller**

Extend `LiveTvControllerDependencies` with an optional injected feature composition/port object so existing tests/callers remain source-compatible. The controller may schedule a presentation refresh after render-relevant state changes, but stale async completion must be rejected using a monotonically increasing local presentation generation or equivalent provider/highlight key check.

- [ ] **Step 3: Preserve provider-scoped identity**

Every feature request must carry `state.providerId` plus the stable `ChannelId`; never use channel ID alone as a cross-provider cache key.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP|Live TV"
npm run typecheck -w player
git add player/src/live-tv/live-tv-controller.ts player/src/live-tv/live-tv-feature-composition.ts player/test-ts/m4-live-tv-composition.test.ts
git commit -m "feat(live-tv): compose EPG and Favorites presentation"
```

---

### Task 3: Compose Search and Channel Actions with one-layer Back ownership

**Files:**
- Modify: `player/src/live-tv/live-tv-feature-composition.ts`
- Modify: `player/src/live-tv/live-tv-controller.ts`
- Modify: `player/test-ts/m4-live-tv-composition.test.ts`

**Interfaces:**
- Consumes: `searchCatalog`, `projectSearchView`, `handleSearchKeyboard`, `buildChannelActions`, `createChannelActionsState`, `reduceChannelActions`, `activateChannelAction`.
- Produces: Search/actions layer behavior translated to existing Live TV scope/highlight or explicit play/favorite/info actions.

- [ ] **Step 1: Write RED Search acceptance**

Use synthetic catalog rows to prove Search query projection is delegated to SRCH-C/SRCH-UI. Result focus/highlight changes must emit zero playback requests. Activating a Search result closes Search (or returns to overlay), sets/restores stable highlighted channel identity through the existing Live TV reducer path, and still does not play until the existing explicit channel-select/play action occurs.

- [ ] **Step 2: Write RED Channel Actions acceptance**

Prove the action surface uses ACT-UI exactly:

```text
WATCH        -> PLAY_CHANNEL -> existing requestPlayback path
FAVORITE     -> TOGGLE_FAVORITE -> favorite port only
PROGRAM_INFO -> SHOW_PROGRAM_INFO -> program-info layer only
```

`OPTIONS` may open the action layer for the highlighted/playing channel, but Tools/Menu is not required for core navigation. A missing EPG program omits `PROGRAM_INFO` using `buildChannelActions` rather than inventing a disabled action.

- [ ] **Step 3: Implement strict layer priority and Back**

Use this close priority:

```text
program-info -> actions -> search -> existing options/overlay -> outer existing Back behavior
```

One `BACK` handles one layer only. Do not call `platform.exitApp()` while any M4 or existing Live TV layer is open.

- [ ] **Step 4: Keep explicit playback route centralized**

Translate only ACT-UI `PLAY_CHANNEL` into the controller's existing `requestPlayback(channelId)` path. Never invoke resolver/session directly from the feature composition helper.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP|Live TV"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/live-tv/live-tv-controller.ts player/src/live-tv/live-tv-feature-composition.ts player/test-ts/m4-live-tv-composition.test.ts
git commit -m "feat(live-tv): compose Search and channel actions"
```

---

### Task 4: Render M4 presentation in the existing DOM view

**Files:**
- Modify: `player/src/live-tv/dom-live-tv-view.ts`
- Modify: `player/src/live-tv/live-tv-controller.ts`
- Modify: `player/src/live-tv/contracts.ts` only if the final typed render model cannot remain in `live-tv-controller.ts`
- Modify: `player/test-ts/m4-live-tv-composition.test.ts`

- [ ] **Step 1: Write RED DOM presentation tests**

With the repository's existing DOM fake, prove:

- channel rows can show current EPG title/time when available and remain usable when absent/unavailable;
- selected-channel detail renders current/next presentation without changing focus;
- Favorites virtual scope/empty state is visible when selected;
- Search input/results are focusable by the feature state's stable result key;
- Channel Actions expose exactly the ACT-UI labels;
- Program Info is a separate dismissible layer;
- `data-presentation-state` continues to distinguish highlighted/focused/playing rather than conflating them.

- [ ] **Step 2: Extend the render model, not the playback state**

Add M4 feature presentation to `LiveTvViewModel` (or a Live-TV-local equivalent) instead of adding EPG/favorite/search UI fields to core `LiveTvState`. Keep M3 playback state pure.

- [ ] **Step 3: Render through safe DOM APIs**

Use `createElement`, `textContent`, classes, and datasets. Do not write provider/channel/program/search text through `innerHTML`. Do not render credentials, source URLs, stream URLs, or raw error text.

- [ ] **Step 4: Preserve stable focus after rerender**

The DOM view may restore focus to a stable `data-channel-id` / search result key / action ID only when the feature/controller state says that layer owns focus. Rendering EPG text must never steal focus.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP|Live TV"
npm run typecheck -w player
git add player/src/live-tv/dom-live-tv-view.ts player/src/live-tv/live-tv-controller.ts player/src/live-tv/contracts.ts player/test-ts/m4-live-tv-composition.test.ts
git commit -m "feat(live-tv): render M4 feature layers"
```

If `contracts.ts` was not required, do not stage or modify it.

---

### Task 5: Expose optional feature-port injection through Live TV runtime

**Files:**
- Modify: `player/src/live-tv/create-live-tv-runtime.ts`
- Modify: `player/test-ts/m4-live-tv-composition.test.ts`

**Interfaces:**
- Consumes: application-provided `LiveTvFeaturePorts`.
- Produces: M4-capable controller construction without provider-runtime/storage ownership.

- [ ] **Step 1: Write RED runtime-injection test**

Prove `createBrowserLiveTvRuntime` / its construction seam can receive an optional `featurePorts` dependency and pass it into the M4 composition/controller. Existing callers that omit it must retain current M3 startup/fallback behavior so `main.js` requires no change in this lane.

- [ ] **Step 2: Implement optional injection only**

Extend `BrowserLiveTvRuntimeDependencies` with an optional M4 feature-port field. When absent, construct the controller with M3-only behavior. Do not instantiate `StructuredFavoriteRepository`, modify `createBrowserProviderRuntime`, or create a second `IndexedDbStructuredStore` here.

M5-COMP will supply final browser repository/domain adapters and stylesheet/navigation wiring.

- [ ] **Step 3: Add regression assertions**

Prove cache-first startup, failed background refresh isolation, watch observation, resolver/session construction, and legacy fallback behavior remain unchanged when feature ports are absent or when a presentation refresh fails.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP|runtime|Live TV"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/live-tv/create-live-tv-runtime.ts player/test-ts/m4-live-tv-composition.test.ts
git commit -m "feat(live-tv): inject M4 feature ports"
```

---

### Task 6: Verify exact head and open Draft PR

- [ ] **Step 1: Run canonical gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
```

- [ ] **Step 2: Audit exact scope**

```bash
git diff --name-only b55a01642cd03a555712dd64026f3e22f1a81323...HEAD
git diff --check b55a01642cd03a555712dd64026f3e22f1a81323...HEAD
git diff b55a01642cd03a555712dd64026f3e22f1a81323...HEAD
```

Expected production changes are bounded to approved Live TV hot-zone files plus `live-tv-feature-composition.ts`. No `main.js`, `index.html`, provider runtime, storage/repository, credential, playback adapter/session/recovery, package metadata, or unrelated UI files.

- [ ] **Step 3: Record invariant evidence in Draft PR**

PR body must include exact base/head/files and explicit tests proving: highlight != playback; Search focus != playback; Favorite toggle != playback; Program Info != playback; only explicit play actions reach `requestPlayback`; stable-ID focus restoration; EPG failure isolation; one-layer Back; existing M3 startup/playback/recovery tests GREEN; canonical exact-head gates; physical Tizen runtime `NOT VERIFIED` unless separately executed.

Do not mark Ready or merge.
