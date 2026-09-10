# BabuşTV V1 Wave 3B M4-COMP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the merged EPG, Favorites, Search, and Channel Actions contracts into the existing M3 Live TV controller/view while preserving highlight != playback, stable focus, failure isolation, and one-layer Back semantics.

**Architecture:** M4-COMP adds a Live-TV-local feature composition seam. The controller consumes injected feature ports and existing pure domain/UI modules; the DOM view renders only projected presentation state. Provider repositories/runtime remain outside this lane: M5-COMP later adapts concrete browser repositories/services to the M4 ports, so M4 never creates a second store or expands provider/storage ownership.

**Tech Stack:** TypeScript 5.9, existing M3 controller/state/DOM view, EPG-UI, FAV-D/FAV-UI, SRCH-C/SRCH-UI, ACT-UI, Node `node:test`/`tsx`; no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-10-wave3b-home-m4-pairing-execution-design.md`

## Global Constraints

- ROLE: `M4-COMP`.
- Branch: `integration/m4-live-tv-composition`.
- Exact implementation base: `b55a01642cd03a555712dd64026f3e22f1a81323`.
- Approved hot-zone ownership: `player/src/live-tv/live-tv-controller.ts`, `player/src/live-tv/dom-live-tv-view.ts`, `player/src/live-tv/create-live-tv-runtime.ts`, and `player/src/live-tv/contracts.ts` only if an unavoidable Live-TV-specific contract addition is required.
- New focused helper: `player/src/live-tv/live-tv-feature-composition.ts`.
- Primary focused test: `player/test-ts/m4-live-tv-composition.test.ts`; update an existing Live TV test only when an intentional public contract extension requires it.
- Forbidden: `player/src/main.js`, `player/index.html`, `player/src/providers/create-browser-provider-runtime.ts`, storage/repository implementations, Provider Core semantics, credential handling, Shaka/AVPlay/session/recovery behavior.
- M4 ports expose domain operations, not repositories/storage objects.
- Favorites toggle, Program Info, Search focus/highlight, EPG display, and ordinary channel highlight never start playback.
- Explicit existing channel Select and ACT-UI `PLAY_CHANNEL` are the only play-intent routes.
- Back closes one active Live TV UI layer per invocation before delegating to existing outer behavior.

---

### Task 1: Freeze injected feature ports and presentation-layer state

**Files:**
- Create: `player/src/live-tv/live-tv-feature-composition.ts`
- Create: `player/test-ts/m4-live-tv-composition.test.ts`

**Interfaces:**
- Consumes: `EpgQuery`, `FavoriteReconciliation`, SRCH-C/SRCH-UI contracts, ACT-UI contracts, provider/channel IDs.
- Produces: `LiveTvFavoritePort`, `LiveTvFeaturePorts`, `LiveTvFeatureLayer`, `LiveTvFeatureState`, `LiveTvFeatureComposition`.

- [ ] **Step 1: Write import-failure RED and freeze the narrow port**

Use this boundary:

```ts
export interface LiveTvFavoritePort {
  isFavorite(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  toggle(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  reconcile(
    providerId: ProviderId,
    availableChannelIds: ReadonlySet<ChannelId>,
  ): Promise<FavoriteReconciliation>;
}

export interface LiveTvFeaturePorts {
  epg: Pick<EpgQuery, 'getCurrent' | 'getNext'>;
  favorites: LiveTvFavoritePort;
  nowMs(): number;
}

export type LiveTvFeatureLayer = 'none' | 'search' | 'actions' | 'program-info';
```

This mirrors the existing FavoriteService behavior instead of reimplementing reconciliation. Do not expose repository/storage/credential/provider URL/playback objects.

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP"
npm run typecheck -w player
```

Expected: FAIL because `live-tv-feature-composition.ts` does not exist.

- [ ] **Step 3: Implement presentation-only local state**

State may contain only: active feature layer; Search query/focus/restore key and key->channel mapping; Channel Actions state/context; EPG presentation; favorite flag for the selected/highlighted channel; Favorites virtual-category projection; Program Info presentation. It must not duplicate the M3 provider catalog, playback status, pending intent, session state, or FavoriteRepository contents.

- [ ] **Step 4: Add failure-degradation RED/GREEN**

EPG read failure must project `unavailable`; favorite read/reconcile failure must keep Live TV usable and return an empty/non-destructive feature projection. Failed toggle preserves the prior displayed favorite state. No raw caught error string reaches presentation.

- [ ] **Step 5: Commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP"
npm run typecheck -w player
git add player/src/live-tv/live-tv-feature-composition.ts player/test-ts/m4-live-tv-composition.test.ts
git commit -m "feat(live-tv): add injected M4 feature composition"
```

---

### Task 2: Compose EPG and Favorites without changing playback ownership

**Files:**
- Modify: `player/src/live-tv/live-tv-feature-composition.ts`
- Modify: `player/src/live-tv/live-tv-controller.ts`
- Modify: `player/test-ts/m4-live-tv-composition.test.ts`

**Interfaces:**
- Consumes: `buildEpgLiveTvViewModel`, `presentEpgLiveTv`, `buildFavoritesViewModel`, `favoriteActionPresentation`, injected `LiveTvFavoritePort`.
- Produces: stale-safe feature presentation refresh for the active provider/visible/highlighted channels.

- [ ] **Step 1: Write RED integration tests**

Prove all of the following:

1. provider entry/catalog sync refreshes feature presentation only with `state.providerId` and current stable channel IDs;
2. EPG current/next failure never changes `LiveTvState.playbackStatus`, `playingChannelId`, or `pendingIntent`;
3. moving channel highlight refreshes selected EPG/favorite presentation but calls `ChannelIntentPort.requestChannel` zero times;
4. Favorites virtual projection comes from `favorites.reconcile(providerId, availableIds)` -> `buildFavoritesViewModel`, not local favorite filtering semantics;
5. favorite toggle calls only `favorites.toggle` and then refreshes presentation; it never requests playback.

- [ ] **Step 2: Extend controller dependencies compatibly**

Add an optional injected M4 composition/ports dependency so existing M3 tests/callers remain source-compatible. Presentation refreshes may be async; reject stale completion using a monotonically increasing generation plus provider/highlight identity check before applying the result.

- [ ] **Step 3: Keep provider-scoped identity explicit**

Never cache or request feature data by channel ID alone. Any retained presentation generation/key includes ProviderId + ChannelId where channel identity is involved.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP|Live TV"
npm run typecheck -w player
git add player/src/live-tv/live-tv-controller.ts player/src/live-tv/live-tv-feature-composition.ts player/test-ts/m4-live-tv-composition.test.ts
git commit -m "feat(live-tv): compose EPG and Favorites presentation"
```

---

### Task 3: Compose Search and Channel Actions with strict Back ownership

**Files:**
- Modify: `player/src/live-tv/live-tv-feature-composition.ts`
- Modify: `player/src/live-tv/live-tv-controller.ts`
- Modify: `player/test-ts/m4-live-tv-composition.test.ts`

**Interfaces:**
- Consumes: `searchCatalog`, `projectSearchView`, `handleSearchKeyboard`, `buildChannelActions`, `createChannelActionsState`, `reduceChannelActions`, `activateChannelAction`.
- Produces: Search/actions presentation transitions translated to existing Live TV highlight/play request paths.

- [ ] **Step 1: Write Search RED**

Use synthetic provider-scoped channels. Search ranking must come from `searchCatalog`; presentation from `projectSearchView`; keyboard focus from `handleSearchKeyboard`. Maintain an internal result-key -> `{ providerId, channelId }` lookup from the returned search results. Moving Search focus emits no playback. `ACTIVATE_RESULT` closes Search and moves/restores the normal Live TV highlight through the existing reducer/controller path; it does not play the result.

- [ ] **Step 2: Write Channel Actions RED**

Assert exact ACT-UI mapping:

```text
WATCH        -> PLAY_CHANNEL     -> existing controller requestPlayback
FAVORITE     -> TOGGLE_FAVORITE  -> injected favorite port only
PROGRAM_INFO -> SHOW_PROGRAM_INFO -> program-info layer only
```

Build the action list with `buildChannelActions({ providerId, channelId, isFavorite, programInfoAvailable })`. Missing EPG omits Program Info rather than inventing a disabled action.

- [ ] **Step 3: Implement one-layer Back priority**

Close in this order:

```text
program-info -> actions -> search -> existing option layer -> existing overlay -> platform outer Back/exit behavior
```

Each BACK invocation performs at most one close/delegation transition.

- [ ] **Step 4: Preserve centralized play ownership**

Only translate ACT-UI `PLAY_CHANNEL` to the controller's existing `requestPlayback(channelId)`. The feature helper never calls resolver/session/adapters directly.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP|Live TV"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/live-tv/live-tv-controller.ts player/src/live-tv/live-tv-feature-composition.ts player/test-ts/m4-live-tv-composition.test.ts
git commit -m "feat(live-tv): compose Search and channel actions"
```

---

### Task 4: Render M4 features in the existing DOM view

**Files:**
- Modify: `player/src/live-tv/dom-live-tv-view.ts`
- Modify: `player/src/live-tv/live-tv-controller.ts`
- Modify: `player/src/live-tv/contracts.ts` only if the final typed render model cannot remain in `live-tv-controller.ts`
- Modify: `player/test-ts/m4-live-tv-composition.test.ts`

- [ ] **Step 1: Write DOM RED tests**

Using the repository's DOM fake, prove:

- channel rows show EPG current title/time when available and stay usable for missing/unavailable EPG;
- selected current/next/detail presentation does not steal focus;
- Favorites virtual category uses `buildFavoritesViewModel` output and renders its approved empty state;
- Search input/results use stable result keys;
- action labels exactly match ACT-UI;
- Program Info is a separately dismissible layer;
- existing `data-presentation-state` still distinguishes highlighted/focused/playing.

- [ ] **Step 2: Extend only the render model**

Place M4 presentation data in `LiveTvViewModel` or a Live-TV-local render type. Do not add EPG/Favorites/Search/Actions presentation fields to core `LiveTvState`.

- [ ] **Step 3: Use safe DOM APIs**

Render external/provider/catalog/program text using `createElement`, `textContent`, classes and datasets; no `innerHTML`. Never render credentials, EPG source URLs, provider URLs, transient stream URLs, ciphertext, or raw exception text.

- [ ] **Step 4: Restore focus only for the owning layer**

Use stable channel IDs/search keys/action IDs. EPG text rerender alone must not focus any element. Layer focus must not overwrite the M3 playing-channel visual state.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M4-COMP|Live TV"
npm run typecheck -w player
git add player/src/live-tv/dom-live-tv-view.ts player/src/live-tv/live-tv-controller.ts player/test-ts/m4-live-tv-composition.test.ts
git commit -m "feat(live-tv): render M4 feature layers"
```

If `player/src/live-tv/contracts.ts` is truly required by the typed render contract, add it to the same commit and document why in the PR; otherwise leave it untouched.

---

### Task 5: Expose optional M4 ports through Live TV runtime

**Files:**
- Modify: `player/src/live-tv/create-live-tv-runtime.ts`
- Modify: `player/test-ts/m4-live-tv-composition.test.ts`

**Interfaces:**
- Consumes: application-provided `LiveTvFeaturePorts`.
- Produces: M4-capable controller construction with no provider-runtime/storage ownership.

- [ ] **Step 1: Write runtime injection RED**

Prove `createBrowserLiveTvRuntime` can accept optional `featurePorts` and pass them into the controller/composition. Existing `main.js` callers that omit the field must compile and retain current M3 startup/fallback behavior.

- [ ] **Step 2: Implement optional injection only**

Extend `BrowserLiveTvRuntimeDependencies` with `featurePorts?: LiveTvFeaturePorts`. When absent, run current M3-only behavior. Do not instantiate `StructuredFavoriteRepository`, alter `createBrowserProviderRuntime`, or create a second `IndexedDbStructuredStore` here. M5-COMP will adapt the concrete FavoriteService/EPG query/runtime objects.

- [ ] **Step 3: Add regression coverage**

Prove cache-first startup, failed background provider refresh isolation, watch observer wiring, resolver/session construction and legacy fallback remain unchanged with no feature ports, and presentation-port failures cannot switch runtime mode or control playback.

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

Expected changes: `live-tv-feature-composition.ts`, focused M4 test, and only the approved existing Live TV hot-zone files actually required by integration. No `main.js`, `index.html`, provider runtime, storage/repository, credentials, playback adapters/session/recovery, package metadata, or unrelated UI files.

- [ ] **Step 3: Open Draft PR with controller evidence**

Record exact base/head/files and explicit evidence for: highlight != playback; Search focus/result activation != playback; Favorite toggle != playback; Program Info != playback; only explicit play reaches `requestPlayback`; provider-scoped/stale-safe presentation refresh; Favorites reconciliation delegated to FAV-D; EPG failure isolation; one-layer Back; existing M3 startup/playback/recovery tests GREEN; canonical exact-head gates. Physical Tizen runtime is `NOT VERIFIED` unless separately run. Do not mark Ready or merge.
