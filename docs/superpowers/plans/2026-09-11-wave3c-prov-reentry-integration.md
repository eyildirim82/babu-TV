# Wave 3C Provider Re-entry Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate validated same-provider credential re-entry into the merged M5 provider-management flow without changing provider identity, activation, Favorites/watch state, or playback semantics.

**Architecture:** Reuse PR #81 semantics for `ProviderReentryService` and the presenter Edit intent, then route Edit through the existing Xtream/M3U entry surfaces in an explicit edit mode. App composition owns add-vs-edit routing; browser dependencies construct one `ProviderReentryService` from the existing provider runtime and expose it through a narrow port.

**Tech Stack:** TypeScript 5.9, Node test runner with `tsx`, existing Provider Core/runtime, DOM presentation modules, GitHub Actions canonical gates.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-closure-design.md`

## Global Constraints

- Frozen starting base: `92af4f5b9d445ced236a63f581716a55bf87ebeb`.
- Branch: `integration/provider-reentry`.
- Consume PR #81 semantics; do not merge PR #81 directly as the final integration vehicle.
- Preserve exact `providerId` and immutable provider kind.
- Credential-store availability + exact previous credential snapshot happen before candidate adapter/network preflight.
- No stored credential, username, password, server URL, or playlist URL may be prefilled into the entry UI.
- No ProviderRepository delete/add substitute.
- No Favorites/watch writes.
- No activation mutation inside `ProviderReentryService`.
- No implicit playback.
- Draft PR only until controller review.

---

### Task 1: Restore the validated re-entry core and presenter contract on the closure base

**Files:**
- Create: `player/src/providers/provider-reentry-service.ts`
- Create: `player/test-ts/provider-reentry-service.test.ts`
- Modify: `player/src/provider-management/provider-management-presenter.ts`
- Modify: `player/test-ts/provider-management-presenter.test.ts`

**Interfaces:**
- Consumes: existing `CredentialStore`, `ProviderRepository.getProvider`, `ProviderAdapterFactory`, `ProviderSyncService.refresh`.
- Produces:

```ts
export type ProviderReentryInput =
  | { providerId: ProviderId; kind: 'xtream'; serverUrl: string; username: string; password: string }
  | { providerId: ProviderId; kind: 'm3u'; playlistUrl: string };

export interface ProviderReentryDependencies {
  providers: Pick<ProviderRepository, 'getProvider'>;
  credentials: Pick<CredentialStore, 'isAvailable' | 'load' | 'save' | 'remove'>;
  adapters: ProviderAdapterFactory;
  sync: Pick<ProviderSyncService, 'refresh'>;
}

export class ProviderReentryService {
  constructor(deps: ProviderReentryDependencies);
  reenter(input: ProviderReentryInput): Promise<{
    providerId: ProviderId;
    kind: ProviderKind;
    refresh: 'completed' | 'degraded';
  }>;
}
```

Presenter contract becomes:

```ts
export interface ProviderManagementOperations {
  load(): Promise<ProviderManagementSnapshot>;
  switchProvider(providerId: ProviderId): Promise<void>;
  requestEditProvider(providerId: ProviderId, kind: ProviderKind): void | Promise<void>;
  deleteProvider(providerId: ProviderId): Promise<void>;
  requestAddProvider(): void | Promise<void>;
}
```

- [ ] **Step 1: Port the PR #81 tests first**

Copy the verified behavior tests from PR #81 onto this branch before production code. Ensure explicit cases cover:

```ts
// unavailable credential store => zero adapter/network/write/refresh
// credentials.load rejects => zero adapter/network/write/refresh
// order => provider:get -> credential:isAvailable/load -> adapter/profile/channels -> save -> refresh
// kind mismatch => rejected before credential/network/write
// Xtream profile + channel decode required
// M3U validation + non-empty channels required
// failed save restores exact previous credential or removes residue when previous is null
// refresh failure keeps committed candidate and returns degraded
// same-provider concurrent reentry rejects second request
// public errors/results never contain candidate secrets
```

Presenter tests must require focus order:

```ts
provider:${providerId}:switch
provider:${providerId}:edit
provider:${providerId}:delete
```

and selecting Edit must call exactly:

```ts
requestEditProvider(providerId, provider.kind)
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --import tsx --test player/test-ts/provider-reentry-service.test.ts player/test-ts/provider-management-presenter.test.ts
```

Expected: FAIL because `provider-reentry-service.ts` is absent and presenter has no edit contract.

- [ ] **Step 3: Implement the validated service transaction exactly**

Use this ordering inside `ProviderReentryService.run()`:

```ts
const provider = await deps.providers.getProvider(input.providerId);
if (provider === null) throw missingProvider();
if (provider.kind !== input.kind) throw malformedCandidate();
if (!deps.credentials.isAvailable()) throw updateUnavailable();
const previousCredential = await deps.credentials.load(provider.id);
const candidate = await preflight(provider, input); // zero writes
await commitCredentialWithCompensation(provider.id, candidate, previousCredential);
const refresh = await refreshNonDestructively(provider.id);
return { providerId: provider.id, kind: provider.kind, refresh };
```

Keep the same-provider in-flight `Set<ProviderId>` guard and sanitized `ProviderError` mapping from PR #81.

- [ ] **Step 4: Implement presenter Edit identity**

Add `editFocusId` to each projected provider item and preserve order `switch -> edit -> delete`. Edit activation must not call switch/delete/load automatically; it delegates only to `requestEditProvider` and keeps sanitized failure copy:

```ts
'Sağlayıcı düzenleme açılamadı.'
```

- [ ] **Step 5: Run focused tests GREEN**

```bash
node --import tsx --test player/test-ts/provider-reentry-service.test.ts player/test-ts/provider-management-presenter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add player/src/providers/provider-reentry-service.ts \
  player/test-ts/provider-reentry-service.test.ts \
  player/src/provider-management/provider-management-presenter.ts \
  player/test-ts/provider-management-presenter.test.ts
git commit -m "feat(providers): restore validated provider re-entry core"
```

---

### Task 2: Render the Edit action in the M5 provider-management surface

**Files:**
- Modify: `player/src/app/provider-management-surface.ts`
- Modify: `player/test-ts/m5-provider-management-surface.test.ts`

**Interfaces:**
- Consumes: `ProviderManagementProviderItem.editFocusId`.
- Produces: remote-focusable Edit button whose `id` is the presenter's stable edit focus ID.

- [ ] **Step 1: Write RED surface tests**

Require a provider row to render actions in this order:

```text
Kullan/Aktif -> Düzenle -> Sil
```

and assert remote Down navigation can reach the Edit focus ID without triggering any operation before Select.

Example assertion shape:

```ts
assert.equal(document.activeElement?.id, 'provider:p1:edit');
assert.deepEqual(calls, []);
```

- [ ] **Step 2: Run the focused surface test**

```bash
node --import tsx --test player/test-ts/m5-provider-management-surface.test.ts
```

Expected: FAIL because no Edit button is rendered.

- [ ] **Step 3: Render the Edit button**

Inside `renderProviders()` insert between switch and delete:

```ts
appendButton(
  this.document,
  actions,
  provider.editFocusId,
  'Düzenle',
  state.busyAction !== null,
);
```

Do not add credential data to labels, attributes, datasets, or logs.

- [ ] **Step 4: Run the surface test GREEN**

```bash
node --import tsx --test player/test-ts/m5-provider-management-surface.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add player/src/app/provider-management-surface.ts player/test-ts/m5-provider-management-surface.test.ts
git commit -m "feat(provider-ui): expose provider edit action"
```

---

### Task 3: Add explicit add/edit entry routing to application composition

**Files:**
- Modify: `player/src/app/app-composition.ts`
- Modify: `player/test-ts/m5-app-composition.test.ts`

**Interfaces:**
- Consumes: provider-management callback `(providerId, kind)` and existing Xtream/M3U entry submissions.
- Produces a narrow re-entry port:

```ts
export interface AppProviderReentryPort {
  reenter(input:
    | { providerId: ProviderId; kind: 'xtream'; serverUrl: string; username: string; password: string }
    | { providerId: ProviderId; kind: 'm3u'; playlistUrl: string }
  ): Promise<unknown>;
}
```

Extend `AppCompositionDependencies`:

```ts
reentry: AppProviderReentryPort;
```

Extend provider-management callbacks:

```ts
export interface AppProviderManagementCallbacks extends ProviderManagementSurfaceCallbacks {
  onAddProvider(): void;
  onEditProvider(providerId: ProviderId, kind: ProviderKind): void;
}
```

Represent entry routes explicitly:

```ts
type EntryMode =
  | { kind: 'add' }
  | { kind: 'edit'; providerId: ProviderId };

type AppRoute =
  | ...
  | { kind: 'xtream-entry'; returnTo: 'first-run' | 'provider-management'; mode: EntryMode }
  | { kind: 'm3u-entry'; returnTo: 'first-run' | 'provider-management'; mode: EntryMode };
```

- [ ] **Step 1: Write RED composition tests**

Add tests proving:

```text
provider management Edit Xtream -> xtream-entry mode edit(providerId)
provider management Edit M3U -> m3u-entry mode edit(providerId)
entry show receives no stored credential values
Xtream edit submit -> reentry.reenter({same providerId, kind:'xtream', typed fields})
M3U edit submit -> reentry.reenter({same providerId, kind:'m3u', typed playlistUrl})
edit success -> provider-management route + refreshed provider view
edit failure -> remains on entry route; error is handled by existing entry surface contract
add flow still calls onboarding.connectXtream/connectM3u
Edit navigation does not call switchProvider or any playback port
Back from edit returns provider-management without writes
```

Use synthetic secrets only, and assert they never appear in route objects or provider-management state.

- [ ] **Step 2: Run focused composition tests and verify RED**

```bash
node --import tsx --test player/test-ts/m5-app-composition.test.ts
```

Expected: FAIL because provider Edit callback and re-entry port do not exist.

- [ ] **Step 3: Implement mode-aware routes and submission dispatch**

Provider-management construction should include:

```ts
onEditProvider: (providerId, kind) => {
  if (kind === 'xtream') this.showXtream('provider-management', { kind: 'edit', providerId });
  else this.showM3u('provider-management', { kind: 'edit', providerId });
},
```

Xtream submit dispatch:

```ts
const route = this.currentRoute;
if (route.kind === 'xtream-entry' && route.mode.kind === 'edit') {
  await deps.reentry.reenter({ providerId: route.mode.providerId, kind: 'xtream', ...input });
  await this.showProviderManagement();
  return;
}
await deps.onboarding.connectXtream(input);
await this.showHome();
```

M3U follows the same pattern and must preserve the existing add-flow `M3uConnectResult` handling in browser dependencies.

- [ ] **Step 4: Run focused composition tests GREEN**

```bash
node --import tsx --test player/test-ts/m5-app-composition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add player/src/app/app-composition.ts player/test-ts/m5-app-composition.test.ts
git commit -m "feat(app): route provider edits through re-entry"
```

---

### Task 4: Wire ProviderReentryService into browser app dependencies

**Files:**
- Modify: `player/src/app/browser-app-dependencies.ts`
- Modify: `player/test-ts/m5-app-composition.test.ts` or create a focused browser-dependency test only if existing test seams cannot prove construction.

**Interfaces:**
- Consumes: runtime `{ providers, credentials, adapters, sync }`.
- Produces: one `ProviderReentryService` instance injected as `deps.reentry`.

- [ ] **Step 1: Add a RED wiring assertion**

Prove that provider-management `requestEditProvider(providerId, kind)` delegates to the app callback and that edit submission reaches a re-entry service constructed from the same runtime repositories/credential store/adapter factory/sync service.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --import tsx --test player/test-ts/m5-app-composition.test.ts
```

Expected: FAIL because browser dependencies do not provide `reentry` or `requestEditProvider`.

- [ ] **Step 3: Construct and inject the service**

Add:

```ts
const providerReentry = new ProviderReentryService({
  providers: runtime.providers,
  credentials: runtime.credentials,
  adapters: runtime.adapters,
  sync: runtime.sync,
});
```

Presenter operations:

```ts
requestEditProvider: (providerId, kind) => callbacks.onEditProvider(providerId, kind),
```

App dependency:

```ts
reentry: {
  reenter: (input) => providerReentry.reenter(input),
},
```

Do not expose the credential store directly to presenter/surface/view code.

- [ ] **Step 4: Run focused integration tests GREEN**

```bash
node --import tsx --test \
  player/test-ts/provider-reentry-service.test.ts \
  player/test-ts/provider-management-presenter.test.ts \
  player/test-ts/m5-provider-management-surface.test.ts \
  player/test-ts/m5-app-composition.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add player/src/app/browser-app-dependencies.ts player/test-ts/m5-app-composition.test.ts
git commit -m "feat(app): wire provider re-entry service"
```

---

### Task 5: Canonical verification and Draft PR evidence

**Files:**
- No production scope expansion.

- [ ] **Step 1: Run full local gates**

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

Expected production/test files are limited to the re-entry core/presenter, provider-management surface, M5 app/browser composition, and their directly corresponding tests. Any unrelated Live TV, pairing, user-state persistence, storage schema, playback, or provider-delete cleanup file is a blocker.

- [ ] **Step 3: Capture exact-head canonical evidence**

Use the repository's verification-only pattern to check out and assert the immutable production SHA, run the canonical gates, assert the exact changed-file set, then remove/reset the temporary workflow so it is absent from the production diff.

- [ ] **Step 4: Open Draft PR**

PR title:

```text
PROV-REENTRY-I: integrate provider credential re-entry
```

PR body must record frozen base, exact production head, RED/GREEN evidence, exact scope, transaction ordering, no-prefill invariant, activation/playback/Favorites/watch invariants, and physical runtime `NOT VERIFIED`.

- [ ] **Step 5: Stop for controller audit**

Do not mark Ready or merge from the worker lane.
