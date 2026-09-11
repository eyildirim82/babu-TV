# BabuşTV V1 Wave 3C M5 Application Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the merged Home, provider-management, first-run, Xtream/M3U onboarding, M4 Live TV, Favorites, EPG, and watch-state seams into one application-level runtime/navigation flow without changing provider or playback semantics.

**Architecture:** Add a focused `player/src/app/` composition layer. `main.js` remains bootstrap plus legacy bridge glue; Home data loading, M4 feature-port construction, provider-management DOM materialization, and route ownership live in small testable modules. The only M4 change is an additive programmatic entry seam whose scope/focus operations never imply playback.

**Tech Stack:** TypeScript 5.9, JavaScript ES modules, Vite 6, Node `node:test` via `tsx`, existing DOM views, existing Provider Core/repositories, existing M4 Live TV runtime.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-m5-app-composition-design.md`

## Global Constraints

- ROLE: `M5-COMP`.
- Production branch: `integration/m5-app-composition`.
- Frozen exact base: `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- Read the spec/plan from `docs/wave3c-m5-pair-web-design`; do not cherry-pick docs commits into the production branch.
- Preserve `highlight/focus/navigation != playback`.
- Provider switching alone emits zero playback requests.
- Only explicit Home `PLAY_CHANNEL` or existing M4 explicit play actions may start playback.
- Do not modify Provider Core transaction semantics, provider edit/re-entry semantics, IndexedDB schema/version, WATCH-S implementation, Shaka/AVPlay/session/recovery semantics, or pairing code.
- `PROV-REENTRY` and `PROV-DEL-I` remain separate controller gaps; this PR must not claim those behaviors.
- Home current-program decoration remains omitted in this lane; do not add N-per-channel EPG queries.
- Keep legacy player and playback/proxy/update Settings reachable.
- Initialize the global remote/back boundary exactly once in the M5 application path.
- Physical Samsung/Tizen runtime remains `NOT VERIFIED` unless separately executed.

### Exact owned production scope

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

`player/index.html` is outside scope. If a real implementation blocker requires it, stop and report the blocker before changing scope.

---

### Task 1: Add a provider-scoped Home data source

**Files:**
- Create: `player/src/app/home-data-source.ts`
- Create: `player/test-ts/m5-home-data-source.test.ts`

**Interfaces:**
- Consumes: provider/catalog/Favorites/watch repository read methods and `createHomeViewModel`.
- Produces: `DEFAULT_HOME_WATCH_SCORE_POLICY`, `HomeDataSourcePorts`, `HomeDataSource`, `createHomeDataSource`.

- [ ] **Step 1: Write RED active-provider partition test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOME_WATCH_SCORE_POLICY,
  createHomeDataSource,
} from '../src/app/home-data-source.js';

test('M5 Home data source reads only the active provider partition', async () => {
  const calls: string[] = [];
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
    catalog: {
      async listChannels(providerId) {
        calls.push(`channels:${providerId}`);
        return [{ providerId: 'p1', id: 'c1', name: 'News', categoryId: null, logoUrl: null, number: 1 }];
      },
    },
    favorites: {
      async list(providerId) {
        calls.push(`favorites:${providerId}`);
        return [{ providerId: 'p1', channelId: 'c1', addedAtMs: 10 }];
      },
    },
    watchState: {
      async getLastWatched(providerId) {
        calls.push(`last:${providerId}`);
        return { providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 20 };
      },
      async listAggregates(providerId) {
        calls.push(`aggregates:${providerId}`);
        return [{ providerId: 'p1', channelId: 'c1', meaningfulWatchMs: 60_000, meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: 20 }];
      },
    },
    nowMs: () => 30,
    watchScorePolicy: DEFAULT_HOME_WATCH_SCORE_POLICY,
  });

  const model = await source.load();
  assert.equal(model.providerSelector.activeProviderId, 'p1');
  assert.equal(model.lastWatched?.channelId, 'c1');
  assert.deepEqual(calls.sort(), ['aggregates:p1', 'channels:p1', 'favorites:p1', 'last:p1']);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Home data source"
npm run typecheck
```

Expected: module-not-found/type failure for `app/home-data-source.ts`.

- [ ] **Step 3: Implement the exact data source**

```ts
import type { FavoriteRepository } from '../favorites/contracts.js';
import { createHomeViewModel, type HomeViewModel } from '../home/home-domain.js';
import type { CatalogRepository } from '../repository/catalog-repository.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import type { WatchStateRepository } from '../watch/contracts.js';
import type { WatchScorePolicy } from '../watch/score.js';

export const DEFAULT_HOME_WATCH_SCORE_POLICY: WatchScorePolicy = Object.freeze({
  durationWeightPerMinute: 1,
  openWeight: 5,
  recencyHalfLifeMs: 7 * 24 * 60 * 60 * 1000,
});

export interface HomeDataSourcePorts {
  providers: Pick<ProviderRepository, 'listProviders' | 'getActiveProviderId'>;
  catalog: Pick<CatalogRepository, 'listChannels'>;
  favorites: Pick<FavoriteRepository, 'list'>;
  watchState: Pick<WatchStateRepository, 'getLastWatched' | 'listAggregates'>;
  nowMs(): number;
  watchScorePolicy: WatchScorePolicy;
}

export interface HomeDataSource { load(): Promise<HomeViewModel>; }

export function createHomeDataSource(ports: HomeDataSourcePorts): HomeDataSource {
  return {
    async load() {
      const [providers, activeProviderId] = await Promise.all([
        ports.providers.listProviders(),
        ports.providers.getActiveProviderId(),
      ]);
      if (activeProviderId === null) {
        return createHomeViewModel({
          providers,
          activeProviderId: null,
          channels: [],
          lastWatched: null,
          favorites: [],
          watchAggregates: [],
          nowMs: ports.nowMs(),
          watchScorePolicy: ports.watchScorePolicy,
        });
      }
      const [channels, favorites, lastWatched, watchAggregates] = await Promise.all([
        ports.catalog.listChannels(activeProviderId),
        ports.favorites.list(activeProviderId),
        ports.watchState.getLastWatched(activeProviderId),
        ports.watchState.listAggregates(activeProviderId),
      ]);
      return createHomeViewModel({
        providers,
        activeProviderId,
        channels,
        lastWatched,
        favorites,
        watchAggregates,
        nowMs: ports.nowMs(),
        watchScorePolicy: ports.watchScorePolicy,
      });
    },
  };
}
```

Do not pass `currentPrograms`.

- [ ] **Step 4: Add null/stale/error tests**

Add concrete tests proving:

```ts
assert.equal(readCountWhenActiveProviderIsNull, 0);
assert.equal(staleModel.providerSelector.activeProviderId, null);
await assert.rejects(() => failingSource.load());
```

For the stale case, return `getActiveProviderId() === 'missing'` while `listProviders()` omits that ID; repository fakes may return empty arrays for `missing`. HOME-D must be the component that projects the stale active ID to `null`.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Home data source"
npm run typecheck
git add player/src/app/home-data-source.ts player/test-ts/m5-home-data-source.test.ts
git commit -m "feat(home): compose provider-scoped home data"
```

---

### Task 2: Expose Favorites and construct M4 feature ports

**Files:**
- Modify: `player/src/providers/create-browser-provider-runtime.ts`
- Create: `player/src/app/live-tv-feature-ports.ts`
- Create: `player/test-ts/m5-app-composition.test.ts`

**Interfaces:**
- Produces: browser runtime `favorites` and `createAppLiveTvFeaturePorts`.

- [ ] **Step 1: Write RED feature-port delegation test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppLiveTvFeaturePorts } from '../src/app/live-tv-feature-ports.js';

test('M5 Live TV feature ports delegate to frozen EPG and Favorites seams', async () => {
  const events: string[] = [];
  const ports = createAppLiveTvFeaturePorts({
    epg: {
      async getCurrent() { events.push('current'); return null; },
      async getNext() { events.push('next'); return null; },
    },
    favorites: {
      async isFavorite() { events.push('isFavorite'); return false; },
      async toggle() { events.push('toggle'); return true; },
      async reconcile() { events.push('reconcile'); return { available: [], missing: [] }; },
    },
    nowMs: () => 123,
  });
  assert.equal(ports.nowMs(), 123);
  await ports.epg.getCurrent('p1', 'c1', 123);
  await ports.favorites.isFavorite('p1', 'c1');
  assert.deepEqual(events, ['current', 'isFavorite']);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Live TV feature ports"
npm run typecheck
```

- [ ] **Step 3: Expose `StructuredFavoriteRepository` from the shared browser runtime**

Add:

```ts
import { StructuredFavoriteRepository } from '../repository/structured-favorite-repository.js';
```

Construct from the already-created shared `store`:

```ts
const favorites = new StructuredFavoriteRepository(store);
```

Return `favorites` next to `watchState`. Do not modify IndexedDB or Provider Core.

- [ ] **Step 4: Implement the narrow feature-port factory**

```ts
import type { EpgQuery } from '../epg/contracts.js';
import type { FavoriteService } from '../favorites/service.js';
import type { LiveTvFeaturePorts } from '../live-tv/live-tv-feature-composition.js';

export interface AppLiveTvFeaturePortDependencies {
  epg: Pick<EpgQuery, 'getCurrent' | 'getNext'>;
  favorites: Pick<FavoriteService, 'isFavorite' | 'toggle' | 'reconcile'>;
  nowMs(): number;
}

export function createAppLiveTvFeaturePorts(
  deps: AppLiveTvFeaturePortDependencies,
): LiveTvFeaturePorts {
  return { epg: deps.epg, favorites: deps.favorites, nowMs: deps.nowMs };
}
```

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Live TV feature ports"
npm run typecheck
git add player/src/providers/create-browser-provider-runtime.ts player/src/app/live-tv-feature-ports.ts player/test-ts/m5-app-composition.test.ts
git commit -m "feat(app): expose favorites and compose live tv ports"
```

---

### Task 3: Add a no-play M4 application-entry seam

**Files:**
- Modify: `player/src/live-tv/live-tv-controller.ts`
- Create: `player/test-ts/m5-live-tv-entry.test.ts`

**Interfaces:**
- Produces: `openScope`, `openChannel`, `playChannel`.

- [ ] **Step 1: Write RED scope/focus/play separation test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveTvController } from '../src/live-tv/live-tv-controller.js';

const snapshot = {
  provider: { id: 'p1', kind: 'xtream', name: 'One', createdAtMs: 1, lastSuccessfulSyncAtMs: null },
  categories: [],
  channels: [
    { providerId: 'p1', id: 'c1', name: 'One', categoryId: null, logoUrl: null, number: 1 },
    { providerId: 'p1', id: 'c2', name: 'Two', categoryId: null, logoUrl: null, number: 2 },
  ],
};

test('M5 Live TV application entry separates focus from explicit playback', async () => {
  const requests: unknown[] = [];
  const controller = new LiveTvController({
    intent: {
      async requestChannel(request) {
        requests.push(request);
        return 'playing';
      },
    },
    platform: {
      capabilities: () => ({ tizen: false, optionsKey: false, channelKeys: false, numericKeys: false }),
      registerOptionalKeys() {},
      exitApp() {},
    },
    view: { render() {} },
  });
  controller.enter(snapshot);

  controller.openScope({ kind: 'favorites' });
  assert.equal(controller.state().activeScope.kind, 'favorites');
  assert.equal(requests.length, 0);

  controller.openChannel('c2');
  assert.equal(controller.state().activeScope.kind, 'all');
  assert.equal(controller.state().highlightedChannelId, 'c2');
  assert.equal(requests.length, 0);

  await controller.playChannel('c2');
  assert.equal(requests.length, 1);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Live TV application entry"
npm run typecheck
```

- [ ] **Step 3: Implement a private active-channel guard and focus helper**

```ts
private activeChannel(channelId: ChannelId): Channel | null {
  if (this.current === null || this.snapshot === null) return null;
  return this.snapshot.channels.find(
    (channel) => channel.providerId === this.current!.providerId && channel.id === channelId,
  ) ?? null;
}

private focusChannelInAllScope(channelId: ChannelId): boolean {
  if (this.current === null || this.snapshot === null) return false;
  const target = this.activeChannel(channelId);
  if (target === null) return false;
  const allScope = { kind: 'all' as const };
  this.current = reduceLiveTv(this.current, {
    type: 'SET_SCOPE',
    scope: allScope,
    channels: this.snapshot.channels,
  });
  this.current = {
    ...this.current,
    overlayOpen: true,
    overlayZone: 'CHANNEL',
    highlightedChannelId: target.id,
    restoreChannelIdByScope: {
      ...this.current.restoreChannelIdByScope,
      [scopeKey(allScope)]: target.id,
    },
  };
  this.render();
  this.refreshFeatures();
  return true;
}
```

Refactor existing Search activation to call this helper after validating provider identity. Search still performs zero playback requests.

- [ ] **Step 4: Implement the three public methods**

```ts
openScope(scope: { kind: 'all' } | { kind: 'favorites' }): void {
  if (this.current === null || this.snapshot === null) return;
  this.current = reduceLiveTv(this.current, {
    type: 'SET_SCOPE',
    scope,
    channels: this.snapshot.channels,
  });
  this.current = { ...this.current, overlayOpen: true, overlayZone: 'CHANNEL' };
  this.render();
  this.refreshFeatures();
}

openChannel(channelId: ChannelId): void {
  this.focusChannelInAllScope(channelId);
}

async playChannel(channelId: ChannelId): Promise<void> {
  if (!this.focusChannelInAllScope(channelId)) return;
  await this.requestPlayback(channelId);
}
```

- [ ] **Step 5: Add missing/foreign/Search regression assertions**

Use the same controller and assert:

```ts
controller.openChannel('missing');
await controller.playChannel('missing');
assert.equal(requests.length, 1); // only the prior explicit c2 play
```

Then activate an existing Search result through the existing feature composition test seam and assert request count does not increase.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Live TV application entry"
npm run test:ts -w player -- --test-name-pattern="M4"
npm run typecheck
git add player/src/live-tv/live-tv-controller.ts player/test-ts/m5-live-tv-entry.test.ts
git commit -m "feat(live-tv): add application entry controls"
```

---

### Task 4: Materialize provider management without duplicating semantics

**Files:**
- Create: `player/src/app/provider-management-surface.ts`
- Create: `player/src/ui/provider-management.css`
- Create: `player/test-ts/m5-provider-management-surface.test.ts`

**Interfaces:**
- Consumes: `ProviderManagementPresenter` public API.
- Produces: `ProviderManagementSurface`, `ProviderManagementSurfaceCallbacks`, `ProviderManagementSurfaceAction`.

- [ ] **Step 1: Write RED one-layer Back test using the real presenter**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderManagementPresenter } from '../src/provider-management/provider-management-presenter.js';
import { ProviderManagementSurface } from '../src/app/provider-management-surface.js';

test('M5 provider surface cancels delete confirmation before leaving', async () => {
  const events: string[] = [];
  const presenter = new ProviderManagementPresenter({
    async load() {
      return {
        providers: [{ id: 'p1', kind: 'xtream', name: 'One' }],
        activeProviderId: 'p1',
      };
    },
    async switchProvider() { events.push('switch'); },
    async deleteProvider() { events.push('delete'); },
    requestAddProvider() { events.push('add'); },
  });

  // The test file must use the same minimal FakeDocument implementation already
  // present in HOME-UI/FIRST-UI tests, copied into this test file so it has no new dependency.
  const surface = new ProviderManagementSurface(document as unknown as Document, presenter, {
    onBack: () => events.push('back'),
    onOpenLegacySettings: () => events.push('legacy-settings'),
  });
  await surface.show();
  // Move to the delete focus item, Select opens confirmation, then Back cancels it.
  surface.handleAction('down');
  await surface.handleAction('select');
  assert.notEqual(presenter.state.confirmation, null);
  await surface.handleAction('back');
  assert.equal(presenter.state.confirmation, null);
  assert.equal(events.includes('back'), false);
});
```

Copy the minimal fake DOM class bodies, not imports or external dependencies, from `player/test-ts/home-view.test.ts` into this test file and name the instance `document` before the snippet above.

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 provider surface"
npm run typecheck
```

- [ ] **Step 3: Implement safe DOM projection**

Create root `#provider-management-page`. Render labels from `presenter.state` with `textContent`. Render provider switch/delete items using the presenter's `switchFocusId/deleteFocusId`; render confirmation using its two fixed IDs. Append one app-owned fixed button `#app-settings` only when confirmation is closed.

- [ ] **Step 4: Implement exact remote rules**

```ts
export type ProviderManagementSurfaceAction = 'up' | 'down' | 'select' | 'back';

async handleAction(action: ProviderManagementSurfaceAction): Promise<void> {
  const state = this.presenter.state;
  if (state.confirmation !== null) {
    if (action === 'back') {
      if (this.presenter.state.focusedId !== 'cancel-delete') {
        this.presenter.moveFocus('previous');
      }
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
  // Normal state: delegate presenter items; allow one trailing app-settings focus.
}
```

Implement normal state with a private boolean `settingsFocused`. `down` from `presenter.state.focusOrder` final item enters settings; `up` from settings clears it; Select on settings calls `onOpenLegacySettings`; Back calls `onBack`; all other movement/activation delegates to presenter.

- [ ] **Step 5: Add CSS and focus tests**

CSS must be scoped under `.provider-management-page`, use existing BabuşTV CSS variables, visibly style `:focus`, and include `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 provider surface"
npm run typecheck
git add player/src/app/provider-management-surface.ts player/src/ui/provider-management.css player/test-ts/m5-provider-management-surface.test.ts
git commit -m "feat(app): render provider management surface"
```

---

### Task 5: Implement the application orchestrator

**Files:**
- Create: `player/src/app/app-composition.ts`
- Modify: `player/test-ts/m5-app-composition.test.ts`

**Interfaces:**
- Produces: `AppRoute`, `AppRemoteAction`, view/legacy bridge ports, `AppCompositionDependencies`, `AppComposition`, `createAppComposition`.

- [ ] **Step 1: Define the exact route union and RED boot test**

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

The test dependency object must use plain fake view ports that only push event strings. Write two independent instances:

```ts
const zeroProviders = createAppComposition(zeroProviderDeps);
await zeroProviders.boot();
assert.deepEqual(zeroProviders.route(), { kind: 'first-run' });

const configured = createAppComposition(configuredProviderDeps);
await configured.boot();
assert.deepEqual(configured.route(), { kind: 'home' });
assert.equal(configuredProviderEvents.includes('play'), false);
```

Define `zeroProviderDeps` and `configuredProviderDeps` in the test file as complete `AppCompositionDependencies` literals; do not add a generic mock framework.

- [ ] **Step 2: Implement sanitized Home loading**

`showHome()` sets loading, awaits `homeData.load()`, then ready or fixed error:

```ts
this.homeView.show({ kind: 'loading' });
try {
  const model = await this.deps.homeData.load();
  this.homeView.setState({ kind: 'ready', model });
} catch {
  this.homeView.setState({ kind: 'error', message: 'Ana sayfa yüklenemedi.' });
}
```

No provider switch/play occurs in this function.

- [ ] **Step 3: Implement exact Home intent routing and tests**

Test each intent separately and record calls. Required call results:

```text
SELECT_PROVIDER        => switch provider, reload Home, 0 play
OPEN_LIVE_TV all       => optional switch, create M3, openScope(all), 0 play
OPEN_LIVE_TV favorites => optional switch, create M3, openScope(favorites), 0 play
OPEN_LIVE_TV_CHANNEL   => optional switch, create M3, openChannel, 0 play
PLAY_CHANNEL           => optional switch, create M3, playChannel exactly once
OPEN_SETTINGS          => provider-management route, 0 play
```

When the Live TV factory returns `{ mode: 'legacy' }`, call the injected legacy player bridge and do not synthesize an M3 controller.

- [ ] **Step 4: Implement first-run/add-provider/onboarding return routes**

The orchestrator constructs view callbacks. Xtream/M3U chooser routes remember `returnTo`. Successful injected `connectXtream`/`connectM3u` calls `showHome()`. Failed callbacks reject back to the existing entry view so that view retains its existing input/error behavior.

Provider-management `requestAddProvider` opens the same provider chooser with return destination `provider-management`; it does not create a second onboarding transaction.

- [ ] **Step 5: Implement Back ownership and tests**

```text
provider management -> Home
legacy settings -> provider management
Live TV root adapter callback -> Home
Home -> real app exit callback
entry view -> recorded return route
first run -> injected legacy-fallback callback
```

Inside M4, feature/option/overlay Back remains `LiveTvController` behavior before its root `Platform.exitApp()` callback fires.

- [ ] **Step 6: Implement route-aware remote dispatch**

Use one public method:

```ts
handleRemote(action: AppRemoteAction, value?: number): void | Promise<void>;
```

Map arrows/Select/Back to Home/FirstRun/Xtream/M3U/provider surface methods. For M3 use:

```ts
const logical = {
  up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
  select: 'SELECT', back: 'BACK',
  channelUp: 'CHANNEL_UP', channelDown: 'CHANNEL_DOWN',
} as const;
```

`digit` with integer 0..9 maps to `{ type: 'DIGIT', digit: value }`. Legacy Live TV/Settings delegate to injected legacy bridges.

- [ ] **Step 7: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5"
npm run typecheck
git add player/src/app/app-composition.ts player/test-ts/m5-app-composition.test.ts
git commit -m "feat(app): compose home and application navigation"
```

---

### Task 6: Bind the browser bootstrap without changing legacy semantics

**Files:**
- Modify: `player/src/main.js`
- Modify prior M5 files only to fix compile/test integration discovered here.

**Interfaces:**
- Binds concrete views/services/runtimes to `createAppComposition`.

- [ ] **Step 1: Write RED bootstrap source test**

In `m5-app-composition.test.ts`, read `src/main.js` and assert:

```ts
assert.match(source, /createAppComposition/);
assert.match(source, /createHomeDataSource/);
assert.match(source, /createAppLiveTvFeaturePorts/);
assert.doesNotMatch(source, /if \(await tryStartM3LiveTv\(\)\) \{\s*return;\s*\}/);
```

Also count `remote.init(` in the application bootstrap source and require one active call site after the refactor.

- [ ] **Step 2: Preserve legacy handlers behind explicit bridges**

Split the current handler without changing its inner behavior:

```js
function handleLegacySettingsAction(action) {
  // move the existing settings-visible switch here unchanged
}

function handleLegacyPlayerAction(action, value) {
  // move the existing sidebar/player switch here unchanged
}
```

Keep existing dialogs/Whats-New handling at the application boundary before route dispatch where they currently have global ownership.

- [ ] **Step 3: Construct modern dependencies once**

Add imports and construction:

```js
const favoriteService = new FavoriteService(providerRuntime.favorites, () => Date.now());
const epgQuery = new RepositoryEpgQuery(providerRuntime.epgRepository, {
  lookBehindMs: 24 * 60 * 60 * 1000,
  lookAheadMs: 24 * 60 * 60 * 1000,
});
const featurePorts = createAppLiveTvFeaturePorts({
  epg: epgQuery,
  favorites: favoriteService,
  nowMs: () => Date.now(),
});
const homeData = createHomeDataSource({
  providers: providerRuntime.providers,
  catalog: providerRuntime.catalog,
  favorites: providerRuntime.favorites,
  watchState: providerRuntime.watchState,
  nowMs: () => Date.now(),
  watchScorePolicy: DEFAULT_HOME_WATCH_SCORE_POLICY,
});
```

- [ ] **Step 4: Construct M3U onboarding using the existing transaction**

Instantiate `M3uOnboardingService` with `providerRuntime.core`, `providerRuntime.sync`, injected ID factory, and clock. Adapt its defensive `ok:false` result to the existing entry callback with a fixed sanitized `ProviderError('MALFORMED', null, 'Provider connection could not be completed.')`.

Do not change `M3uOnboardingService`.

- [ ] **Step 5: Provide the Live TV root-Back platform adapter**

```js
function createAppLiveTvPlatform(onRootBack) {
  return {
    capabilities: () => platform.capabilities(),
    registerOptionalKeys: (keys) => platform.registerOptionalKeys(keys),
    exitApp: onRootBack,
  };
}
```

Pass this platform and real `featurePorts` to `createBrowserLiveTvRuntime` from the app's Live TV factory.

- [ ] **Step 6: Bind concrete view factories and provider operations**

Provider management operations are exactly:

```js
{
  load: async () => ({
    providers: await providerRuntime.providers.listProviders(),
    activeProviderId: await providerRuntime.providers.getActiveProviderId(),
  }),
  switchProvider: (providerId) => providerRuntime.core.switchActiveProvider(providerId),
  deleteProvider: (providerId) => providerRuntime.core.deleteProvider(providerId),
}
```

Do not add user-state cleanup or edit/re-entry here.

- [ ] **Step 7: Replace M3 early return with one app boot/remote owner**

After player initialization:

```js
remote.init((action, value) => { void app.handleRemote(action, value); }, { numericMode: 'digits' });
platform.registerOptionalKeys([...new Set([...LEGACY_OPTIONAL_TIZEN_KEYS, ...M3_NUMERIC_TIZEN_KEYS])]);
document.addEventListener('tizenhwkey', onTizenBack);
await app.boot();
```

`onTizenBack` prevents default and calls `app.handleRemote('back')`. Remove the independent M3 `remote.init`/Back listener/early return path.

- [ ] **Step 8: Attach scoped styles through module imports**

Import:

```js
import './ui/home.css';
import './ui/first-run.css';
import './ui/m3u-entry.css';
import './ui/provider-management.css';
```

Keep the existing Xtream CSS import. Do not edit `index.html`.

- [ ] **Step 9: Run focused regression and commit**

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

### Task 7: Verify the exact production head and open Draft PR

- [ ] **Step 1: Run canonical gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

All commands must exit 0. `npm run tizen` does not substitute for `npm run tizen:build`.

- [ ] **Step 2: Audit exact scope**

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Only the owned files listed under Global Constraints may appear.

- [ ] **Step 3: Audit semantic invariants**

Confirm from tests/final diff:

```text
Home focus/navigation -> 0 playback
SELECT_PROVIDER -> switch only
OPEN_LIVE_TV all/favorites -> 0 playback
OPEN_LIVE_TV_CHANNEL -> 0 playback
PLAY_CHANNEL -> exactly one explicit request
Search activation -> 0 playback
Live TV root Back -> Home
Home root Back -> real app exit
provider delete -> existing Provider Core semantics only
provider edit/re-entry -> not implemented/claimed
legacy Settings/player -> reachable
```

- [ ] **Step 4: Open Draft PR only**

PR evidence must record ROLE, branch, frozen base, final head, exact changed files, RED/GREEN evidence, canonical exact-head evidence, the two unresolved provider-management gaps, and physical runtime `NOT VERIFIED` unless actually executed. Do not mark Ready and do not merge.
