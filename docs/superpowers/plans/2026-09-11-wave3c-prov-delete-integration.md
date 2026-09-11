# Wave 3C Provider Delete Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make provider deletion clean provider-scoped watch and Favorites state through the real browser runtime, while preserving existing EPG failure isolation and avoiding a broken intermediate production composition.

**Architecture:** Introduce one narrow `ProviderUserStateCleanup` service that calls watch cleanup then Favorites cleanup. Inject it into `ProviderCoreService`; `deleteProvider()` fails closed before destructive work when cleanup support is absent, runs credentials/catalog/EPG first, then strict user-state cleanup, then removes provider metadata as the logical commit. Browser runtime constructs and injects the cleanup service in the same PR.

**Tech Stack:** TypeScript 5.9, structured repositories over IndexedDB abstraction, Node test runner with `tsx`, GitHub Actions canonical gates.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-closure-design.md`

## Global Constraints

- Frozen starting base: `92af4f5b9d445ced236a63f581716a55bf87ebeb`.
- Branch: `integration/provider-delete-user-state`.
- Required deletion order: existence -> cleanup dependency available -> credentials -> catalog -> EPG best-effort -> watch -> Favorites -> provider metadata.
- Watch cleanup must run before Favorites cleanup.
- User-state cleanup failure prevents provider metadata removal.
- EPG failure remains best-effort.
- Partial deletion is non-atomic; do not claim rollback after credentials/catalog removal.
- Retry must remain safe/idempotent.
- No storage schema change.
- No app navigation/provider-management/pairing/playback changes.
- Draft PR only until controller review.

---

### Task 1: Add the provider user-state cleanup service

**Files:**
- Create: `player/src/providers/provider-user-state-cleanup.ts`
- Create: `player/test-ts/provider-user-state-cleanup.test.ts`

**Interfaces:**
- Consumes any two provider-scoped delete ports:

```ts
export interface ProviderScopedStateDeletePort {
  deleteProvider(providerId: ProviderId): Promise<void>;
}
```

- Produces:

```ts
export interface ProviderUserStateCleanupPort {
  deleteProvider(providerId: ProviderId): Promise<void>;
}

export class ProviderUserStateCleanup implements ProviderUserStateCleanupPort {
  constructor(
    private readonly watch: ProviderScopedStateDeletePort,
    private readonly favorites: ProviderScopedStateDeletePort,
  ) {}

  async deleteProvider(providerId: ProviderId): Promise<void> {
    await this.watch.deleteProvider(providerId);
    await this.favorites.deleteProvider(providerId);
  }
}
```

- [ ] **Step 1: Write RED tests for deterministic ordering and failure behavior**

Cover:

```ts
// success order exactly ['watch:p1', 'favorites:p1']
// watch failure => favorites not called
// favorites failure => watch called once, error propagates
// deleting p1 never calls deleteProvider('p2')
```

Use synthetic error objects only; tests must not depend on surfaced raw error text.

- [ ] **Step 2: Run focused test and verify RED**

```bash
node --import tsx --test player/test-ts/provider-user-state-cleanup.test.ts
```

Expected: FAIL because module is absent.

- [ ] **Step 3: Implement the two-step cleanup service**

Do not use `Promise.all`; sequential order is part of the contract.

- [ ] **Step 4: Run focused test GREEN**

```bash
node --import tsx --test player/test-ts/provider-user-state-cleanup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add player/src/providers/provider-user-state-cleanup.ts player/test-ts/provider-user-state-cleanup.test.ts
git commit -m "feat(providers): add provider user-state cleanup"
```

---

### Task 2: Make ProviderCore deletion require and invoke user-state cleanup

**Files:**
- Modify: `player/src/providers/provider-core-service.ts`
- Modify: `player/test-ts/provider-core-service.test.ts`
- Modify: `player/test-ts/provider-epg-runtime.test.ts`

**Interfaces:**
- Consumes `ProviderUserStateCleanupPort`.
- Extend constructor without changing existing registration/load/switch semantics:

```ts
constructor(
  providers: ProviderRepository,
  catalog: CatalogRepository,
  credentials: CredentialStore,
  sync: ProviderSyncPort,
  adapters: ProviderAdapterFactory | null = null,
  epgCleanup: ProviderEpgCleanupPort | null = null,
  userStateCleanup: ProviderUserStateCleanupPort | null = null,
)
```

Add one fixed sanitized error:

```ts
function deletionUnavailable(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider deletion is unavailable.');
}
```

- [ ] **Step 1: Write RED delete tests before implementation**

Require these exact cases:

```text
missing provider -> NOT_FOUND; zero destructive calls
cleanup dependency null -> UNAVAILABLE before credentials/catalog/EPG/provider removal
success order -> credentials, catalog, epg, userState, provider metadata
EPG throws -> userState still runs, provider metadata still removed
userState throws -> provider metadata not removed, sanitized UNAVAILABLE surfaced
retry after partial failure -> allowed to call idempotent removals again and can complete
provider A delete -> provider B records untouched
```

The ordering assertion should record events such as:

```ts
[
  'credentials:p1',
  'catalog:p1',
  'epg:p1',
  'user-state:p1',
  'provider:p1',
]
```

- [ ] **Step 2: Run focused provider-core tests and verify RED**

```bash
node --import tsx --test player/test-ts/provider-core-service.test.ts player/test-ts/provider-epg-runtime.test.ts
```

Expected: new cleanup requirements fail under current implementation.

- [ ] **Step 3: Implement fail-closed dependency check before destructive operations**

Deletion skeleton:

```ts
async deleteProvider(providerId: ProviderId): Promise<void> {
  if (await this.providers.getProvider(providerId) === null) throw missingProvider();
  if (this.userStateCleanup === null) throw deletionUnavailable();

  await this.credentials.remove(providerId);
  await this.catalog.removeProviderCatalog(providerId);

  if (this.epgCleanup !== null) {
    try {
      await this.epgCleanup.deleteProvider(providerId);
    } catch {
      // preserve existing best-effort EPG semantics
    }
  }

  try {
    await this.userStateCleanup.deleteProvider(providerId);
  } catch {
    throw deletionUnavailable();
  }

  await this.providers.removeProvider(providerId);
}
```

Do not add rollback writes.

- [ ] **Step 4: Update existing deletion-oriented tests to supply a cleanup double**

Only tests that call `deleteProvider()` should need the new dependency. Tests that instantiate `ProviderCoreService` for unrelated load/register behavior may continue using `null` because they do not invoke deletion.

Ensure onboarding compensation tests that exercise real deletion semantics use a cleanup double so they model production wiring rather than bypassing the new fail-closed rule.

- [ ] **Step 5: Run focused tests GREEN**

```bash
node --import tsx --test player/test-ts/provider-core-service.test.ts player/test-ts/provider-epg-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add player/src/providers/provider-core-service.ts \
  player/test-ts/provider-core-service.test.ts \
  player/test-ts/provider-epg-runtime.test.ts
git commit -m "feat(providers): clean user state before provider commit deletion"
```

---

### Task 3: Wire real watch and Favorites cleanup into browser provider runtime

**Files:**
- Modify: `player/src/providers/create-browser-provider-runtime.ts`
- Modify: `player/test-ts/provider-epg-runtime.test.ts` or add `player/test-ts/provider-user-state-runtime.test.ts` if isolation is clearer.

**Interfaces:**
- Consumes existing `StructuredWatchStateRepository.deleteProvider()` and `StructuredFavoriteRepository.deleteProvider()` methods.
- Produces a fully wired `ProviderCoreService` with no production path where deletion lacks user-state cleanup.

- [ ] **Step 1: Write RED runtime integration test**

Build the browser provider runtime against the existing test storage seam, seed two providers with:

```text
p1 watch + favorites
p2 watch + favorites
```

Call:

```ts
await runtime.core.deleteProvider('p1');
```

Assert:

```text
p1 provider metadata absent
p1 watch absent
p1 favorites absent
p2 provider metadata remains
p2 watch remains
p2 favorites remain
```

If browser credential capability makes a fully integrated test awkward, inject/replace the existing runtime test seam rather than changing production contracts.

- [ ] **Step 2: Run runtime test and verify RED**

```bash
node --import tsx --test player/test-ts/provider-epg-runtime.test.ts player/test-ts/provider-user-state-cleanup.test.ts
```

Expected: FAIL because browser runtime does not construct/inject cleanup.

- [ ] **Step 3: Construct cleanup in `createBrowserProviderRuntime()`**

Add:

```ts
const userStateCleanup = new ProviderUserStateCleanup(watchState, favorites);
const core = new ProviderCoreService(
  providers,
  catalog,
  credentials,
  sync,
  adapters,
  epg,
  userStateCleanup,
);
```

Return `userStateCleanup` only if tests or later code need the explicit object; otherwise keep it internal to minimize API surface.

- [ ] **Step 4: Run runtime tests GREEN**

```bash
node --import tsx --test \
  player/test-ts/provider-user-state-cleanup.test.ts \
  player/test-ts/provider-core-service.test.ts \
  player/test-ts/provider-epg-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add player/src/providers/create-browser-provider-runtime.ts player/test-ts/provider-epg-runtime.test.ts
git commit -m "feat(providers): wire provider user-state deletion cleanup"
```

---

### Task 4: Regression-check onboarding compensation under fail-closed deletion

**Files:**
- Test only if existing tests need changes:
  - `player/test-ts/xtream-onboarding-service.test.ts`
  - `player/test-ts/m3u-onboarding-service.test.ts`

**Interfaces:**
- Consumes unchanged onboarding calls to `core.deleteProvider(providerId)` for compensation.
- Produces evidence that runtime/core cleanup support does not silently break compensation behavior.

- [ ] **Step 1: Identify existing compensation cases and add explicit assertions**

For both Xtream and M3U failure after registration, assert compensation still invokes provider deletion exactly once and preserves the original onboarding error if cleanup/deletion compensation itself fails.

- [ ] **Step 2: Run onboarding tests**

```bash
node --import tsx --test player/test-ts/xtream-onboarding-service.test.ts player/test-ts/m3u-onboarding-service.test.ts
```

Expected: PASS after doubles are updated to satisfy the new core deletion dependency.

- [ ] **Step 3: Commit only if test files changed**

```bash
git add player/test-ts/xtream-onboarding-service.test.ts player/test-ts/m3u-onboarding-service.test.ts
git commit -m "test(providers): preserve onboarding deletion compensation"
```

---

### Task 5: Canonical verification and Draft PR evidence

**Files:**
- No production scope expansion.

- [ ] **Step 1: Run full gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 92af4f5b9d445ced236a63f581716a55bf87ebeb...HEAD
```

All must exit 0.

- [ ] **Step 2: Assert scope**

Allowed production ownership is limited to:

```text
player/src/providers/provider-core-service.ts
player/src/providers/provider-user-state-cleanup.ts
player/src/providers/create-browser-provider-runtime.ts
```

plus directly corresponding tests required by constructor/deletion/runtime behavior. App composition, provider-management UI, pairing, playback, storage schema, and unrelated repositories are blockers.

- [ ] **Step 3: Capture exact-head canonical evidence**

Use a verification-only workflow/branch that explicitly checks out the immutable production SHA, asserts it, runs canonical gates, asserts exact scope, then removes/resets the temporary workflow so it is absent from production diff.

- [ ] **Step 4: Open Draft PR**

PR title:

```text
PROV-DEL-I: clean provider-scoped user state on deletion
```

Record exact base/head, RED/GREEN evidence, strict watch->Favorites order, partial/non-atomic semantics, EPG best-effort distinction, provider isolation, retry behavior, and physical runtime `NOT VERIFIED`.

- [ ] **Step 5: Stop for controller audit**

Do not mark Ready or merge from the worker lane.
