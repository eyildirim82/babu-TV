# BabuşTV V1 Wave 3C M5 Application Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the merged Home, provider-management, first-run, modern Xtream/M3U onboarding, M4 Live TV, Favorites, EPG, and watch-state seams into one application-level flow without changing provider or playback semantics.

**Architecture:** Add focused modules under `player/src/app/`. `main.js` creates real services/views and supplies a single remote callback; legacy player/settings behavior stays behind the existing `handleRemoteAction` bridge. The only Live TV controller change is an additive scope/focus/play entry seam with explicit no-play guarantees.

**Tech Stack:** TypeScript 5.9, JavaScript ES modules, Vite 6, Node `node:test`/`tsx`, existing DOM views and Provider/M4 services.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-m5-app-composition-design.md`

## Global Constraints

- ROLE `M5-COMP`; branch `integration/m5-app-composition`.
- Frozen exact base `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- Read docs from `docs/wave3c-m5-pair-web-design`; production branch does not contain docs commits.
- Focus/highlight/navigation/provider-switch do not start playback.
- Only explicit `PLAY_CHANNEL` or existing M4 explicit play actions may start playback.
- Do not change Provider Core transactions, provider re-entry/edit, Provider Core user-state deletion, IndexedDB schema/version, WATCH-S formula, pairing, or playback/session/recovery semantics.
- `PROV-REENTRY` and `PROV-DEL-I` remain separate acceptance blockers.
- Do not add Home N-per-channel EPG queries.
- Legacy player and playback/proxy/update Settings remain reachable.
- One global `remote.init` and one application Tizen Back listener.
- Physical Samsung/Tizen runtime remains `NOT VERIFIED` unless separately run.

Owned production files:

```text
player/src/app/app-composition.ts
player/src/app/home-data-source.ts
player/src/app/live-tv-feature-ports.ts
player/src/app/provider-management-surface.ts
player/src/providers/create-browser-provider-runtime.ts
player/src/live-tv/live-tv-controller.ts
player/src/main.js
player/src/ui/provider-management.css
player/test-ts/m5-home-data-source.test.ts
player/test-ts/m5-live-tv-entry.test.ts
player/test-ts/m5-provider-management-surface.test.ts
player/test-ts/m5-app-composition.test.ts
```

`player/index.html` is forbidden in this lane.

---

### Task 1: Provider-scoped Home data source

**Files:** create `player/src/app/home-data-source.ts`, `player/test-ts/m5-home-data-source.test.ts`.

**Produces:** `DEFAULT_HOME_WATCH_SCORE_POLICY`, `HomeDataSourcePorts`, `HomeDataSource`, `createHomeDataSource`.

- [ ] **Step 1: RED active-provider partition test**

Use exact domain shapes:

```ts
const source = createHomeDataSource({
  providers: {
    async listProviders() {
      return [
        { id: 'p1', kind: 'xtream', name: 'One', createdAtMs: 1, lastSuccessfulSyncAtMs: null },
        { id: 'p2', kind: 'm3u', name: 'Two', createdAtMs: 2, lastSuccessfulSyncAtMs: null },
      ];
    },
    async getActiveProviderId() { return 'p1'; },
  },
  catalog: { async listChannels(id) { assert.equal(id, 'p1'); return [{ providerId: 'p1', id: 'c1', name: 'News', categoryId: null, logoUrl: null, number: 1 }]; } },
  favorites: { async list(id) { assert.equal(id, 'p1'); return [{ providerId: 'p1', channelId: 'c1', addedAtMs: 10 }]; } },
  watchState: {
    async getLastWatched(id) { assert.equal(id, 'p1'); return { providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 20 }; },
    async listAggregates(id) { assert.equal(id, 'p1'); return [{ providerId: 'p1', channelId: 'c1', meaningfulWatchMs: 60_000, meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: 20 }]; },
  },
  nowMs: () => 30,
  watchScorePolicy: DEFAULT_HOME_WATCH_SCORE_POLICY,
});
const model = await source.load();
assert.equal(model.lastWatched?.channelId, 'c1');
```

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Home data source"
```

Expected RED: module missing.

- [ ] **Step 2: Implement exact data source**

```ts
export const DEFAULT_HOME_WATCH_SCORE_POLICY: WatchScorePolicy = Object.freeze({
  durationWeightPerMinute: 1,
  openWeight: 5,
  recencyHalfLifeMs: 7 * 24 * 60 * 60 * 1000,
});

export function createHomeDataSource(ports: HomeDataSourcePorts): HomeDataSource {
  return {
    async load() {
      const [providers, activeProviderId] = await Promise.all([
        ports.providers.listProviders(),
        ports.providers.getActiveProviderId(),
      ]);
      if (activeProviderId === null) {
        return createHomeViewModel({ providers, activeProviderId: null, channels: [], lastWatched: null, favorites: [], watchAggregates: [], nowMs: ports.nowMs(), watchScorePolicy: ports.watchScorePolicy });
      }
      const [channels, favorites, lastWatched, watchAggregates] = await Promise.all([
        ports.catalog.listChannels(activeProviderId),
        ports.favorites.list(activeProviderId),
        ports.watchState.getLastWatched(activeProviderId),
        ports.watchState.listAggregates(activeProviderId),
      ]);
      return createHomeViewModel({ providers, activeProviderId, channels, lastWatched, favorites, watchAggregates, nowMs: ports.nowMs(), watchScorePolicy: ports.watchScorePolicy });
    },
  };
}
```

Interfaces use `Pick<ProviderRepository,'listProviders'|'getActiveProviderId'>`, `Pick<CatalogRepository,'listChannels'>`, `Pick<FavoriteRepository,'list'>`, `Pick<WatchStateRepository,'getLastWatched'|'listAggregates'>`, injected clock and policy.

- [ ] **Step 3: Lock null/stale/error behavior**

Tests prove: null active provider performs zero provider-scoped reads; stale active ID is projected by HOME-D to `null`; repository failure rejects `load()`.

```ts
assert.equal(scopedReadCount, 0);
assert.equal(staleModel.providerSelector.activeProviderId, null);
await assert.rejects(() => failingSource.load());
```

- [ ] **Step 4: GREEN + commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Home data source"
npm run typecheck
git add player/src/app/home-data-source.ts player/test-ts/m5-home-data-source.test.ts
git commit -m "feat(home): compose provider-scoped home data"
```

---

### Task 2: Favorites runtime exposure and M4 feature ports

**Files:** modify `create-browser-provider-runtime.ts`; create `app/live-tv-feature-ports.ts`; start `m5-app-composition.test.ts`.

- [ ] **Step 1: RED delegation test**

```ts
const events: string[] = [];
const ports = createAppLiveTvFeaturePorts({
  epg: { async getCurrent() { events.push('current'); return null; }, async getNext() { events.push('next'); return null; } },
  favorites: { async isFavorite() { events.push('favorite'); return false; }, async toggle() { return true; }, async reconcile() { return { available: [], missing: [] }; } },
  nowMs: () => 123,
});
assert.equal(ports.nowMs(), 123);
await ports.epg.getCurrent('p1', 'c1', 123);
await ports.favorites.isFavorite('p1', 'c1');
assert.deepEqual(events, ['current', 'favorite']);
```

- [ ] **Step 2: Expose durable Favorites from shared store**

```ts
const favorites = new StructuredFavoriteRepository(store);
return { providers, catalog, watchState, favorites, credentials, http, adapters, epgRepository, epg, sync, core };
```

No schema or Provider Core change.

- [ ] **Step 3: Implement feature-port factory**

```ts
export interface AppLiveTvFeaturePortDependencies {
  epg: Pick<EpgQuery, 'getCurrent' | 'getNext'>;
  favorites: Pick<FavoriteService, 'isFavorite' | 'toggle' | 'reconcile'>;
  nowMs(): number;
}
export function createAppLiveTvFeaturePorts(deps: AppLiveTvFeaturePortDependencies): LiveTvFeaturePorts {
  return { epg: deps.epg, favorites: deps.favorites, nowMs: deps.nowMs };
}
```

- [ ] **Step 4: GREEN + commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Live TV feature ports"
npm run typecheck
git add player/src/providers/create-browser-provider-runtime.ts player/src/app/live-tv-feature-ports.ts player/test-ts/m5-app-composition.test.ts
git commit -m "feat(app): expose favorites and compose live tv ports"
```

---

### Task 3: M4 application-entry seam

**Files:** modify `live-tv-controller.ts`; create `m5-live-tv-entry.test.ts`.

- [ ] **Step 1: RED focus/play separation**

Instantiate `LiveTvController` directly with a fake request recorder, fake platform and no-op view; enter this snapshot:

```ts
const snapshot = {
  provider: { id: 'p1', kind: 'xtream', name: 'One', createdAtMs: 1, lastSuccessfulSyncAtMs: null },
  categories: [],
  channels: [
    { providerId: 'p1', id: 'c1', name: 'One', categoryId: null, logoUrl: null, number: 1 },
    { providerId: 'p1', id: 'c2', name: 'Two', categoryId: null, logoUrl: null, number: 2 },
  ],
};
```

Assert `openScope(favorites)` and `openChannel(c2)` leave request count 0; `playChannel(c2)` makes count 1.

- [ ] **Step 2: Implement shared no-play focus helper**

```ts
private activeChannel(channelId: ChannelId): Channel | null {
  if (this.current === null || this.snapshot === null) return null;
  return this.snapshot.channels.find((channel) => channel.providerId === this.current!.providerId && channel.id === channelId) ?? null;
}

private focusChannelInAllScope(channelId: ChannelId): boolean {
  if (this.current === null || this.snapshot === null) return false;
  const target = this.activeChannel(channelId);
  if (target === null) return false;
  const allScope = { kind: 'all' as const };
  this.current = reduceLiveTv(this.current, { type: 'SET_SCOPE', scope: allScope, channels: this.snapshot.channels });
  this.current = { ...this.current, overlayOpen: true, overlayZone: 'CHANNEL', highlightedChannelId: target.id, restoreChannelIdByScope: { ...this.current.restoreChannelIdByScope, [scopeKey(allScope)]: target.id } };
  this.render();
  this.refreshFeatures();
  return true;
}
```

Existing Search activation calls this helper and never calls playback.

- [ ] **Step 3: Implement public methods**

```ts
openScope(scope: { kind: 'all' } | { kind: 'favorites' }): void {
  if (this.current === null || this.snapshot === null) return;
  this.current = reduceLiveTv(this.current, { type: 'SET_SCOPE', scope, channels: this.snapshot.channels });
  this.current = { ...this.current, overlayOpen: true, overlayZone: 'CHANNEL' };
  this.render();
  this.refreshFeatures();
}
openChannel(channelId: ChannelId): void { this.focusChannelInAllScope(channelId); }
async playChannel(channelId: ChannelId): Promise<void> {
  if (!this.focusChannelInAllScope(channelId)) return;
  await this.requestPlayback(channelId);
}
```

- [ ] **Step 4: Missing channel + Search regression, GREEN + commit**

```ts
controller.openChannel('missing');
await controller.playChannel('missing');
assert.equal(requests.length, 1);
```

Also retain existing M4 Search no-play test.

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Live TV application entry"
npm run test:ts -w player -- --test-name-pattern="M4"
npm run typecheck
git add player/src/live-tv/live-tv-controller.ts player/test-ts/m5-live-tv-entry.test.ts
git commit -m "feat(live-tv): add application entry controls"
```

---

### Task 4: Provider-management DOM surface

**Files:** create `app/provider-management-surface.ts`, `ui/provider-management.css`, `m5-provider-management-surface.test.ts`.

- [ ] **Step 1: RED with real `ProviderManagementPresenter`**

Copy the minimal fake DOM class bodies from `home-view.test.ts` into this test file. Instantiate real presenter operations with synthetic provider summaries. Test that delete confirmation Back cancels confirmation and does not call application `onBack`.

- [ ] **Step 2: Implement complete remote handler**

```ts
async handleAction(action: ProviderManagementSurfaceAction): Promise<void> {
  const state = this.presenter.state;
  if (state.confirmation !== null) {
    if (action === 'back') {
      if (this.presenter.state.focusedId !== 'cancel-delete') this.presenter.moveFocus('previous');
      await this.presenter.activateFocused();
      this.render();
      return;
    }
    if (action === 'up' || action === 'down') {
      this.presenter.moveFocus(action === 'down' ? 'next' : 'previous');
      this.render();
      return;
    }
    if (action === 'select') {
      await this.presenter.activateFocused();
      this.render();
    }
    return;
  }

  if (this.settingsFocused) {
    if (action === 'up') { this.settingsFocused = false; this.applyFocus(); return; }
    if (action === 'select') { this.callbacks.onOpenLegacySettings(); return; }
    if (action === 'back') { this.settingsFocused = false; this.callbacks.onBack(); return; }
    return;
  }

  if (action === 'back') { this.callbacks.onBack(); return; }
  if (action === 'down' && state.focusedId === state.focusOrder[state.focusOrder.length - 1]) {
    this.settingsFocused = true;
    this.applyFocus();
    return;
  }
  if (action === 'up' || action === 'down') {
    this.presenter.moveFocus(action === 'down' ? 'next' : 'previous');
    this.render();
    return;
  }
  if (action === 'select') {
    await this.presenter.activateFocused();
    this.render();
  }
}
```

`render()` uses only safe DOM/textContent and appends fixed `#app-settings` after normal presenter focus items. `applyFocus()` focuses `#app-settings` when `settingsFocused`, otherwise `presenter.state.focusedId`.

- [ ] **Step 3: CSS + GREEN + commit**

CSS scoped under `.provider-management-page`, uses existing BabuşTV variables, visible `:focus`, reduced-motion media query.

```bash
npm run test:ts -w player -- --test-name-pattern="M5 provider surface"
npm run typecheck
git add player/src/app/provider-management-surface.ts player/src/ui/provider-management.css player/test-ts/m5-provider-management-surface.test.ts
git commit -m "feat(app): render provider management surface"
```

---

### Task 5: Application orchestrator

**Files:** create `app/app-composition.ts`; extend `m5-app-composition.test.ts`.

**Produces:** `AppRoute`, `AppRemoteAction`, narrow view/legacy ports, `AppCompositionDependencies`, `createAppComposition`.

- [ ] **Step 1: Freeze route union**

```ts
export type AppRoute =
  | { kind: 'first-run' }
  | { kind: 'home' }
  | { kind: 'live-tv' }
  | { kind: 'provider-management' }
  | { kind: 'legacy-settings'; returnTo: 'provider-management' }
  | { kind: 'xtream-entry'; returnTo: 'first-run' | 'provider-management' }
  | { kind: 'm3u-entry'; returnTo: 'first-run' | 'provider-management' };
```

Write two complete dependency literals in the test: zero providers -> `first-run`; configured providers -> `home`; both assert zero play calls.

- [ ] **Step 2: Implement Home state loading**

```ts
private async showHome(): Promise<void> {
  this.hideAppSurface();
  this.currentRoute = { kind: 'home' };
  this.homeView.show({ kind: 'loading' });
  try {
    this.homeView.setState({ kind: 'ready', model: await this.deps.homeData.load() });
  } catch {
    this.homeView.setState({ kind: 'error', message: 'Ana sayfa yüklenemedi.' });
  }
}
```

- [ ] **Step 3: Implement/test exact Home intent routing**

```text
SELECT_PROVIDER -> core.switchActiveProvider -> showHome; 0 play
OPEN_LIVE_TV all -> switch if needed -> runtime -> openScope(all); 0 play
OPEN_LIVE_TV favorites -> switch if needed -> runtime -> openScope(favorites); 0 play
OPEN_LIVE_TV_CHANNEL -> switch if needed -> runtime -> openChannel; 0 play
PLAY_CHANNEL -> switch if needed -> runtime -> playChannel exactly once
OPEN_SETTINGS -> provider-management route; 0 play
```

`mode:'legacy'` invokes `legacyPlayer.open()` and stores `live-tv` route with no M3 controller.

- [ ] **Step 4: Implement first-run/add-provider/onboarding return routes**

Concrete callbacks: First Run Xtream/M3U opens corresponding entry with `returnTo`; successful injected onboarding calls `showHome()`; entry Back uses recorded return route; provider presenter `requestAddProvider()` opens the same chooser with return destination `provider-management`.

- [ ] **Step 5: Implement Back/remote dispatch**

Application Back rules: provider management -> Home; legacy settings -> provider management; Home -> real platform exit; first run -> injected legacy fallback; M3 root platform callback -> Home.

M3 remote mapping:

```ts
const M3_ACTIONS = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', select: 'SELECT', back: 'BACK', channelUp: 'CHANNEL_UP', channelDown: 'CHANNEL_DOWN' } as const;
```

Integer `digit` 0..9 becomes `{ type:'DIGIT', digit:value }`. Legacy route calls injected `legacyRemote(action,value)`.

- [ ] **Step 6: GREEN + commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5"
npm run typecheck
git add player/src/app/app-composition.ts player/test-ts/m5-app-composition.test.ts
git commit -m "feat(app): compose home and application navigation"
```

---

### Task 6: Browser bootstrap wiring

**Files:** modify `main.js`; integrate prior M5 files only.

- [ ] **Step 1: RED source assertions**

```ts
assert.match(source, /createAppComposition/);
assert.match(source, /createHomeDataSource/);
assert.match(source, /createAppLiveTvFeaturePorts/);
assert.doesNotMatch(source, /if \(await tryStartM3LiveTv\(\)\) \{\s*return;\s*\}/);
assert.equal((source.match(/remote\.init\(/g) ?? []).length, 1);
```

- [ ] **Step 2: Construct real Home/M4 dependencies once**

```js
const favoriteService = new FavoriteService(providerRuntime.favorites, () => Date.now());
const epgQuery = new RepositoryEpgQuery(providerRuntime.epgRepository, { lookBehindMs: 24 * 60 * 60 * 1000, lookAheadMs: 24 * 60 * 60 * 1000 });
const featurePorts = createAppLiveTvFeaturePorts({ epg: epgQuery, favorites: favoriteService, nowMs: () => Date.now() });
const homeData = createHomeDataSource({ providers: providerRuntime.providers, catalog: providerRuntime.catalog, favorites: providerRuntime.favorites, watchState: providerRuntime.watchState, nowMs: () => Date.now(), watchScorePolicy: DEFAULT_HOME_WATCH_SCORE_POLICY });
```

- [ ] **Step 3: Construct real onboarding/provider operations**

Instantiate existing `XtreamOnboardingService` and `M3uOnboardingService`; adapter for M3U `ok:false` throws fixed `ProviderError('MALFORMED', null, 'Provider connection could not be completed.')`.

Provider-management operations are exactly:

```js
{
  load: async () => ({ providers: await providerRuntime.providers.listProviders(), activeProviderId: await providerRuntime.providers.getActiveProviderId() }),
  switchProvider: (id) => providerRuntime.core.switchActiveProvider(id),
  deleteProvider: (id) => providerRuntime.core.deleteProvider(id),
}
```

- [ ] **Step 4: M3 root-Back platform adapter**

```js
function createAppLiveTvPlatform(onRootBack) {
  return { capabilities: () => platform.capabilities(), registerOptionalKeys: (keys) => platform.registerOptionalKeys(keys), exitApp: onRootBack };
}
```

Live TV factory passes this plus `featurePorts` to `createBrowserLiveTvRuntime`.

- [ ] **Step 5: Preserve legacy handler as injected fallback**

Do not rewrite its switches. Inject the existing function directly:

```js
const legacyRemote = (action, value) => handleRemoteAction(action, value);
```

The app calls `legacyRemote` only for legacy Live TV/legacy Settings fallback routes. Existing legacy dialog/sidebar/settings/playback semantics remain untouched.

- [ ] **Step 6: One remote/back owner and scoped CSS**

```js
remote.init((action, value) => { void app.handleRemote(action, value); }, { numericMode: 'digits' });
platform.registerOptionalKeys([...new Set([...LEGACY_OPTIONAL_TIZEN_KEYS, ...M3_NUMERIC_TIZEN_KEYS])]);
const onTizenBack = (event) => {
  if (event.keyName !== 'back') return;
  event.preventDefault();
  void app.handleRemote('back');
};
document.addEventListener('tizenhwkey', onTizenBack);
await app.boot();
```

Import Home, First Run, M3U and provider-management CSS from `main.js`; keep existing Xtream CSS. Remove independent M3 early-return remote/back setup. Do not edit `index.html`.

- [ ] **Step 7: GREEN + commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5"
npm run test:ts -w player -- --test-name-pattern="M4"
npm run typecheck
npm run build
git status --short
git add player/src/main.js player/src/app player/src/providers/create-browser-provider-runtime.ts player/src/live-tv/live-tv-controller.ts player/src/ui/provider-management.css player/test-ts/m5-*.test.ts
git commit -m "feat(app): wire M5 browser composition"
```

---

### Task 7: Exact-head gates and Draft PR

- [ ] **Step 1: Canonical verification**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

- [ ] **Step 2: Scope/invariant audit**

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Only owned files may appear. Confirm zero-play rules, Live TV root Back -> Home, Home root Back -> real exit, legacy Settings/player reachable, provider deletion remains existing Provider Core semantics, provider re-entry not implemented.

- [ ] **Step 3: Draft PR only**

Record ROLE/branch/base/head/files, RED/GREEN, exact-head gates, unresolved `PROV-REENTRY` + `PROV-DEL-I`, and physical runtime `NOT VERIFIED`. Do not mark Ready or merge.
