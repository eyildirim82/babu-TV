# BabuşTV M3 Live TV Core — Implementation Plan Self-Review Corrections

Date: 2026-09-08
Status: Required correction addendum for `2026-09-08-m3-live-tv-core.md`

## Precedence

This file is part of the M3 implementation plan. If this file conflicts with `docs/superpowers/plans/2026-09-08-m3-live-tv-core.md`, **this correction file has higher precedence**. All unchanged tasks, constraints, RED/GREEN checkpoints, PR gates, and acceptance criteria in the main plan remain in force.

The self-review found five concrete planning defects: a JavaScript/TypeScript error-classification seam was underspecified, Task 4 referenced an undefined stale helper, Task 6 omitted files/tests for cache-only Provider Core reads, WidgetData construction used an undefined placeholder, and Task 6 described an option layer that M3 does not actually require. The corrections below remove those ambiguities before implementation starts.

---

## Correction 1 — Task 3 Shaka attempt returns a raw/sentinel failure; TypeScript adapter performs normalization

### Why

`player/src/player.js` is inherited JavaScript. The original plan text implied it would call the TypeScript `classifyShakaFailure()` directly. Do not introduce that cross-language dependency into the legacy orchestrator. Keep normalized error classification in the playback adapter layer.

### Replace the Task 3 `LegacyShakaAttemptResult` contract with

```ts
export interface LegacyShakaAttemptResult {
  ok: boolean;
  failure: unknown | null;
}
```

`failure` is either:

- the raw Shaka/JavaScript error object caught by the inherited player, or
- a small **non-secret sentinel** created by `player.js` when no thrown Shaka error exists, for example `{ m3Code: 'UNSUPPORTED_CODEC' }` or `{ m3Code: 'TIMEOUT' }`.

Never place a URL, channel object, request headers, DRM keys, credentials, or provider payload in a sentinel.

### Extend the pure classifier test/implementation

`player/src/playback/shaka-error-classifier.ts` accepts both raw inherited errors and safe sentinels:

```ts
interface M3FailureSentinel {
  m3Code?: unknown;
}

export function classifyShakaFailure(error: unknown): PlaybackErrorCode {
  const sentinel = error as M3FailureSentinel | null;
  if (
    sentinel?.m3Code === 'AUTH'
    || sentinel?.m3Code === 'NETWORK'
    || sentinel?.m3Code === 'TIMEOUT'
    || sentinel?.m3Code === 'STREAM_NOT_FOUND'
    || sentinel?.m3Code === 'UNSUPPORTED_CODEC'
    || sentinel?.m3Code === 'ENGINE_FAILURE'
  ) {
    return sentinel.m3Code;
  }

  if (error instanceof TypeError) return 'ENGINE_FAILURE';
  const value = error as { code?: unknown; data?: unknown[] } | null;
  if (!value || typeof value.code !== 'number') return 'UNKNOWN';

  if (value.code === 1001) {
    const status = Array.isArray(value.data) ? value.data[1] : null;
    if (status === 401 || status === 403) return 'AUTH';
    if (status === 404) return 'STREAM_NOT_FOUND';
    if (status === 408) return 'TIMEOUT';
    return 'NETWORK';
  }
  if (value.code === 1002) return 'NETWORK';
  if (value.code === 1003) return 'TIMEOUT';
  if (value.code === 4032) return 'UNSUPPORTED_CODEC';
  if ([3014, 3015, 3016, 3018].includes(value.code)) return 'ENGINE_FAILURE';
  return 'UNKNOWN';
}
```

Add RED tests for every sentinel branch as well as the Shaka numeric codes already listed in the main plan.

### `player.js` policy seam

The two policies remain:

```js
const LEGACY_PLAYBACK_POLICY = Object.freeze({
  allowNativeFallback: true,
  allowAutomaticRecovery: true,
  allowAutoAdvance: true,
});

const M3_SHAKA_ATTEMPT_POLICY = Object.freeze({
  allowNativeFallback: false,
  allowAutomaticRecovery: false,
  allowAutoAdvance: false,
});
```

The M3 wrapper returns a result object rather than a normalized TypeScript code:

```js
export async function playShakaAttempt(channel) {
  return loadChannelWithPolicy(channel, M3_SHAKA_ATTEMPT_POLICY);
}
```

For the M3 policy:

- a caught Shaka exception returns `{ ok: false, failure: error }`;
- explicit timeout returns `{ ok: false, failure: { m3Code: 'TIMEOUT' } }`;
- known browser/codec incompatibility without a thrown error returns `{ ok: false, failure: { m3Code: 'UNSUPPORTED_CODEC' } }`;
- generic engine failure returns `{ ok: false, failure: { m3Code: 'ENGINE_FAILURE' } }`;
- **no** hidden reconnect, native fallback, auto-advance, or delayed `loadChannel()` may be scheduled under the M3 policy.

The legacy wrapper continues returning the existing boolean behavior to callers:

```js
export async function loadChannel(channel) {
  const result = await loadChannelWithPolicy(channel, LEGACY_PLAYBACK_POLICY);
  return result.ok;
}
```

### `ShakaAdapter.open()` owns normalization

Update `LegacyPlayerPort` to include:

```ts
playShakaAttempt(channel: unknown): Promise<LegacyShakaAttemptResult>;
```

Then:

```ts
readonly name = 'shaka' as const;

isAvailable(): boolean {
  return true;
}

async open(request: StreamRequest): Promise<PlaybackResult> {
  const result = await this.legacy.playShakaAttempt(requestToLegacyChannel(request));
  if (result.ok) return { ok: true, engine: 'shaka', error: null };
  return {
    ok: false,
    engine: null,
    error: classifyShakaFailure(result.failure),
  };
}
```

`isAvailable()` is intentionally deterministic. Player initialization remains a bootstrap prerequisite; do not invent a new hidden readiness state inside `ShakaAdapter`.

The existing `ShakaAdapter.play()` / `PlaybackServiceFacade.play()` compatibility path continues to call legacy `loadChannel()` so inherited users retain proven behavior until migrated.

---

## Correction 2 — Task 4 stale session return is explicit; there is no `staleFailure()` helper

The original Task 4 pseudocode referenced an undefined `staleFailure()` function. Replace it with an explicit internal return. The `ChannelIntentCoordinator` will ignore the terminal result after seeing that the intent is no longer current.

Use:

```ts
await this.stopActiveEngine();
if (!request.isCurrent()) {
  return { status: 'failed', error: 'UNKNOWN', rollback: 'not-needed' };
}
```

Repeat `request.isCurrent()` checks:

- before every retry;
- after every injected sleep;
- before alternate-engine fallback;
- after target re-resolution;
- before `resolvePrevious()`;
- after previous-channel resolution;
- before rollback engine open;
- before any active-engine/state assignment.

Do not add a separate public `stale` session result merely to solve this internal detail; staleness is an intent-arbitration concern and remains owned by `ChannelIntentCoordinator`.

---

## Correction 3 — Task 6 adds an explicit cache-only Provider Core read before runtime composition

### Task 6 file list additions

Add:

- Modify: `player/src/providers/provider-core-service.ts`
- Modify: `player/test-ts/provider-core-service.test.ts`

### New interface

`ProviderCoreService` gains:

```ts
async loadCached(providerId: ProviderId): Promise<ProviderSnapshot>;
```

### RED test first

Add a test proving cache-only load does not start sync:

```ts
void test('loadCached returns provider catalog without starting refresh', async () => {
  const snapshot = await core.loadCached('provider-a');

  assert.equal(snapshot.provider.id, 'provider-a');
  assert.deepEqual(snapshot.categories, cachedCategories);
  assert.deepEqual(snapshot.channels, cachedChannels);
  assert.equal(syncCalls.length, 0);
});
```

Also cover unknown provider -> the same sanitized NOT_FOUND failure as `loadCacheFirst()`.

### Minimum implementation

Refactor without changing existing `loadCacheFirst()` behavior:

```ts
async loadCached(providerId: ProviderId): Promise<ProviderSnapshot> {
  const provider = await this.providers.getProvider(providerId);
  if (provider === null) throw missingProvider();

  const [categories, channels] = await Promise.all([
    this.catalog.listCategories(providerId),
    this.catalog.listChannels(providerId),
  ]);
  return { provider, categories, channels };
}

async loadCacheFirst(providerId: ProviderId): Promise<CacheFirstLoad> {
  const cached = await this.loadCached(providerId);
  return {
    cached,
    refresh: this.sync.refresh(providerId),
  };
}
```

Run the existing Provider Core suite plus the full Task 6 verification before moving on.

### Correct background refresh composition

Do not call `loadCacheFirst()` a second time from the refresh continuation. Use:

```ts
const load = await core.loadCacheFirst(providerId);
controller.enter(load.cached);

const refresh = load.refresh
  .then(async () => {
    controller.syncCatalog(await core.loadCached(providerId));
  })
  .catch(() => {
    // Cache-first UI stays usable. The controller does not erase cached data.
  });

return { mode: 'm3', controller, refresh };
```

This prevents a recursive second provider refresh and keeps failed refresh cache-preserving.

---

## Correction 4 — Task 6 uses a real credential-store factory; `widgetDataOrNull` is not a placeholder

### Task 6 file list additions

Add:

- Create: `player/src/credentials/create-credential-store.ts`
- Create: `player/test-ts/credential-store-factory.test.ts`

### Contract and production factory

Keep native API discovery inside the credential boundary:

```ts
import type { CredentialStore } from './contracts.js';
import {
  SamsungWidgetDataCredentialStore,
  type WidgetDataLike,
} from './samsung-widgetdata-credential-store.js';

export interface CredentialWindowLike {
  webapis?: {
    widgetdata?: WidgetDataLike;
  };
}

export function createCredentialStore(windowLike: CredentialWindowLike): CredentialStore {
  return new SamsungWidgetDataCredentialStore(windowLike.webapis?.widgetdata ?? null);
}
```

### RED tests

Prove:

1. `webapis.widgetdata` present -> factory produces an available store;
2. missing API -> store is unavailable/fail-closed;
3. no localStorage/IndexedDB fallback is consulted or created by this factory.

Production composition then uses:

```ts
const structuredStore = new IndexedDbStructuredStore(globalThis.indexedDB ?? null);
const providers = new StructuredProviderRepository(structuredStore);
const catalog = new StructuredCatalogRepository(structuredStore);
const credentials = createCredentialStore(window);
const http = new FetchProviderHttpClient(globalThis.fetch.bind(globalThis));
const adapters = new ProviderAdapterFactoryImpl(http);
const sync = new ProviderSyncService(providers, catalog, credentials, adapters);
const core = new ProviderCoreService(providers, catalog, credentials, sync);
const resolver = new ProviderStreamResolver(providers, credentials, adapters);
```

No Tizen/WidgetData lookup is added to `LiveTvController`, DOM view, or playback coordinator.

### Exact behavior when secure credentials are unavailable

The original Task 6 phrase “safe failure/fallback decision” was ambiguous. Lock it as follows:

- **No active Provider Core provider ID:** use `{ mode: 'legacy' }` because the user has not migrated/configured Provider Core yet.
- **Active Provider Core provider exists but WidgetData/credential is unavailable:** stay in **M3 cache-first mode** if cached provider/catalog data exists. Background refresh may fail safely; selecting a channel fails through the secure resolver with a sanitized error. **Do not fall back to the inherited plaintext playlist path solely because secure credentials are unavailable.**
- Never copy legacy `localStorage` playlist configuration into `CredentialStore` automatically.

Update the Task 6 runtime-composition RED tests to assert these exact branches.

---

## Correction 5 — Task 6 Back behavior has no undefined option-layer state

M3 does not require a channel detail/options modal. Remove the original pseudocode using `this.optionLayerOpen`.

For the approved M3 core path use:

```ts
if (action === 'BACK') {
  if (this.current.overlayOpen) {
    this.dispatch({ type: 'CLOSE_OVERLAY' });
    return;
  }
  this.platform.exitApp();
}
```

If an actual M3 `ACTIONS` child layer is introduced during implementation, stop and first add it explicitly to `LiveTvState` plus RED state/Back tests; do not maintain hidden controller-only UI layer state.

Update Task 7 runtime smoke item 9 to:

```text
9. Back: Live TV overlay -> fullscreen; next Back uses platform exit, with no custom exit modal.
```

This preserves the design rule “Back closes the current UI layer” while keeping `LiveTvState` the single source of truth.

---

## Corrected Task 6 commit scope

The Task 6 commit command must include the newly required Provider Core and credential-factory files:

```bash
git add \
  player/src/live-tv \
  player/src/credentials/create-credential-store.ts \
  player/src/providers/provider-core-service.ts \
  player/src/main.js \
  player/index.html \
  player/src/styles.css \
  player/test-ts

git commit -m "feat(m3): integrate deterministic Live TV core"
```

Task 6 full verification remains:

```bash
npm ci
npm test
npm run typecheck
npm run build
git diff --exit-code
```

---

## Final self-review result

With this correction addendum applied, the M3 plan has no known placeholder or cross-task interface blocker. It covers the approved design requirements with bounded PR slices and explicit RED/GREEN/CI/user-approval gates.

Before Task 1 implementation, the executor must read, in order:

1. `AGENTS.md`
2. `docs/REPO_RULES.md`
3. `docs/superpowers/specs/2026-09-08-m3-live-tv-core-design.md`
4. `docs/superpowers/plans/2026-09-08-m3-live-tv-core.md`
5. **this correction file**

No production implementation begins until the user approves the M3 implementation plan.