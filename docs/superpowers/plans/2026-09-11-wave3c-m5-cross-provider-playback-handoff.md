# BabuşTV V1 Wave 3C M5 Cross-Provider Playback Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace M5's provider-change runtime recreation with one reusable browser Live TV runtime so provider navigation never changes playback ownership and cross-provider explicit playback flows through the existing single WATCH-I/session/coordinator handoff path.

**Architecture:** Keep one `createBrowserLiveTvRuntime()` result alive for the application lifetime. Add an M3-only `enterProvider(providerId)` lifecycle seam that reloads provider-scoped catalog/presentation state on the existing controller without touching the playback session. `AppComposition` starts the browser runtime at most once, reuses it for same-provider re-entry, and calls `enterProvider()` only when browsing another provider; explicit playback then naturally uses the same `ChannelIntentCoordinator -> WatchObservingPlayerSession -> PlayerSessionCoordinator` chain.

**Tech Stack:** TypeScript 5.9, JavaScript ES modules, Vite 6, Node `node:test`/`tsx`, existing Provider Core, M3/M4 Live TV, WATCH-I, Shaka/AVPlay adapter seams.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-m5-cross-provider-playback-handoff-design.md`

## Global Constraints

- ROLE `M5-COMP`; production branch `integration/m5-app-composition`.
- Frozen exact base `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- This plan amends and narrows `docs/superpowers/plans/2026-09-11-wave3c-m5-app-composition-final.md`; all unaffected tasks/results from that plan stay in force.
- Provider selection, route entry, scope entry, highlight/focus, Search navigation, EPG presentation and Favorites actions perform zero playback stop and zero new playback.
- A cross-provider ownership handoff occurs only after an explicit playback request has successfully resolved its target stream and enters the existing shared session handoff.
- There is exactly one application-wide browser Live TV playback/session owner: one Shaka adapter, one AVPlay adapter, one `PlayerSessionCoordinator`, one `PlaybackWatchObserver`, one `WatchObservingPlayerSession`, one `ChannelIntentCoordinator`.
- Do not change `PlayerSessionCoordinator`, `ChannelIntentCoordinator` ordering/last-intent semantics, Shaka/AVPlay playback algorithms, WATCH-I observer semantics, WATCH-S, storage schema/version, Provider Core transaction semantics, pairing, provider re-entry/edit, or provider-delete user-state cleanup.
- Stream-resolution failure before handoff must leave the previous provider playback/watch session untouched.
- Once the frozen shared session begins handoff, retry/fallback/rollback remains owned by existing playback/session code; M5 adds no parallel rollback policy.
- No credential, provider URL, resolved stream URL, native playback error or watch payload may be newly logged/rendered.
- `PROV-REENTRY` and `PROV-DEL-I` remain independent acceptance blockers.
- Physical Samsung/Tizen runtime remains `NOT VERIFIED` unless actually run.

### Amended exact M5 file ownership

The final M5 PR may contain only these fifteen files relative to the frozen base:

```text
player/src/app/app-composition.ts
player/src/app/browser-app-dependencies.ts
player/src/app/home-data-source.ts
player/src/app/live-tv-feature-ports.ts
player/src/app/provider-management-surface.ts
player/src/providers/create-browser-provider-runtime.ts
player/src/live-tv/create-live-tv-runtime.ts
player/src/live-tv/live-tv-controller.ts
player/src/main.js
player/src/ui/provider-management.css
player/test-ts/m5-home-data-source.test.ts
player/test-ts/m5-live-tv-entry.test.ts
player/test-ts/m5-provider-management-surface.test.ts
player/test-ts/m5-app-composition.test.ts
player/test/m3-live-tv-wiring.test.js
```

No verification workflow file may remain in the production diff.

---

### Task 1: Add a reusable provider-entry seam to the single browser Live TV runtime

**Files:**
- Modify: `player/src/live-tv/create-live-tv-runtime.ts`
- Test: `player/test-ts/m5-live-tv-entry.test.ts`

**Interfaces:**
- Consumes: existing `ProviderRepository.getProvider(providerId)`, `CredentialStore.isAvailable()/load(providerId)`, `ProviderCoreService.loadCacheFirst(providerId)/loadCached(providerId)`, `LiveTvController.enter(snapshot)` and `syncCatalog(snapshot)`.
- Produces on M3 runtime result:

```ts
export type LiveTvRuntimeStart =
  | {
      mode: 'm3';
      controller: LiveTvController;
      refresh: Promise<void>;
      enterProvider(providerId: ProviderId): Promise<void>;
    }
  | { mode: 'legacy' };
```

`enterProvider()` is presentation/catalog lifecycle only. It must not create adapters/session/intent/controller again and must not call `session.stop()` or any playback method.

- [ ] **Step 1: Write the failing provider-entry lifecycle test**

Extend `player/test-ts/m5-live-tv-entry.test.ts` with a focused runtime seam acceptance using injected fake runtime dependencies. The test must prove two provider snapshots can be entered on the same controller identity and that entering B emits no playback request.

Use this behavior contract:

```ts
const events: string[] = [];
const entered: string[] = [];

const controller = {
  enter(snapshot: { provider: { id: string } }) {
    entered.push(snapshot.provider.id);
  },
  syncCatalog(snapshot: { provider: { id: string } }) {
    events.push(`sync:${snapshot.provider.id}`);
  },
};

// The runtime starts on p1, then re-enters p2 using the same controller.
assert.equal(runtime.mode, 'm3');
if (runtime.mode !== 'm3') assert.fail('expected reusable M3 runtime');
const controllerIdentity = runtime.controller;
await runtime.enterProvider('p2');
assert.equal(runtime.controller, controllerIdentity);
assert.deepEqual(entered, ['p1', 'p2']);
assert.equal(events.some((event) => event.startsWith('play:')), false);
assert.equal(events.some((event) => event.startsWith('stop:')), false);
```

If constructing the full browser runtime would make this test depend on DOM/legacy engine details, extract only a file-local helper in `create-live-tv-runtime.ts` that accepts the existing provider/credential/core/controller ports and is exercised from this M5 test. Do not add another production file.

- [ ] **Step 2: Run the focused test and record RED**

```bash
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
```

Expected RED: the M3 runtime result has no `enterProvider` lifecycle capability, or the new provider-entry helper is missing.

Commit the test-only RED head before implementation:

```bash
git add player/test-ts/m5-live-tv-entry.test.ts
git commit -m "test(m5): require reusable live tv provider entry"
```

Record the exact RED SHA and CI run in PR #78 body after the run completes.

- [ ] **Step 3: Refactor provider-context loading without changing startup fallback semantics**

In `player/src/live-tv/create-live-tv-runtime.ts`, introduce one internal function with this exact responsibility:

```ts
async function enterProviderContext(input: {
  providerId: ProviderId;
  providers: Pick<ProviderRepository, 'getProvider'>;
  credentials: LiveTvRuntimeCredentialPort;
  core: LiveTvRuntimeCorePort;
  controller: LiveTvController;
}): Promise<Promise<void>> {
  if (await input.providers.getProvider(input.providerId) === null) {
    throw new Error('LIVE_TV_PROVIDER_UNAVAILABLE');
  }
  if (!input.credentials.isAvailable()) {
    throw new Error('LIVE_TV_CREDENTIAL_UNAVAILABLE');
  }
  if (await input.credentials.load(input.providerId) === null) {
    throw new Error('LIVE_TV_CREDENTIAL_UNAVAILABLE');
  }

  const cacheFirst = await input.core.loadCacheFirst(input.providerId);
  input.controller.enter(cacheFirst.cached);

  return cacheFirst.refresh.then(async () => {
    const refreshed = await input.core.loadCached(input.providerId);
    input.controller.syncCatalog(refreshed);
  }).catch(() => {
    // Cache-first Live TV remains usable when background refresh fails.
  });
}
```

The thrown strings are fixed internal sentinels only; never interpolate provider IDs, URLs or raw errors.

The existing generic `createLiveTvRuntime()` startup path must retain its legacy fallback contract. Do not broaden its dependency surface if unnecessary. The browser wrapper may augment a successful M3 result using the already-constructed `providers`, `credentials`, `core` and `controller` instances.

- [ ] **Step 4: Attach `enterProvider(providerId)` to the browser M3 result without constructing a second session**

After the browser runtime has created exactly one resolver/adapters/watch/session/intent/controller stack and initial M3 startup succeeds, return the same controller plus:

```ts
if (initial.mode === 'legacy') return initial;

return {
  ...initial,
  async enterProvider(providerId: ProviderId): Promise<void> {
    void await enterProviderContext({
      providerId,
      providers,
      credentials,
      core,
      controller: initial.controller,
    });
  },
};
```

If `enterProviderContext()` returns the background refresh promise separately, launch it with `void refresh`; `enterProvider()` must resolve once cached B state is entered rather than waiting for network refresh. Preserve the existing stale-provider guard inside `LiveTvController.syncCatalog()`.

Do not instantiate `ShakaAdapter`, `AvplayAdapter`, `PlayerSessionCoordinator`, `PlaybackWatchObserver`, `WatchObservingPlayerSession` or `ChannelIntentCoordinator` inside `enterProvider()`.

- [ ] **Step 5: Add a failure-before-playback regression**

In `m5-live-tv-entry.test.ts`, make `loadCacheFirst('p2')` reject and assert:

```ts
await assert.rejects(() => runtime.enterProvider('p2'));
assert.equal(runtime.controller, controllerIdentity);
assert.equal(playRequests, 0);
assert.equal(stopRequests, 0);
```

This locks the rule that provider-entry failure itself cannot disturb current physical playback ownership.

- [ ] **Step 6: Run focused GREEN and regression suites**

```bash
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
node --import tsx --test player/test-ts/watch-playback-events.test.ts
node --import tsx --test player/test-ts/watch-playback-recovery.test.ts
npm run typecheck
```

Expected: all PASS; no frozen WATCH-I/playback file changed.

- [ ] **Step 7: Commit the minimal runtime lifecycle implementation**

```bash
git add player/src/live-tv/create-live-tv-runtime.ts player/test-ts/m5-live-tv-entry.test.ts
git commit -m "feat(m5): reuse live tv runtime across providers"
```

---

### Task 2: Reuse the runtime from application composition and keep provider navigation non-disruptive

**Files:**
- Modify: `player/src/app/app-composition.ts`
- Modify: `player/src/app/browser-app-dependencies.ts`
- Test: `player/test-ts/m5-app-composition.test.ts`

**Interfaces:**
- Consumes from Task 1: M3 runtime `{ mode:'m3', controller, enterProvider(providerId) }`.
- Produces application dependency contract:

```ts
export type AppLiveTvStart =
  | {
      mode: 'm3';
      controller: AppLiveTvControllerPort;
      enterProvider(providerId: ProviderId): Promise<void>;
    }
  | { mode: 'legacy' };
```

`AppComposition` owns one stored M3 runtime result for its lifetime. Same-provider re-entry does not call `start()` again. Different-provider browsing calls `enterProvider()` on that same result before opening/focusing the new provider UI.

- [ ] **Step 1: Write the cross-provider application RED matrix**

Extend `makeDeps()` in `m5-app-composition.test.ts` so the fake M3 runtime includes:

```ts
let starts = 0;
const runtimeController = {
  openScope(scope: { kind: 'all' | 'favorites' }) { events.push(`scope:${scope.kind}`); },
  openChannel(channelId: string) { events.push(`focus:${channelId}`); },
  async playChannel(channelId: string) { events.push(`play:${channelId}`); },
  async handleInput() {},
};

deps.liveTv.start = async (onRootBack) => {
  starts += 1;
  rootBack = onRootBack;
  return {
    mode: 'm3' as const,
    controller: runtimeController,
    async enterProvider(providerId) {
      events.push(`enter:${providerId}`);
    },
  };
};
```

Add one test that executes exactly this sequence:

```ts
await app.boot();
await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p1', scope: 'all' });
assert.equal(starts, 1);

rootBack();
events.length = 0;
await app.handleHomeIntent({ type: 'SELECT_PROVIDER', providerId: 'p2' });
assert.equal(starts, 1);
assert.equal(events.some((event) => event.startsWith('play:')), false);
assert.equal(events.some((event) => event.startsWith('stop:')), false);

events.length = 0;
await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p2', scope: 'all' });
assert.equal(starts, 1);
assert.deepEqual(events.filter((event) => event === 'enter:p2'), ['enter:p2']);
assert.deepEqual(events.filter((event) => event === 'scope:all'), ['scope:all']);
assert.equal(events.some((event) => event.startsWith('play:')), false);

events.length = 0;
await app.handleHomeIntent({ type: 'OPEN_LIVE_TV_CHANNEL', providerId: 'p2', channelId: 'b1' });
assert.equal(events.filter((event) => event === 'enter:p2').length, 0);
assert.deepEqual(events.filter((event) => event === 'focus:b1'), ['focus:b1']);
assert.equal(events.some((event) => event.startsWith('play:')), false);

events.length = 0;
await app.handleHomeIntent({ type: 'PLAY_CHANNEL', providerId: 'p2', channelId: 'b1' });
assert.deepEqual(events.filter((event) => event === 'play:b1'), ['play:b1']);
assert.equal(starts, 1);
```

Add the mirror assertion that returning to p1 browsing calls `enter:p1` but emits no play until explicit p1 `PLAY_CHANNEL`.

- [ ] **Step 2: Run the focused app test and record RED**

```bash
node --import tsx --test player/test-ts/m5-app-composition.test.ts
```

Expected RED: current `openLiveTv()` calls `deps.liveTv.start()` again when `liveTvProviderId !== providerId`.

Commit the test-only RED:

```bash
git add player/test-ts/m5-app-composition.test.ts
git commit -m "test(m5): require single live tv runtime across providers"
```

Record exact RED SHA/run in PR #78 body.

- [ ] **Step 3: Extend the application runtime port**

Change `AppLiveTvStart` exactly as shown above and store the successful M3 runtime, not merely provider-local controller state:

```ts
private liveTvRuntime: Extract<AppLiveTvStart, { mode: 'm3' }> | null = null;
private liveTvMode: 'm3' | 'legacy' | null = null;
private liveTvProviderId: ProviderId | null = null;
```

`liveTvController` may remain as a convenience alias only if it cannot diverge from `liveTvRuntime.controller`; otherwise remove the duplicate field and read the controller from `liveTvRuntime`.

- [ ] **Step 4: Make `openLiveTv()` start once and re-enter providers on the same runtime**

Preserve `ensureProvider(providerId)` before provider-context load. Then use this order:

```ts
await this.ensureProvider(providerId);

let runtime = this.liveTvRuntime;
if (runtime === null) {
  const started = await this.deps.liveTv.start(() => {
    void this.showHome();
  });
  this.liveTvMode = started.mode;
  if (started.mode === 'legacy') {
    // Existing legacy fallback path remains unchanged.
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
    // Stay on the current route; provider navigation failure must not disturb playback.
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

Important ordering: on an already-created M3 runtime, `enterProvider(providerId)` must succeed before Home is hidden and before route changes to Live TV. A provider-entry failure therefore leaves current Home presentation and physical playback untouched.

Do not clear `liveTvRuntime` in `showHome()` or on normal M4 root Back.

- [ ] **Step 5: Return the reusable seam from browser app dependency construction**

In `browser-app-dependencies.ts`, keep the existing scoped `routePlatform` and one call to `createBrowserLiveTvRuntime()`. For M3 return:

```ts
return result.mode === 'm3'
  ? {
      mode: 'm3',
      controller: result.controller,
      enterProvider: (providerId) => result.enterProvider(providerId),
    }
  : { mode: 'legacy' };
```

No new provider runtime, playback adapter or session should be constructed by this wrapper after initial `start()`.

- [ ] **Step 6: Lock provider-entry failure isolation at application level**

Add a test where `enterProvider('p2')` rejects:

```ts
await app.handleHomeIntent({ type: 'OPEN_LIVE_TV', providerId: 'p2', scope: 'all' });
assert.deepEqual(app.route(), { kind: 'home' });
assert.equal(starts, 1);
assert.equal(events.some((event) => event.startsWith('play:')), false);
assert.equal(events.some((event) => event.startsWith('stop:')), false);
```

Do not route to legacy player for this failure. Legacy fallback remains startup capability fallback, not a cross-provider error recovery mechanism.

- [ ] **Step 7: Run focused GREEN**

```bash
node --import tsx --test player/test-ts/m5-app-composition.test.ts
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
npm run typecheck
```

Expected: PASS; `live:start` count stays exactly one across p1 -> p2 -> p1 M3 browsing.

- [ ] **Step 8: Commit application reuse**

```bash
git add player/src/app/app-composition.ts player/src/app/browser-app-dependencies.ts player/test-ts/m5-app-composition.test.ts
git commit -m "fix(m5): keep one playback owner across providers"
```

---

### Task 3: Prove the shared frozen handoff attributes watch state across providers correctly

**Files:**
- Test: `player/test-ts/m5-live-tv-entry.test.ts`

**Interfaces:**
- Consumes unchanged frozen classes: `StructuredWatchStateRepository`, `MemoryStructuredStore`, `WatchStateService`, `PlaybackWatchObserver`, `WatchObservingPlayerSession`, and existing `SessionSwitchRequest` callbacks.
- Produces regression evidence only; no WATCH-I/playback production file changes.

- [ ] **Step 1: Add a cross-provider watch handoff regression using one observing session**

At the bottom of `m5-live-tv-entry.test.ts`, add local test helpers rather than changing production WATCH-I:

```ts
class M5Clock {
  constructor(public value: number) {}
  now(): number { return this.value; }
  advance(ms: number): void { this.value += ms; }
}

class M5PlannedSession implements PlayerSessionPort {
  constructor(
    private readonly plan: (request: SessionSwitchRequest) => Promise<SessionSwitchResult>,
  ) {}
  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult> {
    return this.plan(request);
  }
  stop(): void {}
}

function m5Request(input: {
  intentId: number;
  providerId: string;
  targetChannelId: string;
  previousChannelId: string | null;
}): SessionSwitchRequest {
  return {
    intentId: input.intentId,
    providerId: input.providerId,
    targetChannelId: input.targetChannelId,
    previousChannelId: input.previousChannelId,
    initialRequest: { url: `https://stream.example.test/${input.targetChannelId}` },
    reResolveTarget: async () => ({ url: `https://stream.example.test/${input.targetChannelId}` }),
    resolvePrevious: null,
    isCurrent: () => true,
    onRecovering: () => {},
  };
}
```

Use one observer/session instance for both providers:

```ts
const clock = new M5Clock(1_000);
const repository = new StructuredWatchStateRepository(new MemoryStructuredStore());
const service = new WatchStateService(repository, { minimumSessionMs: 30_000 });
const observer = new PlaybackWatchObserver(service, clock);
const inner = new M5PlannedSession(async (request) => {
  request.onHandoffStarted?.();
  request.onHandoffStarted?.();
  return { status: 'playing', engine: 'shaka' };
});
const shared = new WatchObservingPlayerSession(inner, observer);

await shared.switchTo(m5Request({
  intentId: 1,
  providerId: 'p1',
  targetChannelId: 'shared',
  previousChannelId: null,
}));
clock.advance(40_000);
await shared.switchTo(m5Request({
  intentId: 2,
  providerId: 'p2',
  targetChannelId: 'shared',
  previousChannelId: null,
}));
clock.advance(35_000);
await shared.stop();
await observer.flush();
```

Assert exactly provider-scoped attribution:

```ts
assert.deepEqual(await service.getAggregate('p1', 'shared'), {
  providerId: 'p1',
  channelId: 'shared',
  meaningfulWatchMs: 40_000,
  meaningfulOpenCount: 1,
  lastMeaningfulWatchAtMs: 41_000,
});
assert.deepEqual(await service.getAggregate('p2', 'shared'), {
  providerId: 'p2',
  channelId: 'shared',
  meaningfulWatchMs: 35_000,
  meaningfulOpenCount: 1,
  lastMeaningfulWatchAtMs: 76_000,
});
```

Calling `onHandoffStarted` twice intentionally proves the existing WATCH-I guard finalizes A once.

- [ ] **Step 2: Add resolution-before-handoff evidence at the coordinator boundary**

Use a `ChannelIntentCoordinator` with a resolver that rejects p2 before `session.switchTo()` and a session fake that counts handoff calls. Start from a synthetic already-playing A observation, invoke p2 request, and assert:

```ts
assert.equal(await coordinator.requestChannel({
  providerId: 'p2',
  channelId: 'missing',
  previousChannelId: null,
}), 'failed');
assert.equal(sessionSwitchCalls, 0);
assert.equal(await service.getAggregate('p1', 'shared'), null);
```

Then advance the clock and explicitly stop the shared A observation to prove its duration remained active through the failed p2 resolve.

The resolver error must be a fixed `ProviderError` using synthetic `.invalid` data only.

- [ ] **Step 3: Run the focused evidence plus frozen WATCH suites**

```bash
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
node --import tsx --test player/test-ts/watch-playback-events.test.ts
node --import tsx --test player/test-ts/watch-playback-recovery.test.ts
```

Expected: PASS with no production changes in WATCH-I/playback modules.

- [ ] **Step 4: Commit test-only shared-handoff evidence**

```bash
git add player/test-ts/m5-live-tv-entry.test.ts
git commit -m "test(m5): cover cross-provider watch handoff"
```

---

### Task 4: Re-run M5 integration characterization and exact amended scope audit

**Files:**
- Existing authorized test-only characterization: `player/test/m3-live-tv-wiring.test.js`
- No new production files.

**Interfaces:** none; verification only.

- [ ] **Step 1: Run M3/M4/M5 focused regression set**

```bash
node --test player/test/m3-live-tv-wiring.test.js
node --import tsx --test player/test-ts/m5-home-data-source.test.ts
node --import tsx --test player/test-ts/m5-live-tv-entry.test.ts
node --import tsx --test player/test-ts/m5-provider-management-surface.test.ts
node --import tsx --test player/test-ts/m5-app-composition.test.ts
node --import tsx --test player/test-ts/m4-live-tv-composition.test.ts
node --import tsx --test player/test-ts/m4-live-tv-favorites-scope.test.ts
```

Expected: all PASS. The legacy M3 characterization must describe the approved M5 application-root boot; do not restore the historical `if (await tryStartM3LiveTv()) return` source-string expectation.

- [ ] **Step 2: Run normal full gates before canonical evidence**

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Expected: all PASS.

- [ ] **Step 3: Assert the exact fifteen-file production diff**

Run:

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD | sort
```

Expected exact sorted set:

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

Any additional path is a blocker. Do not silently widen scope.

- [ ] **Step 4: Review forbidden-file diff**

Explicitly prove no changes under these ownership areas:

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD -- \
  player/src/playback \
  player/src/watch \
  player/src/storage \
  player/src/pairing
```

Expected: no output.

- [ ] **Step 5: Update PR #78 evidence before canonical run**

PR body must record:

- approved cross-provider decision A;
- written spec path;
- written implementation-plan path;
- amended fifteen-file scope;
- test-only RED SHA/run for reusable `enterProvider` seam;
- test-only RED SHA/run for cross-provider app runtime reuse;
- current GREEN production head/run;
- physical Samsung/Tizen runtime remains `NOT VERIFIED`.

Do not remove the independent `PROV-REENTRY` and `PROV-DEL-I` acceptance blockers.

---

### Task 5: Canonical exact-production-head verification

**Files:** verification-only workflow may be created temporarily on a separate verification branch; it must not remain in PR #78.

- [ ] **Step 1: Freeze final production SHA**

```bash
PRODUCTION_SHA=$(git rev-parse HEAD)
echo "$PRODUCTION_SHA"
```

Do not make production changes after this point without invalidating all canonical evidence.

- [ ] **Step 2: Run canonical gates on that exact detached SHA**

The verification job must explicitly checkout/assert `$PRODUCTION_SHA`, then run:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Also assert the exact fifteen-file changed set from Task 4.

- [ ] **Step 3: Remove verification-only workflow from every production diff**

If a temporary workflow was committed to a verification branch, delete it after evidence capture. PR #78 changed files must remain exactly the fifteen authorized paths.

- [ ] **Step 4: Final controller handoff record**

Update Draft PR #78 with:

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

A canonical SUCCESS closes the M5 implementation/evidence blocker only. It does not close `PROV-REENTRY`, `PROV-DEL-I`, or physical runtime verification.

## Self-Review Checklist

Before execution handoff, verify:

- Spec coverage: Sections 3–13 of the cross-provider design each map to Tasks 1–5.
- No placeholder language exists; all behavior-affecting steps give exact signatures, sequencing and assertions.
- `enterProvider(providerId)` exists only on successful M3 runtime results and never owns playback.
- `AppComposition` starts the M3 runtime once and uses the same controller/session across p1 -> p2 -> p1.
- Provider-entry failure stays non-disruptive and does not trigger legacy fallback.
- Stream-resolution-before-handoff semantics are proven without changing `ChannelIntentCoordinator`.
- Cross-provider watch attribution is proven using existing frozen WATCH-I classes only.
- Final file set is exactly fifteen paths and includes the three approved amendment paths: `browser-app-dependencies.ts`, `create-live-tv-runtime.ts`, `m3-live-tv-wiring.test.js`.
- No production WATCH-I/playback/storage/pairing file enters the diff.
