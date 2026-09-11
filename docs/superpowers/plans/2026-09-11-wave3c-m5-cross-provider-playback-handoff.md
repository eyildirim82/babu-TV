# BabuşTV V1 Wave 3C M5 Cross-Provider Playback Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace M5's provider-change runtime recreation with one reusable browser Live TV runtime so provider navigation never changes playback ownership and cross-provider explicit playback flows through the existing single WATCH-I/session/coordinator handoff path.

**Architecture:** Keep one `createBrowserLiveTvRuntime()` result alive for the application lifetime. Add a browser-M3-only `enterProvider(providerId)` seam that reloads provider-scoped catalog/presentation state on the existing controller without touching the playback session. `AppComposition` starts the browser runtime at most once, reuses it for same-provider re-entry, and invokes `enterProvider()` only when browsing another provider; explicit playback then continues through the same `ChannelIntentCoordinator -> WatchObservingPlayerSession -> PlayerSessionCoordinator` chain.

**Tech Stack:** TypeScript 5.9, JavaScript ES modules, Vite 6, Node `node:test`/`tsx`, existing Provider Core, M3/M4 Live TV, WATCH-I, Shaka/AVPlay adapter seams.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-m5-cross-provider-playback-handoff-design.md`

## Global Constraints

- ROLE `M5-COMP`; production branch `integration/m5-app-composition`.
- Frozen exact base `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- This plan amends `docs/superpowers/plans/2026-09-11-wave3c-m5-app-composition-final.md`; unaffected tasks/results remain in force.
- Provider selection, route entry, scope entry, focus/highlight, Search navigation, EPG presentation and Favorites actions perform zero playback stop and zero new playback.
- Cross-provider ownership handoff occurs only after an explicit playback request resolves its target stream and enters the existing shared session handoff.
- There is exactly one browser Live TV playback/session owner per application lifetime: one Shaka adapter, one AVPlay adapter, one `PlayerSessionCoordinator`, one `PlaybackWatchObserver`, one `WatchObservingPlayerSession`, one `ChannelIntentCoordinator`.
- Do not change `PlayerSessionCoordinator`, `ChannelIntentCoordinator` ordering/last-intent semantics, Shaka/AVPlay algorithms, WATCH-I observer semantics, WATCH-S, storage schema/version, Provider Core transaction semantics, pairing, provider re-entry/edit, or provider-delete user-state cleanup.
- Stream-resolution failure before handoff leaves the previous provider playback/watch session untouched.
- Once the frozen shared session begins handoff, retry/fallback/rollback stays entirely owned by existing playback/session code.
- Never log/render credentials, provider URLs, resolved stream URLs, native playback errors or watch payloads.
- `PROV-REENTRY` and `PROV-DEL-I` remain independent acceptance blockers.
- Physical Samsung/Tizen runtime remains `NOT VERIFIED` unless actually run.

### Amended exact M5 file ownership

The final M5 PR may contain only these fifteen paths relative to the frozen base:

```text
player/src/app/app-composition.ts
player/src/app/browser-app-dependencies.ts
player/src/app/home-data-source.ts
player/src/app/live-tv-feature-ports.ts
player/src/app/provider-management-surface.ts
player/src/live-tv/create-live-tv-runtime.ts
player/src/live-tv/live-tv-controller.ts
player/src/main.js
player/src/providers/create-browser-provider-runtime.ts
player/src/ui/provider-management.css
player/test-ts/m5-app-composition.test.ts
player/test-ts/m5-home-data-source.test.ts
player/test-ts/m5-live-tv-entry.test.ts
player/test-ts/m5-provider-management-surface.test.ts
player/test/m3-live-tv-wiring.test.js
```

No verification-only workflow may remain in the production diff.

---

### Task 1: Add browser-only reusable provider entry without changing generic M3 startup

**Files:**
- Modify: `player/src/live-tv/create-live-tv-runtime.ts`
- Test: `player/test-ts/m5-live-tv-entry.test.ts`

**Interfaces:**
- Consumes: `ProviderRepository.getProvider(providerId)`, `CredentialStore.isAvailable()/load(providerId)`, `ProviderCoreService.loadCacheFirst(providerId)/loadCached(providerId)`, `LiveTvController.enter(snapshot)` and `syncCatalog(snapshot)`.
- Keeps existing generic `LiveTvRuntimeStart` unchanged.
- Produces a browser-only result type:

```ts
export type BrowserLiveTvRuntimeStart =
  | {
      mode: 'm3';
      controller: LiveTvController;
      refresh: Promise<void>;
      enterProvider(providerId: ProviderId): Promise<void>;
    }
  | { mode: 'legacy' };
```

- Produces a focused factory that can be tested without DOM/native engines:

```ts
export interface LiveTvProviderEntryDependencies {
  providers: Pick<ProviderRepository, 'getProvider'>;
  credentials: LiveTvRuntimeCredentialPort;
  core: LiveTvRuntimeCorePort;
  controller: LiveTvController;
}

export function createLiveTvProviderEntry(
  deps: LiveTvProviderEntryDependencies,
): (providerId: ProviderId) => Promise<void>;
```

- [ ] **Step 1: Write RED for provider entry using the new factory**

In `m5-live-tv-entry.test.ts`, import `createLiveTvProviderEntry` and build synthetic p1/p2 snapshots. Record `controller.enter()` and `syncCatalog()` calls with one controller identity. Assert:

```ts
const enterProvider = createLiveTvProviderEntry({ providers, credentials, core, controller });
await enterProvider('p2');
assert.deepEqual(enteredProviderIds, ['p2']);
assert.equal(playRequests, 0);
assert.equal(stopRequests, 0);
```

The fake `cacheFirst.refresh` resolves, then `loadCached('p2')` returns a refreshed p2 snapshot; after flushing one microtask, assert `sync:p2` occurred. Use only synthetic `.invalid` fixture URLs if a URL is needed.

- [ ] **Step 2: Run focused RED and commit test-only head**

```bash
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
git add player/test-ts/m5-live-tv-entry.test.ts
git commit -m "test(m5): require reusable live tv provider entry"
```

Expected RED: export/factory missing. Record exact RED SHA/run in PR #78.

- [ ] **Step 3: Implement the provider-entry factory**

Use this exact behavior shape:

```ts
export function createLiveTvProviderEntry(
  deps: LiveTvProviderEntryDependencies,
): (providerId: ProviderId) => Promise<void> {
  return async (providerId) => {
    if (await deps.providers.getProvider(providerId) === null) {
      throw new Error('LIVE_TV_PROVIDER_UNAVAILABLE');
    }
    if (!deps.credentials.isAvailable()) {
      throw new Error('LIVE_TV_CREDENTIAL_UNAVAILABLE');
    }
    if (await deps.credentials.load(providerId) === null) {
      throw new Error('LIVE_TV_CREDENTIAL_UNAVAILABLE');
    }

    const cacheFirst = await deps.core.loadCacheFirst(providerId);
    deps.controller.enter(cacheFirst.cached);

    void cacheFirst.refresh.then(async () => {
      const refreshed = await deps.core.loadCached(providerId);
      deps.controller.syncCatalog(refreshed);
    }).catch(() => {
      // Cache-first Live TV remains usable when background refresh fails.
    });
  };
}
```

The fixed sentinel strings contain no provider IDs/raw errors. `enterProvider()` resolves after cached state is entered and does not wait for network refresh.

- [ ] **Step 4: Augment only the browser runtime result**

Change `createBrowserLiveTvRuntime()` return type to `Promise<BrowserLiveTvRuntimeStart>`. After constructing the single resolver/adapters/watch/session/intent/controller stack and obtaining the existing initial M3 result:

```ts
const initial = await createLiveTvRuntime({ providers, credentials, core, controller });
if (initial.mode === 'legacy') return initial;

const enterProvider = createLiveTvProviderEntry({
  providers,
  credentials,
  core,
  controller: initial.controller,
});

return {
  ...initial,
  enterProvider,
};
```

Do not add `enterProvider` to generic `createLiveTvRuntime()` and do not instantiate any adapter/session/observer/coordinator inside `enterProvider()`.

- [ ] **Step 5: Add provider-entry failure isolation**

Make `loadCacheFirst('p2')` reject and assert:

```ts
await assert.rejects(() => enterProvider('p2'));
assert.equal(playRequests, 0);
assert.equal(stopRequests, 0);
assert.deepEqual(enteredProviderIds, []);
```

Also cover missing provider and missing credential with the same no-play/no-stop assertions.

- [ ] **Step 6: Run focused GREEN and frozen watch regressions**

```bash
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
node --import tsx --test player/test-ts/watch-playback-events.test.ts
node --import tsx --test player/test-ts/watch-playback-recovery.test.ts
npm run typecheck
```

Expected: PASS and no frozen playback/WATCH production file changed.

- [ ] **Step 7: Commit minimal runtime lifecycle implementation**

```bash
git add player/src/live-tv/create-live-tv-runtime.ts player/test-ts/m5-live-tv-entry.test.ts
git commit -m "feat(m5): reuse live tv runtime across providers"
```

---

### Task 2: Make AppComposition start M3 once and re-enter provider context

**Files:**
- Modify: `player/src/app/app-composition.ts`
- Modify: `player/src/app/browser-app-dependencies.ts`
- Test: `player/test-ts/m5-app-composition.test.ts`

**Interfaces:**
- Consumes Task 1 browser-M3 result.
- Produces application port:

```ts
export type AppLiveTvStart =
  | {
      mode: 'm3';
      controller: AppLiveTvControllerPort;
      enterProvider(providerId: ProviderId): Promise<void>;
    }
  | { mode: 'legacy' };
```

- [ ] **Step 1: Write cross-provider RED matrix**

Make the fake M3 runtime record `live:start`, `enter:<provider>`, `scope:*`, `focus:*`, `play:*`, and zero synthetic stop events. Execute:

```ts
await app.boot();
await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'all' });
assert.equal(starts, 1);
rootBack();

await app.handleHomeIntent({ type: 'SELECT_PROVIDER', providerId: 'p2' });
assert.equal(starts, 1);
assert.equal(events.some((e) => e.startsWith('play:')), false);

await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p2', scope: 'all' });
assert.equal(starts, 1);
assert.deepEqual(events.filter((e) => e === 'enter:p2'), ['enter:p2']);
assert.equal(events.some((e) => e.startsWith('play:')), false);

await app.handleHomeIntent({ type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'p2', channelId: 'b1' });
assert.equal(events.some((e) => e === 'enter:p2'), false);
assert.ok(events.includes('focus:b1'));

await app.handleHomeIntent({ type: 'PLAY_CHANNEL', providerId: 'p2', channelId: 'b1' });
assert.deepEqual(events.filter((e) => e === 'play:b1'), ['play:b1']);
assert.equal(starts, 1);
```

Then return Home, select/browse p1, assert one `enter:p1`, zero implicit play, and still `starts === 1`.

- [ ] **Step 2: Run RED and commit test-only head**

```bash
node --import tsx --test player/test-ts/m5-app-composition.test.ts
git add player/test-ts/m5-app-composition.test.ts
git commit -m "test(m5): require one live tv runtime across providers"
```

Expected RED: current code calls `deps.liveTv.start()` again when provider ID changes. Record SHA/run in PR #78.

- [ ] **Step 3: Store the successful M3 runtime as the single owner**

Use:

```ts
private liveTvRuntime: Extract<AppLiveTvStart, { mode: 'm3' }> | null = null;
private liveTvMode: 'm3' | 'legacy' | null = null;
private liveTvProviderId: ProviderId | null = null;
```

Remove `liveTvController` if it would duplicate/diverge from `liveTvRuntime.controller`; route input should use the stored runtime controller directly.

- [ ] **Step 4: Refactor `openLiveTv()` ordering**

Required sequence:

```ts
await this.ensureProvider(providerId);

let runtime = this.liveTvRuntime;
if (runtime === null) {
  const started = await this.deps.liveTv.start(() => { void this.showHome(); });
  this.liveTvMode = started.mode;
  if (started.mode === 'legacy') {
    this.liveTvProviderId = providerId;
    this.hideModernViews();
    this.deps.legacy.hideSettings();
    this.deps.legacy.showPlayerShell?.();
    this.currentRoute = { kind: 'live-tv' };
    this.deps.legacy.openPlayer();
    return;
  }
  this.liveTvRuntime = started;
  runtime = started;
  this.liveTvProviderId = providerId;
} else if (this.liveTvProviderId !== providerId) {
  try {
    await runtime.enterProvider(providerId);
  } catch {
    return;
  }
  this.liveTvProviderId = providerId;
}

this.hideModernViews();
this.deps.legacy.hideSettings();
this.deps.legacy.showPlayerShell?.();
this.currentRoute = { kind: 'live-tv' };
await activate(runtime.controller);
```

Critical rule: when a reusable M3 runtime exists, B `enterProvider()` must succeed before hiding Home or changing route. Failure stays on Home and never falls back to legacy player.

Do not clear `liveTvRuntime` in `showHome()` or normal M4 root Back.

- [ ] **Step 5: Pass the browser lifecycle seam through `browser-app-dependencies.ts`**

Keep one `createBrowserLiveTvRuntime()` call per `liveTv.start()` and return:

```ts
return result.mode === 'm3'
  ? {
      mode: 'm3',
      controller: result.controller,
      enterProvider: result.enterProvider,
    }
  : { mode: 'legacy' };
```

`AppComposition` guarantees `liveTv.start()` is called at most once for the successful M3 lifecycle.

- [ ] **Step 6: Add application-level provider-entry failure isolation**

Have fake `enterProvider('p2')` reject and assert:

```ts
await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p2', scope: 'all' });
assert.deepEqual(app.route(), { kind: 'home' });
assert.equal(starts, 1);
assert.equal(events.some((e) => e.startsWith('play:')), false);
assert.equal(events.some((e) => e.startsWith('stop:')), false);
```

- [ ] **Step 7: Run GREEN and commit**

```bash
node --import tsx --test player/test-ts/m5-app-composition.test.ts
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
npm run typecheck
git add player/src/app/app-composition.ts player/src/app/browser-app-dependencies.ts player/test-ts/m5-app-composition.test.ts
git commit -m "fix(m5): keep one playback owner across providers"
```

---

### Task 3: Add fresh cross-provider handoff/watch evidence without changing WATCH-I

**Files:**
- Test only: `player/test-ts/m5-live-tv-entry.test.ts`

**Interfaces:**
- Consumes unchanged `StructuredWatchStateRepository`, `MemoryStructuredStore`, `WatchStateService`, `PlaybackWatchObserver`, `WatchObservingPlayerSession`, `ChannelIntentCoordinator`, `PlayerSessionPort` and `SessionSwitchRequest`.
- Produces regression evidence only.

- [ ] **Step 1: Prove one observing session attributes A then B correctly**

Add local helpers:

```ts
class M5Clock {
  constructor(public value: number) {}
  now(): number { return this.value; }
  advance(ms: number): void { this.value += ms; }
}

class M5PlannedSession implements PlayerSessionPort {
  constructor(private readonly plan: (r: SessionSwitchRequest) => Promise<SessionSwitchResult>) {}
  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult> { return this.plan(request); }
  stop(): void {}
}
```

Construct one repository/service/observer/session. First switch to p1/shared, advance 40s, then switch the same observing session to p2/shared. The inner fake calls `request.onHandoffStarted?.()` twice before returning playing. Advance 35s, call `shared.stop()`, flush observer.

Assert exact aggregates:

```ts
assert.deepEqual(await service.getAggregate('p1', 'shared'), {
  providerId: 'p1', channelId: 'shared', meaningfulWatchMs: 40_000,
  meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: 41_000,
});
assert.deepEqual(await service.getAggregate('p2', 'shared'), {
  providerId: 'p2', channelId: 'shared', meaningfulWatchMs: 35_000,
  meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: 76_000,
});
```

The duplicate handoff callback intentionally proves A finalizes once.

- [ ] **Step 2: Prove p2 resolution failure never reaches shared session handoff**

Create one `ChannelIntentCoordinator` whose resolver throws a fixed `ProviderError('NOT_FOUND', ...)` for p2/missing and whose `PlayerSessionPort.switchTo()` increments `sessionSwitchCalls`. Keep a p1 observer session active before invoking the p2 request.

Assert:

```ts
assert.equal(await coordinator.requestChannel({
  providerId: 'p2',
  channelId: 'missing',
  previousChannelId: null,
}), 'failed');
assert.equal(sessionSwitchCalls, 0);
```

Advance the clock, finalize p1, flush, and assert p1 accumulated the full duration across the failed p2 resolve. This proves resolution failure is pre-handoff and non-disruptive.

- [ ] **Step 3: Run evidence and frozen regressions**

```bash
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
node --import tsx --test player/test-ts/watch-playback-events.test.ts
node --import tsx --test player/test-ts/watch-playback-recovery.test.ts
```

Expected: PASS; no file under `player/src/watch` or `player/src/playback` changed.

- [ ] **Step 4: Commit test-only evidence**

```bash
git add player/test-ts/m5-live-tv-entry.test.ts
git commit -m "test(m5): cover cross-provider watch handoff"
```

---

### Task 4: Full regression and exact amended scope audit

**Files:** verification only; `player/test/m3-live-tv-wiring.test.js` remains the already-modified authorized characterization path.

- [ ] **Step 1: Run focused M3/M4/M5 suites**

```bash
node --test player/test/m3-live-tv-wiring.test.js
node --import tsx --test player/test-ts/m5-home-data-source.test.ts
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
node --import tsx --test player/test-ts/m5-provider-management-surface.test.ts
node --import tsx --test player/test-ts/m5-app-composition.test.ts
node --import tsx --test player/test-ts/m4-live-tv-composition.test.ts
node --import tsx --test player/test-ts/m4-live-tv-favorites-scope.test.ts
```

Do not restore the historical `if (await tryStartM3LiveTv()) return` expectation; M5 application-root boot is intentional.

- [ ] **Step 2: Run normal full gates**

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

- [ ] **Step 3: Assert exact fifteen-file diff**

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD | sort
```

Expected exactly the fifteen paths listed under Global Constraints. Any extra path is a blocker.

- [ ] **Step 4: Prove forbidden production areas are untouched**

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD -- \
  player/src/playback player/src/watch player/src/storage player/src/pairing
```

Expected: no output.

- [ ] **Step 5: Update Draft PR #78 evidence**

Record approved decision A, spec path, plan path, amended 15-file scope, both RED heads/runs, current GREEN head/run, unchanged `PROV-REENTRY`/`PROV-DEL-I` blockers, and physical runtime `NOT VERIFIED`.

---

### Task 5: Canonical exact-production-head verification

**Files:** verification-only workflow may exist temporarily on a separate verification branch; it must never remain in PR #78.

- [ ] **Step 1: Freeze final production SHA**

```bash
PRODUCTION_SHA=$(git rev-parse HEAD)
echo "$PRODUCTION_SHA"
```

Any later production commit invalidates canonical evidence.

- [ ] **Step 2: Run canonical gates on explicit detached production SHA**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

The same job must assert the exact fifteen-file changed set.

- [ ] **Step 3: Remove verification-only workflow from production diff**

Delete any temporary workflow after evidence capture. Re-check PR #78 changed files.

- [ ] **Step 4: Final controller handoff record**

PR #78 must state:

```text
Frozen base: 860d9efa8efac7c9872bf31f7f592ae12a414889
Final production head: <exact SHA>
Canonical run: <run id> SUCCESS
Scope: exact amended 15 files
Cross-provider ownership: one reusable browser Live TV runtime/session owner
Provider switch/navigation: 0 stop / 0 play
Explicit cross-provider play: existing shared handoff path only
Physical Samsung/Tizen runtime: NOT VERIFIED
Status: Draft; Controller review required; do not Ready/merge from worker lane
```

Canonical SUCCESS closes only the M5 implementation/evidence blocker. It does not close `PROV-REENTRY`, `PROV-DEL-I`, or physical runtime verification.

## Self-Review Result

- Spec coverage: design Sections 3–13 map to Tasks 1–5.
- Placeholder scan: no TBD/TODO/deferred implementation instructions remain.
- Type consistency: generic `LiveTvRuntimeStart` stays unchanged; only `BrowserLiveTvRuntimeStart` and `AppLiveTvStart` gain `enterProvider(providerId): Promise<void>` on their M3 variants.
- Provider-entry timing: cached state enters synchronously within the awaited call; background refresh is launched but not awaited.
- Failure isolation: provider-entry and pre-handoff stream-resolution failures cannot stop/finalize current playback.
- Ownership: p1 -> p2 -> p1 uses one controller/session/coordinator; no per-provider physical owner is constructed.
- WATCH/playback algorithms remain frozen; fresh M5 tests exercise their public seams only.
- Exact final file set is fifteen paths, including the three approved amendment paths: `browser-app-dependencies.ts`, `create-live-tv-runtime.ts`, and `m3-live-tv-wiring.test.js`.
