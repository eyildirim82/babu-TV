# Wave 3C Provider Re-entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe existing-provider credential re-entry/edit while preserving provider identity, user state, activation, and usable cache semantics.

**Architecture:** Implement a new `ProviderReentryService` with a write-free candidate preflight, one credential-save commit point with best-effort exact compensation on save failure, and an existing-sync-service refresh that never rolls credentials back. Extend Provider Management presentation only with an injected edit intent and stable `provider:${providerId}:edit` focus slot; do not wire M5 routing in this lane.

**Tech Stack:** TypeScript, Node `node:test`, existing Provider Core/adapter/credential/repository contracts.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-provider-reentry-design.md`

## Global Constraints

- ROLE: `PROV-REENTRY`.
- Frozen production base: `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- Production/test scope is exactly four files:
  - `player/src/providers/provider-reentry-service.ts`
  - `player/src/provider-management/provider-management-presenter.ts`
  - `player/test-ts/provider-reentry-service.test.ts`
  - `player/test-ts/provider-management-presenter.test.ts`
- Never implement delete+add; never call ProviderRepository removal/delete operations.
- Preserve providerId and provider kind exactly.
- Preserve active-provider state, Favorites, and watch state.
- No playback/navigation dependency and no M5 app routing/surface integration.
- Preflight performs zero credential/catalog/provider writes.
- Xtream preflight = profile validation + successful channel-list fetch/decode.
- M3U preflight = existing validation + at least one usable channel.
- Credential save happens only after complete preflight.
- Save failure compensation is best effort and never claims rollback success.
- Post-commit refresh failure does not roll credential back or explicitly clear existing cache.
- Same-provider concurrent submit is bounded by a service-local in-flight guard.
- No credential/server/playlist URL/raw exception in result, presenter/DOM-facing state, or logs.
- Draft PR only; no Ready/merge without Controller audit.

---

### Task 1: Define provider re-entry contract and RED transaction tests

**Files:**
- Create: `player/test-ts/provider-reentry-service.test.ts`
- Create later in Task 2: `player/src/providers/provider-reentry-service.ts`

**Interfaces:**
- Consumes: `ProviderRepository.getProvider`, `CredentialStore.load/save/remove`, `ProviderAdapterFactory`, `ProviderSyncService.refresh`, `validateM3uEntry`, `ProviderError`.
- Produces:

```ts
export type ProviderReentryInput =
  | { providerId: ProviderId; kind: 'xtream'; serverUrl: string; username: string; password: string }
  | { providerId: ProviderId; kind: 'm3u'; playlistUrl: string };

export type ProviderReentryRefreshStatus = 'completed' | 'degraded';

export interface ProviderReentryResult {
  providerId: ProviderId;
  kind: ProviderKind;
  refresh: ProviderReentryRefreshStatus;
}

export interface ProviderReentryDependencies {
  providers: Pick<ProviderRepository, 'getProvider'>;
  credentials: Pick<CredentialStore, 'load' | 'save' | 'remove'>;
  adapters: ProviderAdapterFactory;
  sync: Pick<ProviderSyncService, 'refresh'>;
}

export class ProviderReentryService {
  constructor(deps: ProviderReentryDependencies);
  reenter(input: ProviderReentryInput): Promise<ProviderReentryResult>;
}
```

- [ ] **Step 1: Write the failing test harness and identity/no-delete tests**

Create a harness that records only allowed interactions and deliberately does not expose a provider-removal dependency to the service:

```ts
const provider: ProviderRecord = {
  id: 'provider-a',
  kind: 'xtream',
  name: 'Salon',
  createdAtMs: 10,
  lastSuccessfulSyncAtMs: 20,
};

const events: string[] = [];
const providers = {
  async getProvider(providerId: ProviderId) {
    events.push(`provider:get:${providerId}`);
    return providerId === provider.id ? provider : null;
  },
};
```

Assert a successful re-entry returns the exact same ID/kind and that the harness contains no delete/remove/register/add event.

- [ ] **Step 2: Add RED kind-mismatch and zero-write preflight tests**

Use an M3U input against the Xtream provider and assert:

```ts
await assert.rejects(
  service.reenter({ providerId: 'provider-a', kind: 'm3u', playlistUrl: 'https://secret.invalid/list.m3u' }),
  (error: unknown) => error instanceof ProviderError && error.code === 'MALFORMED',
);
assert.equal(adapterCalls, 0);
assert.equal(credentialWrites, 0);
assert.equal(syncCalls, 0);
```

Add Xtream profile failure, Xtream channel-list failure, invalid M3U URL, and M3U zero-channel cases. Every preflight failure must assert zero credential writes and zero refresh calls.

- [ ] **Step 3: Add RED successful Xtream and M3U preflight ordering tests**

Record strict order. Xtream must include:

```text
provider:get -> adapter:create -> profile -> channels -> credential:load -> credential:save -> sync
```

M3U must include validation/adapter channel decode before credential load/save, and a usable channel list of length >= 1.

- [ ] **Step 4: Add RED save-compensation tests**

Previous credential exists:

```ts
const previous: ProviderCredential = {
  kind: 'xtream',
  serverUrl: 'https://old.invalid',
  username: 'old-user',
  password: 'old-pass',
};
```

Make the candidate `save` mutate fake storage then throw. Assert the next compensation write receives the exact `previous` object/value and final public error is fixed sanitized `UNAVAILABLE`.

No previous credential: make save throw after fake partial persistence, assert one `remove(providerId)` cleanup attempt.

Compensation failure: make restore/remove throw and assert the caller still receives only fixed sanitized `UNAVAILABLE`; test must not assert/receive any `rolled back` success claim.

- [ ] **Step 5: Add RED post-commit refresh tests**

After credential save succeeds, make `sync.refresh` throw a raw secret-bearing exception and assert:

```ts
const result = await service.reenter(input);
assert.deepEqual(result, {
  providerId: 'provider-a',
  kind: 'xtream',
  refresh: 'degraded',
});
assert.deepEqual(storedCredential, normalizedCandidate);
assert.equal(compensationCalls, 0);
assert.equal(JSON.stringify(result).includes('secret'), false);
```

Also make `refresh` return a report with one failed stage and expect `degraded`; all-success report expects `completed`.

- [ ] **Step 6: Add RED activation/Favorites/watch preservation and secret tests**

Keep sentinel `activeProviderId`, favorite keys, and watch keys outside the service dependencies. Assert their values are unchanged after success, preflight failure, commit failure, and degraded refresh. Assert thrown messages/results do not contain candidate URL, username, password, playlist query, or raw exception text.

- [ ] **Step 7: Add RED same-provider concurrent-submit test**

Block the first request inside adapter preflight with a deferred promise. Start a second request for the same ID and assert it rejects immediately with sanitized `UNAVAILABLE` while adapter/save/sync counts remain those of the first request only. Resolve the first request and assert the guard releases by successfully starting a later third request.

- [ ] **Step 8: Run the focused test and verify RED**

Run:

```bash
npm run test:ts -w player -- --test-name-pattern='provider re-entry'
```

If the repository test script does not forward the pattern, run the repository-standard TypeScript test command and confirm failure is specifically because `provider-reentry-service.js` does not exist / behavior is missing.

Expected: FAIL for the new provider re-entry tests before production implementation.

- [ ] **Step 9: Commit RED tests**

```bash
git add player/test-ts/provider-reentry-service.test.ts
git commit -m "test(PROV-REENTRY): define safe credential re-entry transaction"
```

---

### Task 2: Implement minimal ProviderReentryService to GREEN

**Files:**
- Create: `player/src/providers/provider-reentry-service.ts`
- Test: `player/test-ts/provider-reentry-service.test.ts`

**Interfaces:** exactly those defined in Task 1.

- [ ] **Step 1: Add fixed sanitized error constructors and normalization helpers**

Use only fixed messages, for example:

```ts
function malformedCandidate(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Provider credentials are invalid.');
}

function reentryUnavailable(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider credentials could not be updated.');
}

function preflightUnavailable(error: unknown): ProviderError {
  const code = error instanceof ProviderError ? error.code : 'UNAVAILABLE';
  return new ProviderError(code, null, 'Provider credentials could not be validated.');
}
```

Do not log `error`; do not concatenate input or exception text.

- [ ] **Step 2: Implement strict provider/kind lookup before network/write**

```ts
const provider = await this.deps.providers.getProvider(input.providerId);
if (provider === null) throw new ProviderError('NOT_FOUND', null, 'Provider configuration was not found.');
if (provider.kind !== input.kind) throw malformedCandidate();
```

No adapter creation occurs before the kind check.

- [ ] **Step 3: Implement write-free candidate preflight**

Xtream:

```ts
const credential: XtreamCredential = {
  kind: 'xtream',
  serverUrl: input.serverUrl.trim(),
  username: input.username.trim(),
  password: input.password.trim(),
};
if (!credential.serverUrl || !credential.username || !credential.password) throw malformedCandidate();
const adapter = this.deps.adapters.create(provider, credential);
const profile = await adapter.getProfile();
if (profile.providerId !== provider.id || profile.kind !== 'xtream') throw malformedCandidate();
await adapter.listChannels();
```

M3U:

```ts
const validation = validateM3uEntry({ playlistUrl: input.playlistUrl });
if (!validation.ok) throw malformedCandidate();
const credential = validation.credential;
const adapter = this.deps.adapters.create(provider, credential);
const channels = await adapter.listChannels();
if (channels.length === 0) {
  throw new ProviderError('MALFORMED', null, 'Provider playlist contains no usable channels.');
}
```

Wrap adapter/network/parser failures into fixed sanitized errors without swallowing deliberate fixed validation errors.

- [ ] **Step 4: Implement commit preparation and compensation**

Only after preflight:

```ts
let previous: ProviderCredential | null;
try {
  previous = await this.deps.credentials.load(provider.id);
} catch {
  throw reentryUnavailable();
}

try {
  await this.deps.credentials.save(provider.id, candidate);
} catch {
  try {
    if (previous === null) await this.deps.credentials.remove(provider.id);
    else await this.deps.credentials.save(provider.id, previous);
  } catch {
    // Best-effort compensation only. Never expose or claim rollback success.
  }
  throw reentryUnavailable();
}
```

Do not call Provider Core register/delete or provider/catalog removal.

- [ ] **Step 5: Implement non-rollback refresh classification**

```ts
let refresh: ProviderReentryRefreshStatus = 'completed';
try {
  const report = await this.deps.sync.refresh(provider.id);
  if (
    report.profile === 'failed'
    || report.categories.status === 'failed'
    || report.channels.status === 'failed'
  ) {
    refresh = 'degraded';
  }
} catch {
  refresh = 'degraded';
}
return { providerId: provider.id, kind: provider.kind, refresh };
```

Never compensate after successful credential save.

- [ ] **Step 6: Implement per-provider in-flight guard**

```ts
private readonly inFlight = new Set<ProviderId>();

async reenter(input: ProviderReentryInput): Promise<ProviderReentryResult> {
  if (this.inFlight.has(input.providerId)) throw reentryUnavailable();
  this.inFlight.add(input.providerId);
  try {
    return await this.run(input);
  } finally {
    this.inFlight.delete(input.providerId);
  }
}
```

Keep the transaction body in a private method if useful; do not add a global lock.

- [ ] **Step 7: Run focused tests to GREEN**

Run the exact focused command supported by the repository, then:

```bash
npm test
npm run typecheck
```

Expected: provider re-entry tests PASS and no existing regression.

- [ ] **Step 8: Commit service implementation**

```bash
git add player/src/providers/provider-reentry-service.ts player/test-ts/provider-reentry-service.test.ts
git commit -m "feat(PROV-REENTRY): add safe credential re-entry service"
```

---

### Task 3: Add presenter edit intent via RED -> GREEN

**Files:**
- Modify: `player/test-ts/provider-management-presenter.test.ts`
- Modify: `player/src/provider-management/provider-management-presenter.ts`

**Interfaces:**
- Extend `ProviderManagementOperations` with:

```ts
requestEditProvider(providerId: ProviderId, kind: ProviderKind): void | Promise<void>;
```

- Extend `ProviderManagementProviderItem` with `editFocusId: string`.
- Stable key: `provider:${providerId}:edit`.

- [ ] **Step 1: Update test harness with injected edit operation**

```ts
requestEditProvider(providerId: string, kind: 'xtream' | 'm3u') {
  events.push(`edit:${providerId}:${kind}`);
},
```

No credentials or URLs enter the harness/presenter snapshot.

- [ ] **Step 2: Write RED focus-order/focus-stability assertions**

After load, assert:

```ts
assert.deepEqual(presenter.state.focusOrder, [
  'provider:provider-a:switch',
  'provider:provider-a:edit',
  'provider:provider-a:delete',
  'provider:provider-b:switch',
  'provider:provider-b:edit',
  'provider:provider-b:delete',
  'add-provider',
]);
```

Update existing move-counts so legacy switch/delete tests select the same logical targets under the inserted edit slot.

- [ ] **Step 3: Write RED edit activation purity test**

Focus `provider:provider-a:edit`, activate, and assert exactly:

```ts
assert.deepEqual(events, ['load', 'edit:provider-a:xtream']);
assert.equal(presenter.state.activeProviderId, 'provider-a');
assert.equal(presenter.state.confirmation, null);
```

No `switch:*`, `delete:*`, or extra `load` event is allowed.

- [ ] **Step 4: Write RED highlight/no-op and no-prefill test**

Move focus across switch/edit/delete without activation and assert event list remains `['load']`. Serialize state and assert it contains no `serverUrl`, `playlistUrl`, `username`, `password`, or synthetic secret values.

- [ ] **Step 5: Run presenter tests and verify RED**

Run repository TypeScript tests; expected failures are missing edit focus/operation behavior, not unrelated compile errors.

- [ ] **Step 6: Implement minimal presenter changes**

Add:

```ts
function editFocusId(providerId: ProviderId): string {
  return `provider:${providerId}:edit`;
}
```

Projection:

```ts
editFocusId: editFocusId(provider.id),
```

Focus order:

```ts
const focusOrder = providers.flatMap((provider) => [
  provider.switchFocusId,
  provider.editFocusId,
  provider.deleteFocusId,
]);
```

Activation between switch and delete checks:

```ts
const editTarget = this.view.providers.find((provider) => provider.editFocusId === this.view.focusedId);
if (editTarget !== undefined) {
  await this.operations.requestEditProvider(editTarget.id, editTarget.kind);
  return;
}
```

Do not import/read `CredentialStore`; do not add credential fields to presenter state.

- [ ] **Step 7: Run presenter + full tests to GREEN**

```bash
npm test
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit presenter change**

```bash
git add player/src/provider-management/provider-management-presenter.ts player/test-ts/provider-management-presenter.test.ts
git commit -m "feat(PROV-REENTRY): expose provider edit presentation intent"
```

---

### Task 4: Exact-head verification, scope audit, and Draft PR

**Files:**
- Production diff must remain exactly the four globally owned files.
- Any verification-only workflow used to obtain canonical evidence must have no net diff in the final production branch.

- [ ] **Step 1: Run fresh canonical gates on the exact production implementation head**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Record exact production head SHA and run/evidence ID.

- [ ] **Step 2: Audit exact changed-file scope**

The only paths in `860d9efa...HEAD` must be:

```text
player/src/providers/provider-reentry-service.ts
player/src/provider-management/provider-management-presenter.ts
player/test-ts/provider-reentry-service.test.ts
player/test-ts/provider-management-presenter.test.ts
```

Any other production/test path is a blocker; do not silently widen scope.

- [ ] **Step 3: Re-read invariant matrix against final diff**

Explicitly verify identity, kind immutability, no delete+add, zero-write preflight, compensation semantics, no post-commit rollback, non-destructive refresh dependency shape, activation/user-state preservation, duplicate-submit guard, presenter edit purity/focus order, and secret-free messages/state/logging.

- [ ] **Step 4: Open/update Draft PR only**

PR body records:

```text
ROLE=PROV-REENTRY
Frozen base=860d9efa8efac7c9872bf31f7f592ae12a414889
Exact production head=<sha>
RED evidence=<run/log>
Focused GREEN evidence=<run/log>
Canonical gates=<run/log>
Changed files=<exact four>
Physical runtime=NOT VERIFIED
Controller audit required before Ready/merge
```

Do not integrate M5 routing/surface. Do not mark Ready. Do not merge.
