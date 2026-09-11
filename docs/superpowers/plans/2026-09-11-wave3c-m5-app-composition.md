# BabuşTV V1 Wave 3C M5 Application Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the merged Home, provider-management, first-run, modern Xtream/M3U onboarding, M4 Live TV, Favorites, EPG, and watch-state seams into one application-level runtime/navigation flow without changing provider or playback semantics.

**Architecture:** Add a focused `app` composition layer. `main.js` remains bootstrap/legacy-bridge glue; Home data projection, M4 feature-port construction, provider-management DOM materialization, and application route ownership live in small testable modules. The only M4 production change is an additive programmatic entry seam whose focus/scope operations never imply playback.

**Tech Stack:** TypeScript 5.9, JavaScript ES modules, Vite 6, Node `node:test` via `tsx`, existing DOM presentation modules, existing Provider Core/repositories, existing M4 Live TV runtime.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-m5-app-composition-design.md`

## Global Constraints

- ROLE: `M5-COMP`.
- Production branch: `integration/m5-app-composition`.
- Frozen exact implementation base: `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- The worker reads this plan/spec from `docs/wave3c-m5-pair-web-design` read-only; do not cherry-pick documentation commits into the production branch.
- Preserve `highlight/focus/navigation != playback`; only an explicit `PLAY_CHANNEL` Home intent or existing M4 explicit play action may start playback.
- Provider switching alone must never start playback.
- Do not change `ProviderCoreService` transaction semantics in this lane.
- Do not implement provider edit/re-entry in this lane.
- Do not integrate Favorites/watch deletion into Provider Core in this lane; `PROV-DEL-I` remains separate.
- Do not change IndexedDB schema/version.
- Do not change WATCH-S scoring implementation. The composition policy is fixed here to `{ durationWeightPerMinute: 1, openWeight: 5, recencyHalfLifeMs: 7 * 24 * 60 * 60 * 1000 }`.
- Home current-program decoration stays omitted unless a bounded bulk seam already exists; do not add N-per-channel EPG queries.
- Keep existing Xtream/M3U onboarding services as the only onboarding transaction owners.
- Keep existing Shaka -> AVPlay/session/recovery semantics unchanged.
- Keep the legacy player and playback/proxy/update Settings route usable as fallback/secondary application settings.
- Initialize the global remote/key boundary exactly once in the M5 application path.
- Physical Samsung/Tizen runtime remains `NOT VERIFIED` unless separately executed on device/emulator.

### Expected production file scope

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

Do not add `player/index.html` unless implementation proves a mount/accessibility requirement that cannot be satisfied by the existing body-mounted views. If that happens, stop and report the exact reason before expanding scope.

---

### Task 1: Build the provider-scoped Home data source

**Files:**
- Create: `player/src/app/home-data-source.ts`
- Create: `player/test-ts/m5-home-data-source.test.ts`

**Interfaces:**
- Consumes: `ProviderRepository.listProviders/getActiveProviderId`, `CatalogRepository.listChannels`, `FavoriteRepository.list`, `WatchStateRepository.getLastWatched/listAggregates`, `createHomeViewModel`, injected `nowMs`.
- Produces: `DEFAULT_HOME_WATCH_SCORE_POLICY`, `HomeDataSourcePorts`, `HomeDataSource`, `createHomeDataSource`.

- [ ] **Step 1: Write the RED provider-partition test**

Create a focused test that supplies two providers and deliberately places foreign-provider channels/Favorites/watch records in the fakes. Require the data source to read only the active provider's provider-scoped repositories and let HOME-D perform final projection.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOME_WATCH_SCORE_POLICY,
  createHomeDataSource,
} from '../src/app/home-data-source.js';

test('M5 Home data source loads only the active provider partition', async () => {
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
        return [{ providerId: 'p1', id: 'c1', categoryId: null, name: 'News', number: 1, logoUrl: null }];
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

Use the exact `Channel` fields from `domain/models.ts` if the compiler requires additional frozen properties; do not weaken the domain type with `any`.

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Home data source"
npm run typecheck
```

Expected: FAIL because `app/home-data-source.ts` does not exist.

- [ ] **Step 3: Implement the minimal data source**

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

export interface HomeDataSource {
  load(): Promise<HomeViewModel>;
}

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

Do not populate `currentPrograms` in this lane.

- [ ] **Step 4: Add null/stale active-provider degradation tests**

Add tests proving:

- `activeProviderId === null` performs no channel/Favorites/watch reads and returns HOME-D's safe provider-selector model;
- a stale active provider ID does not cause cross-provider reads to be synthesized by M5; HOME-D safely projects no active provider if the ID is absent from `providers`;
- repository errors reject `load()` so the app layer can present Home's sanitized error state rather than fabricate data.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Home data source"
npm run typecheck
git add player/src/app/home-data-source.ts player/test-ts/m5-home-data-source.test.ts
git commit -m "feat(home): compose provider-scoped home data"
```

---

### Task 2: Expose durable Favorites and construct real M4 feature ports

**Files:**
- Modify: `player/src/providers/create-browser-provider-runtime.ts`
- Create: `player/src/app/live-tv-feature-ports.ts`
- Modify: `player/test-ts/m5-app-composition.test.ts` if already created by the executor, otherwise create the file in this task with only the feature-port tests and extend it later.

**Interfaces:**
- Consumes: `StructuredFavoriteRepository`, `FavoriteService`, `RepositoryEpgQuery`, `LiveTvFeaturePorts`.
- Produces: provider-runtime `favorites` repository exposure and `createAppLiveTvFeaturePorts`.

- [ ] **Step 1: Write RED source/runtime-boundary acceptance**

Add a focused test that imports the new factory and proves its returned object delegates Favorites and EPG through injected existing services rather than reimplementing them.

```ts
test('M5 constructs Live TV feature ports from existing EPG and Favorites seams', async () => {
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

Also add a static import/runtime construction assertion that `createBrowserProviderRuntime(...)` exposes `favorites`; do not perform storage operations with `indexedDb: null`.

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 constructs Live TV feature ports"
npm run typecheck
```

Expected: FAIL because the app feature-port factory and runtime `favorites` property do not exist.

- [ ] **Step 3: Add the Favorites repository to the browser provider runtime**

In `create-browser-provider-runtime.ts`, construct the repository from the existing shared store:

```ts
import { StructuredFavoriteRepository } from '../repository/structured-favorite-repository.js';

const favorites = new StructuredFavoriteRepository(store);
```

Return it alongside the existing runtime objects:

```ts
return {
  providers,
  catalog,
  watchState,
  favorites,
  credentials,
  http,
  adapters,
  epgRepository,
  epg,
  sync,
  core,
};
```

Do not alter store schema/version or Provider Core constructor semantics.

- [ ] **Step 4: Implement the narrow feature-port factory**

`live-tv-feature-ports.ts` must be dependency-only; it must not instantiate storage/network services itself.

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
  return {
    epg: deps.epg,
    favorites: deps.favorites,
    nowMs: deps.nowMs,
  };
}
```

Production construction in Task 6 will use `new FavoriteService(providerRuntime.favorites, () => Date.now())` and `new RepositoryEpgQuery(providerRuntime.epgRepository, { lookBehindMs: 24 * 60 * 60 * 1000, lookAheadMs: 24 * 60 * 60 * 1000 })`. These bounds affect only local current/next lookup, not provider refresh windows or persisted EPG semantics.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 constructs Live TV feature ports"
npm run typecheck
git add player/src/providers/create-browser-provider-runtime.ts player/src/app/live-tv-feature-ports.ts player/test-ts/m5-app-composition.test.ts
git commit -m "feat(app): expose favorites and compose live tv feature ports"
```

---

### Task 3: Add the M4 application-entry seam without implicit playback

**Files:**
- Modify: `player/src/live-tv/live-tv-controller.ts`
- Create: `player/test-ts/m5-live-tv-entry.test.ts`

**Interfaces:**
- Produces public `LiveTvController.openScope`, `openChannel`, and `playChannel` methods.
- Reuses the controller's existing reducer/render/refresh/playback request path.

- [ ] **Step 1: Write RED tests for scope/focus/play separation**

Create a controller with a fake `ChannelIntentPort` that records requests. Enter a synthetic provider snapshot containing at least two channels.

```ts
test('M5 Live TV application entry separates scope/focus from explicit playback', async () => {
  const requests: unknown[] = [];
  const controller = makeController({
    requestChannel: async (request) => { requests.push(request); return 'playing'; },
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
  assert.deepEqual(requests[0], {
    providerId: 'p1',
    channelId: 'c2',
    previousChannelId: null,
  });
});
```

Add a foreign/missing channel assertion: `openChannel` and `playChannel` must be no-ops when the channel is not in the active snapshot.

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Live TV application entry"
npm run typecheck
```

Expected: FAIL because the public methods do not exist.

- [ ] **Step 3: Implement `openScope` and a shared focus helper**

Use the existing `reduceLiveTv(... SET_SCOPE ...)` path. Do not call `requestPlayback`.

```ts
openScope(scope: Extract<LiveTvScope, { kind: 'all' | 'favorites' }>): void {
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
```

Extract the no-play channel-focus logic already used by search activation into a private helper such as `focusChannelInAllScope(channelId)` and make both search activation and `openChannel()` use it.

- [ ] **Step 4: Implement explicit `playChannel` through the existing playback path**

```ts
openChannel(channelId: ChannelId): void {
  this.focusChannelInAllScope(channelId);
}

async playChannel(channelId: ChannelId): Promise<void> {
  if (!this.hasActiveProviderChannel(channelId)) return;
  this.focusChannelInAllScope(channelId);
  await this.requestPlayback(channelId);
}
```

Do not duplicate the resolver/session logic from `requestPlayback`.

- [ ] **Step 5: Lock existing Search no-play behavior**

Extend the test to activate a search result after the helper refactor and assert the intent request count is unchanged. This prevents the shared helper from accidentally turning search selection into playback.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 Live TV application entry"
npm run test:ts -w player -- --test-name-pattern="M4"
npm run typecheck
git add player/src/live-tv/live-tv-controller.ts player/test-ts/m5-live-tv-entry.test.ts
git commit -m "feat(live-tv): add application entry controls"
```

---

### Task 4: Materialize the provider-management presenter as a bounded DOM surface

**Files:**
- Create: `player/src/app/provider-management-surface.ts`
- Create: `player/src/ui/provider-management.css`
- Create: `player/test-ts/m5-provider-management-surface.test.ts`

**Interfaces:**
- Consumes: `ProviderManagementPresenter` public `state/load/moveFocus/activateFocused` methods.
- Produces: `ProviderManagementSurface`, `ProviderManagementSurfaceCallbacks`, remote action handling for `up/down/select/back`.

- [ ] **Step 1: Write RED rendering/focus/Back tests**

Use the same lightweight fake-DOM pattern already present in HOME-UI/FIRST-UI tests. Require:

- provider labels are rendered with `textContent`;
- presenter `focusedId` drives DOM focus;
- delete confirmation is rendered from presenter state;
- Back while confirmation is open cancels one confirmation layer through public presenter behavior;
- the application-owned `app-settings` action opens legacy playback/application Settings;
- Back with no confirmation calls application `onBack`.

```ts
test('M5 provider-management surface preserves presenter ownership and one-layer Back', async () => {
  const events: string[] = [];
  const presenter = makePresenter(events);
  const surface = new ProviderManagementSurface(document, presenter, {
    onBack: () => events.push('back'),
    onOpenLegacySettings: () => events.push('legacy-settings'),
  });

  await surface.show();
  surface.handleAction('down');
  surface.handleAction('select');
  assert.ok(events.includes('switch') || events.includes('add'));
  assert.equal(events.includes('back'), false);
});
```

Write separate explicit assertions for confirmation Back; do not rely on the loose example assertion above as the final test.

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 provider-management surface"
npm run typecheck
```

Expected: FAIL because the surface module does not exist.

- [ ] **Step 3: Implement safe DOM projection**

The surface owns a root `#provider-management-page`. Render presenter state with DOM APIs only; never use provider URLs or credentials because `ProviderManagementState` does not contain them.

Append one application-owned button with fixed ID `app-settings` after the presenter normal focus order when no delete confirmation is open.

- [ ] **Step 4: Implement remote navigation without duplicating presenter rules**

Rules:

```text
confirmation open:
  up/down -> presenter.moveFocus(previous/next)
  select  -> await presenter.activateFocused(); rerender
  back    -> move focus to cancel-delete if necessary, activate it, rerender
normal state:
  up/down within presenter focus order -> presenter.moveFocus(previous/next)
  down from presenter final `add-provider` -> focus `app-settings`
  up from `app-settings` -> return to presenter final focus item
  select on presenter item -> await presenter.activateFocused(); rerender
  select on `app-settings` -> callbacks.onOpenLegacySettings()
  back -> callbacks.onBack()
```

Do not create a second delete-confirmation state machine.

- [ ] **Step 5: Add TV-distance/reduced-motion CSS assertions**

Lock stylesheet use of existing BabuşTV tokens, visible `:focus` treatment, and `prefers-reduced-motion`. Do not introduce global selectors that restyle Home/Live TV/legacy Settings.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5 provider-management surface"
npm run typecheck
git add player/src/app/provider-management-surface.ts player/src/ui/provider-management.css player/test-ts/m5-provider-management-surface.test.ts
git commit -m "feat(app): render provider management surface"
```

---

### Task 5: Implement the application orchestrator and route invariants

**Files:**
- Create: `player/src/app/app-composition.ts`
- Create or extend: `player/test-ts/m5-app-composition.test.ts`

**Interfaces:**
- Consumes the Home data source, Provider Core switch/delete operations, provider reads, onboarding adapters, view factories, Live TV factory, legacy Settings/player bridge, and real application exit callback.
- Produces: `AppRoute`, `AppRemoteAction`, `AppCompositionDependencies`, `AppComposition`, `createAppComposition`.

- [ ] **Step 1: Write RED boot-routing tests**

Require zero providers -> first run and configured providers -> Home.

```ts
test('M5 boots first run for zero providers and Home for configured providers', async () => {
  const firstRun = makeHarness({ providers: [] });
  await firstRun.app.boot();
  assert.deepEqual(firstRun.app.route(), { kind: 'first-run' });

  const configured = makeHarness({ providers: [provider('p1')] });
  await configured.app.boot();
  assert.deepEqual(configured.app.route(), { kind: 'home' });
  assert.equal(configured.events.includes('play'), false);
});
```

- [ ] **Step 2: Define the exact route and dependency contracts**

Use this route union from the approved spec:

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

Expose one public remote entry:

```ts
export type AppRemoteAction =
  | 'up' | 'down' | 'left' | 'right' | 'select' | 'back'
  | 'channelUp' | 'channelDown' | 'playpause' | 'play' | 'pause'
  | 'stop' | 'reload' | 'red' | 'green' | 'yellow' | 'blue'
  | 'digit' | 'number';

handleRemote(action: AppRemoteAction, value?: number): void | Promise<void>;
```

Keep concrete DOM views behind injected factories/ports so the orchestrator test does not require a real browser DOM.

- [ ] **Step 3: Implement Home load/error behavior**

`showHome()` must:

1. hide the previous app-owned surface;
2. set route `home`;
3. show Home loading state;
4. await `homeData.load()`;
5. show `{ kind: 'ready', model }` or the fixed sanitized error `{ kind: 'error', message: 'Ana sayfa yüklenemedi.' }`.

A Home load failure must not switch provider or enter Live TV.

- [ ] **Step 4: Write and implement Home intent routing tests**

Prove all frozen intents independently:

```text
SELECT_PROVIDER           -> core.switchActiveProvider + Home refresh; 0 play
OPEN_LIVE_TV all          -> switch if needed + M3 runtime + openScope(all); 0 play
OPEN_LIVE_TV favorites    -> switch if needed + M3 runtime + openScope(favorites); 0 play
OPEN_LIVE_TV_CHANNEL      -> switch if needed + M3 runtime + openChannel(channel); 0 play
PLAY_CHANNEL              -> switch if needed + M3 runtime + playChannel(channel); exactly 1 explicit play
OPEN_SETTINGS             -> provider-management route; 0 play
```

If the Live TV factory returns `{ mode: 'legacy' }`, call the injected legacy player bridge and let the app route remain `live-tv`; do not fabricate an M3 controller.

- [ ] **Step 5: Implement first-run/add-provider onboarding routing**

Construct view callbacks from the orchestrator:

- Xtream selected -> route `xtream-entry` with the correct `returnTo`;
- M3U selected -> route `m3u-entry` with the correct `returnTo`;
- successful injected `connectXtream`/`connectM3u` -> Home refresh;
- failure propagates to the existing entry view callback so the view preserves its existing sanitized error/input behavior;
- Back from entry -> its recorded return route;
- provider-management `requestAddProvider()` -> first-run chooser semantics with return destination `provider-management`, not a second transaction.

- [ ] **Step 6: Implement application-level Back ownership**

Prove:

- Live TV feature/overlay Back remains handled inside `LiveTvController`;
- Live TV root uses the injected application-scoped Platform adapter callback and returns Home;
- provider-management Back returns Home;
- legacy Settings Back returns provider management;
- Home Back invokes the real application exit callback;
- first-run Back invokes the injected legacy fallback/application behavior defined by the bootstrap bridge; it must not directly create provider state.

- [ ] **Step 7: Implement route-aware remote dispatch**

Translate arrows/Select/Back to the concrete view action names. For M3 Live TV translate:

```ts
const liveTvActions = {
  up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', select: 'SELECT', back: 'BACK',
  channelUp: 'CHANNEL_UP', channelDown: 'CHANNEL_DOWN',
} as const;
```

`digit` becomes `{ type: 'DIGIT', digit: value }`. All other M3 unsupported remote actions are ignored unless already represented by an existing `LogicalAction` contract. Do not synthesize playback for focus movement.

Legacy Live TV and legacy Settings actions delegate to injected legacy bridges rather than duplicating their handlers in TypeScript.

- [ ] **Step 8: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5"
npm run typecheck
git add player/src/app/app-composition.ts player/test-ts/m5-app-composition.test.ts
git commit -m "feat(app): compose home and application navigation"
```

---

### Task 6: Wire the browser bootstrap while preserving legacy behavior

**Files:**
- Modify: `player/src/main.js`
- Modify: `player/src/providers/create-browser-provider-runtime.ts` only if Task 2 did not already finish the exact return shape.
- Import: `player/src/ui/home.css`, `player/src/ui/first-run.css`, `player/src/ui/m3u-entry.css`, `player/src/ui/provider-management.css`, existing Xtream CSS.
- Extend: `player/test-ts/m5-app-composition.test.ts` with source/bootstrap acceptance where practical.

**Interfaces:**
- Binds real `HomeView`, `FirstRunView`, `XtreamEntryView`, `M3uEntryView`, `ProviderManagementSurface`, `XtreamOnboardingService`, `M3uOnboardingService`, provider runtime, Favorites/EPG feature ports, and `createBrowserLiveTvRuntime` to `createAppComposition`.

- [ ] **Step 1: Add a RED bootstrap/source contract test**

Read `src/main.js` as text and assert the M5 entry imports exist and the old M3 startup short-circuit `if (await tryStartM3LiveTv()) { return; }` is no longer the application root path.

Also assert `remote.init(` occurs once in the M5 application bootstrap path. Do not require removal of `remote.destroy`; it remains an allowed cleanup API.

- [ ] **Step 2: Extract legacy bridges before changing startup order**

Keep the current legacy functions and handler semantics intact. Expose local bridge objects in `main.js`:

```js
const legacySettingsBridge = {
  show: showSettingsPage,
  hide: () => settings.hide(),
  handleAction: handleLegacySettingsAction,
};

const legacyPlayerBridge = {
  show: () => startPlayer(),
  handleAction: handleLegacyPlayerAction,
};
```

Refactor the existing monolithic `handleRemoteAction` only enough to preserve its dialog/Whats-New/legacy Settings/player behavior behind these helpers. Do not redesign legacy playback/UI behavior.

- [ ] **Step 3: Construct one shared provider runtime and Home/M4 dependencies**

Use the existing `providerRuntime` already created at module scope. Construct:

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

Do not log repository/provider exceptions or credential-bearing values.

- [ ] **Step 4: Construct modern M3U onboarding beside existing Xtream onboarding**

Instantiate `M3uOnboardingService` with the same `providerRuntime.core/sync`, a provider ID factory with no credential material, and `Date.now`. Adapt its union result to the entry callback:

```js
async function connectM3u(input) {
  const result = await m3uOnboarding.connect(input);
  if (!result.ok) {
    throw new ProviderError('MALFORMED', null, 'Provider connection could not be completed.');
  }
}
```

The M3U view already performs the same local validation before calling this adapter; this branch is a sanitized defensive fallback only.

- [ ] **Step 5: Bind the application-scoped Live TV platform adapter**

For each M3 Live TV entry, pass a Platform object that delegates capabilities/key registration but routes root `exitApp()` back to Home:

```js
function appLiveTvPlatform(onRootBack) {
  return {
    capabilities: () => platform.capabilities(),
    registerOptionalKeys: (keys) => platform.registerOptionalKeys(keys),
    exitApp: onRootBack,
  };
}
```

The real Home-root exit still calls `platform.exitApp()`.

- [ ] **Step 6: Replace the M3 boot short-circuit with app boot**

After `player.initPlayer(videoEl)` succeeds:

1. initialize `remote.init((action, value) => void app.handleRemote(action, value), { numericMode: 'digits' })` once;
2. register required optional Tizen keys once at the application boundary;
3. install one `tizenhwkey` Back listener that calls `app.handleRemote('back')`;
4. call `await app.boot()`;
5. retain existing update/boot-splash behavior only where it does not block the app route or add a second navigation owner.

Do not call `tryStartM3LiveTv()` as an independent early-return path. Either remove that helper or reduce it to a factory used by the app composition.

- [ ] **Step 7: Attach scoped styles through module imports**

Add imports for Home, First Run, M3U entry, provider management, and keep the existing Xtream CSS import. Do not add duplicate `<link>` tags to `index.html`.

- [ ] **Step 8: Run focused regression tests and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M5"
npm run test:ts -w player -- --test-name-pattern="M4"
npm run typecheck
npm run build
git add player/src/main.js player/src/ui/provider-management.css player/src/app player/src/providers/create-browser-provider-runtime.ts player/src/live-tv/live-tv-controller.ts player/test-ts/m5-*.test.ts
git commit -m "feat(app): wire M5 browser composition"
```

Before committing, inspect `git status --short` and ensure no generated build/staging files are included.

---

### Task 7: Exact-head verification and Draft PR evidence

**Files:**
- No production changes expected after verification fixes unless a gate exposes a reproduced bug inside the owned M5 scope.

- [ ] **Step 1: Run the complete canonical gates on the final production head**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

All must exit 0. `npm run tizen` is not a substitute for `npm run tizen:build`.

- [ ] **Step 2: Audit exact production scope**

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Expected files must be confined to the Global Constraints scope. If `player/index.html`, Provider Core, storage schema, pairing, playback/session, or unrelated UI files appear, stop and explain the scope expansion rather than normalizing it.

- [ ] **Step 3: Audit semantic invariants manually**

Confirm from final diff/tests:

```text
Home focus/navigation               -> 0 playback
SELECT_PROVIDER                     -> switch only
OPEN_LIVE_TV all/favorites          -> 0 playback
OPEN_LIVE_TV_CHANNEL                -> 0 playback
PLAY_CHANNEL                        -> explicit playback only
Search activation                   -> 0 playback
M4 feature errors                   -> Live TV usable
Live TV root Back                   -> Home
Home root Back                      -> real app exit
Provider management delete          -> existing Provider Core only; no false user-state-cleanup claim
Provider edit/re-entry              -> not implemented/claimed
Legacy Settings/player              -> still reachable
```

- [ ] **Step 4: Open a Draft PR only**

PR body must include:

- `ROLE=M5-COMP`;
- branch `integration/m5-app-composition`;
- frozen base `860d9efa8efac7c9872bf31f7f592ae12a414889`;
- final production head SHA;
- exact changed-file list;
- RED evidence for each task;
- focused GREEN evidence;
- canonical exact-head gate output/run;
- explicit known M5C gaps: provider re-entry and provider-scoped user-state deletion integration remain outside this PR;
- physical Samsung/Tizen runtime: `NOT VERIFIED` unless actually executed.

Do not mark Ready and do not merge. Controller owns those transitions.
