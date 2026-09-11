# Provider Re-entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe edit-in-place provider credential re-entry plus an additive provider-management edit intent while preserving provider identity, user state, activation state, and secret boundaries.

**Architecture:** `ProviderReentryService` performs a write-free adapter preflight against the existing provider identity, commits only the candidate credential after full preflight success, compensates a failed credential save best-effort, and then delegates derived-cache refresh to the existing `ProviderSyncService`. The provider-management presenter gains only a stable edit focus/action callback; M5 routing and edit UI are not implemented here.

**Tech Stack:** TypeScript, Node `node:test`, existing Provider Core/adapter/repository contracts, npm verification scripts.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-provider-reentry-design.md`

## Global Constraints

- ROLE is `PROV-REENTRY`.
- Frozen production base is exactly `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- Production branch is `feature/provider-reentry` and must start from that exact SHA.
- Final production diff is exactly four files:
  - `player/src/providers/provider-reentry-service.ts`
  - `player/src/provider-management/provider-management-presenter.ts`
  - `player/test-ts/provider-reentry-service.test.ts`
  - `player/test-ts/provider-management-presenter.test.ts`
- Never use delete+add.
- Preserve `providerId` exactly and keep provider kind immutable.
- Reject Xtream ↔ M3U conversion before network/write.
- Preflight performs zero credential/catalog/provider writes.
- Favorites/watch and activation state remain untouched.
- No playback/navigation dependency.
- Credential commit happens only after full preflight success.
- Failed credential save performs best-effort exact previous-credential restoration, or candidate cleanup when no previous credential exists.
- Compensation failure is reported only as sanitized `UNAVAILABLE`; never claim rollback succeeded.
- Post-commit refresh failure never rolls the credential back and must not destructively clear an existing usable cache.
- Same-provider concurrent submissions are bounded by a service-level in-flight guard.
- No credential/server/playlist URL/raw exception in result, presenter state, DOM, or logs.
- Draft PR only; worker does not Ready or merge.

---

### Task 1: Define RED provider re-entry transaction tests

**Files:**
- Create: `player/test-ts/provider-reentry-service.test.ts`
- Read only: existing provider/credential/catalog/user-state contracts and test doubles

**Interfaces:**
- Consumes existing `ProviderRepository.getProvider`, `CredentialStore`, `ProviderAdapterFactory`, `ProviderSyncService.refresh` shapes.
- Defines the expected public interface:

```ts
new ProviderReentryService({ providers, credentials, adapters, sync })
service.reenter(providerId, input)
```

- [ ] **Step 1: Create test helpers that can observe every forbidden side effect**

Use deterministic fakes with event recording. The provider port must expose `getProvider()` plus spy methods that fail if implementation tries to save/remove/switch directly. Credential fake must support seeded previous credentials and configurable save/restore/remove failures. Adapter fake records `profile` and `channels` network stages. Sync fake records refresh and can return success/degraded reports or throw.

Representative shapes:

```ts
const events: string[] = [];

const providers = {
  async getProvider(id: string) {
    events.push(`provider:get:${id}`);
    return providerById.get(id) ?? null;
  },
  async saveProvider() {
    events.push('FORBIDDEN:provider:save');
    throw new Error('provider save must not be called directly');
  },
  async removeProvider() {
    events.push('FORBIDDEN:provider:remove');
    throw new Error('provider remove must never be called');
  },
  async setActiveProviderId() {
    events.push('FORBIDDEN:provider:activate');
    throw new Error('activation must not change');
  },
};
```

The credential fake must clone/retain the exact previous value so tests can assert exact restoration rather than reconstructed equivalence.

- [ ] **Step 2: Add RED identity, kind, and zero-write preflight cases**

Add tests for:

```text
success preserves exact providerId
no provider removal/delete/add behavior
xtream provider + m3u input rejects before adapter network/save
m3u provider + xtream input rejects before adapter network/save
xtream profile failure -> zero credential/provider/catalog writes
xtream channel failure -> zero writes
m3u invalid URL -> zero adapter network/write
m3u zero channels -> zero credential write
```

Use obvious secret markers such as:

```ts
const secretUrl = 'https://secret.example/playlist.m3u?token=TOP_SECRET';
const secretPassword = 'TOP_SECRET_PASSWORD';
```

Every rejected error serialization/string must omit those markers.

- [ ] **Step 3: Add RED commit/compensation cases**

Cover exact sequencing and compensation:

```text
xtream success: provider read -> profile -> channels -> credential load -> candidate save -> refresh
m3u success: validation -> channels -> credential load -> candidate save -> refresh
candidate save throws with previous credential -> save(previous exact credential)
candidate save throws with no previous credential -> remove(providerId)
compensation throws -> public code UNAVAILABLE + fixed safe message
```

Do not assert raw dependency exception messages.

- [ ] **Step 4: Add RED post-commit degradation, activation, user-state, and concurrency cases**

Use `MemoryStructuredStore`, `StructuredFavoriteRepository`, and `StructuredWatchStateRepository` in the preservation test. Seed provider-scoped favorite + last-watched + aggregate records before calling re-entry and assert exact records remain afterward.

Also cover:

```text
refresh report has failed stage -> result.refresh === 'degraded'
refresh throws -> result.refresh === 'degraded'
new credential remains committed after refresh degradation
seeded old catalog remains when the injected refresh fails without writes
active provider ID before/after is identical
second concurrent reenter(provider-a, ...) rejects UNAVAILABLE before second network/write
```

Hold the first adapter preflight on a deferred promise so the second call is genuinely concurrent.

- [ ] **Step 5: Run the focused test and verify RED**

Run from `player/`:

```bash
npm test -- --test-name-pattern="provider re-entry|reentry|re-entry"
```

If the repository test script does not forward `--test-name-pattern`, run the compiled-test command used by `package.json` against the new test file. The expected failure is that `../src/providers/provider-reentry-service.js` does not exist yet.

- [ ] **Step 6: Commit the RED test**

```bash
git add player/test-ts/provider-reentry-service.test.ts
git commit -m "test(providers): define provider re-entry transaction"
```

---

### Task 2: Implement the minimal provider re-entry service

**Files:**
- Create: `player/src/providers/provider-reentry-service.ts`
- Test: `player/test-ts/provider-reentry-service.test.ts`

**Interfaces:**
- Consumes:
  - `Pick<ProviderRepository, 'getProvider'>`
  - `CredentialStore`
  - `ProviderAdapterFactory`
  - `Pick<ProviderSyncService, 'refresh'>`
  - `validateM3uEntry`
- Produces the exact contracts in the spec: `ProviderReentryInput`, `ProviderReentryRefreshState`, `ProviderReentryResult`, `ProviderReentryDependencies`, `ProviderReentryService.reenter()`.

- [ ] **Step 1: Add safe error constructors and input/result types**

Implement fixed-message errors; never interpolate candidate values or caught error messages.

```ts
function missingProvider(): ProviderError {
  return new ProviderError('NOT_FOUND', null, 'Provider configuration was not found.');
}

function invalidConfiguration(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Provider configuration is invalid.');
}

function validationFailure(code: ProviderErrorCode): ProviderError {
  return new ProviderError(code, null, 'Provider validation failed.');
}

function credentialUpdateUnavailable(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider credentials could not be updated.');
}

function updateAlreadyInProgress(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider update is already in progress.');
}
```

- [ ] **Step 2: Add the provider-scoped in-flight guard and identity/kind gate**

```ts
private readonly inFlight = new Set<ProviderId>();
```

At `reenter()` entry, reject duplicate same-provider calls, add the ID, and always delete it in `finally`.

Read only `providers.getProvider(providerId)`. Reject missing provider and kind mismatch before adapter network/write.

- [ ] **Step 3: Add write-free credential normalization and adapter preflight**

Xtream:

```ts
const credential: XtreamCredential = {
  kind: 'xtream',
  serverUrl: input.serverUrl.trim(),
  username: input.username.trim(),
  password: input.password.trim(),
};
```

Reject blank values. Create the adapter, require matching adapter identity/kind, then:

```ts
const profile = await adapter.getProfile();
if (profile.providerId !== provider.id || profile.kind !== provider.kind) throw invalidConfiguration();
await adapter.listChannels();
```

M3U:

```ts
const validation = validateM3uEntry({ playlistUrl: input.playlistUrl });
if (!validation.ok) throw invalidConfiguration();
const credential = validation.credential;
const adapter = deps.adapters.create(provider, credential);
const channels = await adapter.listChannels();
if (channels.length === 0) throw invalidConfiguration();
```

Wrap adapter/network/decode exceptions so only a known `ProviderError.code` survives; use `UNAVAILABLE` for unknown errors.

- [ ] **Step 4: Add the credential commit point and compensation**

After preflight only:

```ts
let previous: ProviderCredential | null;
try {
  previous = await deps.credentials.load(providerId);
} catch {
  throw credentialUpdateUnavailable();
}

try {
  await deps.credentials.save(providerId, candidate);
} catch {
  try {
    if (previous === null) {
      await deps.credentials.remove(providerId);
    } else {
      await deps.credentials.save(providerId, previous);
    }
  } catch {
    // Best-effort compensation only. Public failure remains sanitized.
  }
  throw credentialUpdateUnavailable();
}
```

Do not call any provider/catalog deletion operation.

- [ ] **Step 5: Add post-commit refresh classification without rollback**

```ts
let refresh: ProviderReentryRefreshState = 'degraded';
try {
  const report = await deps.sync.refresh(providerId);
  refresh = report.profile === 'success'
    && report.categories.status === 'success'
    && report.channels.status === 'success'
    ? 'refreshed'
    : 'degraded';
} catch {
  refresh = 'degraded';
}

return { providerId, kind: provider.kind, refresh };
```

There is intentionally no old-credential restoration in this block.

- [ ] **Step 6: Run focused provider re-entry tests to GREEN**

Run the focused new test file using the repository-supported test invocation, then run:

```bash
npm test
npm run typecheck
```

Expected: all tests and typecheck PASS.

- [ ] **Step 7: Commit the service implementation**

```bash
git add player/src/providers/provider-reentry-service.ts player/test-ts/provider-reentry-service.test.ts
git commit -m "feat(providers): add safe provider re-entry transaction"
```

---

### Task 3: Add RED presenter edit-intent/focus tests

**Files:**
- Modify: `player/test-ts/provider-management-presenter.test.ts`
- Read only: `player/src/provider-management/provider-management-presenter.ts`

**Interfaces:**
- Existing presenter behavior remains switch/add/delete.
- New injected operation is exact:

```ts
requestEditProvider(providerId: ProviderId, kind: ProviderKind): void | Promise<void>;
```

- New stable row focus slot is exact `provider:${providerId}:edit`.

- [ ] **Step 1: Extend the presenter operation fixture with edit events**

Add:

```ts
requestEditProvider(providerId: string, kind: 'xtream' | 'm3u') {
  events.push(`edit:${providerId}:${kind}`);
  if (options.editError) throw options.editError;
}
```

Add optional `editError` to fixture options.

- [ ] **Step 2: Add RED focus-order and focus-purity assertions**

After load, assert exact order:

```ts
[
  'provider:provider-a:switch',
  'provider:provider-a:edit',
  'provider:provider-a:delete',
  'provider:provider-b:switch',
  'provider:provider-b:edit',
  'provider:provider-b:delete',
  'add-provider',
]
```

Move focus onto `provider:provider-a:edit` and assert the event list is still only `['load']`.

- [ ] **Step 3: Add RED edit activation/purity/error tests**

On edit activation assert:

```ts
['load', 'edit:provider-a:xtream']
```

and explicitly assert no event begins with `switch:` or `delete:`.

For an edit callback that throws `new Error('https://secret.example/edit?token=TOP_SECRET')`, assert:

```text
focusedId remains provider:provider-a:edit
state.errorMessage is fixed/sanitized
serialized state omits secret.example and TOP_SECRET
activateFocused resolves without exposing the raw callback exception
```

- [ ] **Step 4: Adjust existing navigation tests for the new additive focus slot**

Update only the number of `moveFocus('next')` calls/expected focus IDs needed to reach the same switch/delete targets. Do not weaken existing switch/delete/delete-confirmation assertions.

- [ ] **Step 5: Run presenter test and verify RED**

Run the repository-supported focused invocation for `provider-management-presenter.test.ts`.

Expected: failures because `editFocusId` / `requestEditProvider` handling do not exist yet.

- [ ] **Step 6: Commit presenter RED tests**

```bash
git add player/test-ts/provider-management-presenter.test.ts
git commit -m "test(provider-management): define edit presentation intent"
```

---

### Task 4: Implement additive presenter edit behavior

**Files:**
- Modify: `player/src/provider-management/provider-management-presenter.ts`
- Test: `player/test-ts/provider-management-presenter.test.ts`

**Interfaces:**
- Produces `requestEditProvider(providerId, kind)` delegation only.
- Presenter remains credential-store/repository/playback/navigation agnostic.

- [ ] **Step 1: Extend presenter operation/item contracts**

Add to `ProviderManagementOperations`:

```ts
requestEditProvider(providerId: ProviderId, kind: ProviderKind): void | Promise<void>;
```

Add to each item:

```ts
editFocusId: string;
```

Add helper:

```ts
function editFocusId(providerId: ProviderId): string {
  return `provider:${providerId}:edit`;
}
```

- [ ] **Step 2: Build exact switch → edit → delete focus order**

During `load()` project each item with switch/edit/delete IDs and construct:

```ts
const focusOrder = providers.flatMap((provider) => [
  provider.switchFocusId,
  provider.editFocusId,
  provider.deleteFocusId,
]);
```

Keep existing active-provider/default focus preference on the switch action.

- [ ] **Step 3: Add edit activation before delete activation**

In `activateFocused()`, after switch detection and before delete detection:

```ts
const editTarget = this.view.providers.find(
  (provider) => provider.editFocusId === this.view.focusedId,
);
if (editTarget !== undefined) {
  try {
    await this.operations.requestEditProvider(editTarget.id, editTarget.kind);
  } catch {
    this.view = {
      ...this.view,
      focusedId: editTarget.editFocusId,
      errorMessage: 'Sağlayıcı düzenleme açılamadı.',
    };
  }
  return;
}
```

Do not switch/delete/reload as part of edit activation.

- [ ] **Step 4: Run focused presenter tests to GREEN**

Run the presenter test file, then:

```bash
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit presenter implementation**

```bash
git add player/src/provider-management/provider-management-presenter.ts player/test-ts/provider-management-presenter.test.ts
git commit -m "feat(provider-management): add provider edit intent"
```

---

### Task 5: Exact-scope verification and Draft PR

**Files:**
- No new production/test files.
- Verify exact four-file diff only.

**Interfaces:**
- Final output is a Draft PR for Controller audit.

- [ ] **Step 1: Run focused invariant tests once more**

Run the new re-entry test file and presenter test file. Confirm duplicate-submit, compensation, post-commit degradation, activation, Favorites/watch, focus order, and secret-free assertions are all GREEN.

- [ ] **Step 2: Run the canonical gates on the exact final production head**

From `player/` where npm scripts are defined:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
```

Then from repository root:

```bash
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

All commands must pass on the same final production head.

- [ ] **Step 3: Assert exact final changed-file scope**

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Expected exactly:

```text
player/src/provider-management/provider-management-presenter.ts
player/src/providers/provider-reentry-service.ts
player/test-ts/provider-management-presenter.test.ts
player/test-ts/provider-reentry-service.test.ts
```

No docs or verification workflow file may remain in the production diff.

- [ ] **Step 4: Perform a secret/log/delete audit**

Inspect the final diff and confirm:

```text
no console/log calls
no ProviderCoreService.deleteProvider use
no ProviderRepository.removeProvider use
no CatalogRepository remove/replace dependency inside ProviderReentryService
no Favorites/watch mutation dependency
no setActiveProviderId/switchActiveProvider
no playback/navigation import
no result/state field containing credential/server/playlist URL
```

- [ ] **Step 5: Open Draft PR only**

Use title:

```text
PROV-REENTRY: safe existing-provider credential re-entry
```

Body must include ROLE, frozen base, exact head, exact four files, RED/GREEN evidence, canonical gate evidence, invariant/security audit, and `Physical runtime: NOT VERIFIED`.

Do not mark Ready and do not merge.
