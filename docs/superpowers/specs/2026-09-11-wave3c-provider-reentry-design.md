# BabuşTV V1 Wave 3C Provider Re-entry Design

**Date:** 2026-09-11  
**Status:** APPROVED  
**Role:** `PROV-REENTRY`  
**Repository:** `eyildirim82/babu-TV`  
**Frozen production base:** `860d9efa8efac7c9872bf31f7f592ae12a414889`  
**Production branch:** `feature/provider-reentry`

## 1. Purpose

`PROV-REENTRY` adds a safe edit/re-entry transaction for credentials or playlist configuration of an already configured provider without replacing the provider record.

The transaction must preserve provider-scoped identity and user state while allowing the provider credential to change. It is not an onboarding alias and it is not delete+add.

The approved architecture is:

```text
write-free candidate preflight
        ↓
credential commit point
        ↓
non-destructive derived-cache refresh
```

This lane also adds an edit intent to the existing provider-management presenter so later application composition can open an edit surface without teaching the presenter credential-storage or routing behavior.

M5 application routing/surface integration is explicitly outside this lane.

## 2. Current frozen-base facts

At `860d9efa8efac7c9872bf31f7f592ae12a414889`:

- `ProviderRecord.id` is the stable provider identity and `ProviderRecord.kind` is `xtream | m3u`.
- `CredentialStore` supports provider-scoped `save`, `load`, and `remove`.
- `ProviderCoreService.registerProvider()` is a create-only transaction and rejects an existing provider ID.
- `ProviderCoreService.deleteProvider()` removes credential/catalog/provider data and therefore is not an edit primitive.
- `XtreamOnboardingService` and `M3uOnboardingService` create a new provider ID and compensate failed onboarding by deleting the newly created provider. They are not safe edit-in-place transactions.
- `ProviderSyncService.refresh(providerId)` reads the committed credential, refreshes derived categories/channels stage-by-stage, preserves old channels when channel refresh fails, and only updates `lastSuccessfulSyncAtMs` after channel success.
- `StructuredFavoriteRepository` and `StructuredWatchStateRepository` store user state under stable provider-scoped identity and each has destructive provider-deletion operations that must not be touched by re-entry.
- `ProviderManagementPresenter` currently presents switch/add/delete only and reads no credential store.

These facts make provider identity preservation the primary transaction boundary.

## 3. Considered approaches

### A. Delete old provider then run normal onboarding

Rejected.

This changes provider identity, invokes destructive provider/catalog/credential operations, risks provider-scoped Favorites/watch state, changes activation semantics, and turns edit into a create/delete workflow. It violates the central requirement even if the visible provider name looks unchanged.

### B. Save candidate credential first, then validate and roll back on any later failure

Rejected.

This creates a window where an unvalidated candidate is the durable credential. It also makes network/cache refresh failure trigger credential rollback even though the candidate itself may be valid, and it increases the chance of losing a previously usable configuration if rollback fails.

### C. Write-free candidate preflight, one credential commit point, then non-destructive refresh

Approved.

The candidate is validated using an adapter built from the existing provider record and the candidate credential, without writing provider, catalog, or credential state. Only a completely successful preflight may reach the credential commit. After commit, the existing `ProviderSyncService` owns derived-cache refresh semantics. Refresh degradation does not roll the credential back.

This keeps the transaction narrow and preserves the existing provider identity and user-state partitions.

## 4. Production ownership

The production diff against the frozen base is exactly these four files:

```text
player/src/providers/provider-reentry-service.ts
player/src/provider-management/provider-management-presenter.ts
player/test-ts/provider-reentry-service.test.ts
player/test-ts/provider-management-presenter.test.ts
```

No other production/test file is owned by this lane.

If implementation requires a change outside these files, stop and report the integration requirement instead of widening scope.

## 5. Provider re-entry public contract

Create `player/src/providers/provider-reentry-service.ts` with focused input/result contracts.

```ts
export type ProviderReentryInput =
  | {
      kind: 'xtream';
      serverUrl: string;
      username: string;
      password: string;
    }
  | {
      kind: 'm3u';
      playlistUrl: string;
    };

export type ProviderReentryRefreshState = 'refreshed' | 'degraded';

export interface ProviderReentryResult {
  providerId: ProviderId;
  kind: ProviderKind;
  refresh: ProviderReentryRefreshState;
}

export interface ProviderReentryDependencies {
  providers: Pick<ProviderRepository, 'getProvider'>;
  credentials: CredentialStore;
  adapters: ProviderAdapterFactory;
  sync: Pick<ProviderSyncService, 'refresh'>;
}

export class ProviderReentryService {
  constructor(deps: ProviderReentryDependencies);
  reenter(providerId: ProviderId, input: ProviderReentryInput): Promise<ProviderReentryResult>;
}
```

The result contains no credential, server URL, playlist URL, raw exception, or provider response.

The dependency shape is deliberate:

- provider repository access is read-only at the service boundary;
- there is no `CatalogRepository` dependency;
- there is no Favorites/watch dependency;
- there is no playback/navigation dependency;
- there is no `ProviderCoreService.deleteProvider()` dependency.

## 6. Same-provider in-flight guard

`ProviderReentryService` owns an in-memory `Set<ProviderId>` guard.

At the start of `reenter()`:

1. if the provider ID is already in flight, reject immediately with sanitized `ProviderError('UNAVAILABLE', null, 'Provider update is already in progress.')`;
2. otherwise add the provider ID to the guard;
3. remove it in `finally` for every success/failure path.

The guard is provider-scoped. Concurrent edits for different provider IDs remain independent.

The guard does not retain candidate secrets beyond the normal lifetime of the active async call.

## 7. Provider identity and kind gate

Before any candidate network operation or write:

1. read the existing provider with `providers.getProvider(providerId)`;
2. if absent, throw sanitized `NOT_FOUND`;
3. compare `provider.kind` with `input.kind`;
4. if they differ, throw sanitized `MALFORMED` before adapter preflight and before every write.

This rejects both Xtream → M3U and M3U → Xtream conversion attempts.

The service never creates a new provider ID and never changes the provider record's kind.

## 8. Candidate normalization and write-free preflight

### 8.1 Xtream

Normalize the candidate exactly at the transaction boundary:

- trim `serverUrl`;
- trim `username`;
- trim `password`;
- reject missing values as sanitized `MALFORMED`.

Create an `XtreamCredential` and candidate adapter from the existing `ProviderRecord`.

The complete Xtream preflight is:

```text
adapter.getProfile()
→ require a valid profile for the same provider ID/kind
→ adapter.listChannels()
→ require successful fetch/decode
```

An empty decoded Xtream channel list is allowed by this lane because the required acceptance condition is successful channel-list fetch/decode, not a non-empty catalog.

No provider, catalog, or credential write occurs during this preflight.

### 8.2 M3U

Reuse `validateM3uEntry({ playlistUrl })`.

- validation failure becomes a sanitized `MALFORMED` provider error; never return the validation object because it preserves user input;
- use the validated/canonical `M3uCredential` returned by the existing validator;
- build the candidate adapter from the existing provider record and validated candidate credential;
- call `adapter.listChannels()`;
- require at least one usable decoded channel;
- zero usable channels is sanitized `MALFORMED`.

No provider, catalog, or credential write occurs during this preflight.

### 8.3 Adapter identity defensive check

Before network methods, require the candidate adapter to report the same `providerId` and `kind` as the existing provider. A mismatch is treated as sanitized `UNAVAILABLE`/configuration failure. This is a defensive invariant around injected factories; the production factory already creates matching adapters.

## 9. Error sanitization during preflight

No thrown raw exception crosses the service boundary.

For candidate network/decode failures:

- preserve only a known `ProviderError.code` when the thrown value is a `ProviderError`;
- replace its message/status with a fixed safe provider-validation message;
- map unknown errors to `UNAVAILABLE` with the same fixed safe message.

Candidate values, request URLs, usernames/passwords, playlist URLs, raw HTTP response content, and raw exception messages must never appear in a service result or thrown message.

The service contains no logging calls.

## 10. Credential commit point and compensation

After complete preflight success, load the exact previous credential with `credentials.load(providerId)`.

A failure to read the previous credential is sanitized `UNAVAILABLE` and still performs no write.

Then execute the single commit attempt:

```text
credentials.save(providerId, candidateCredential)
```

If that save throws, assume it may have partially mutated storage and perform best-effort compensation:

- if a previous credential existed, call `credentials.save(providerId, previousCredential)` with the exact loaded object/value;
- if no previous credential existed, call `credentials.remove(providerId)` to best-effort clean a partially written candidate.

Whether compensation succeeds or fails, the public failure is a sanitized `ProviderError` with code `UNAVAILABLE` and a fixed credential-update message.

The public message must not claim rollback/restore succeeded. Compensation failure must not expose the compensation exception.

There is no provider deletion and no catalog deletion in compensation.

## 11. Post-commit derived-cache refresh

Once candidate credential save succeeds, the credential commit is final for this transaction.

Call the existing:

```ts
sync.refresh(providerId)
```

Do not implement a second catalog refresh algorithm in `ProviderReentryService`.

Classify the returned result:

- `refresh: 'refreshed'` only when profile, categories, and channels all report success;
- otherwise `refresh: 'degraded'`.

If `sync.refresh()` throws after credential commit, catch it and return `refresh: 'degraded'`.

Do not restore the old credential after a post-commit refresh failure.

This preserves the new validated credential while retaining the existing `ProviderSyncService` non-destructive failure behavior. In particular, a failed channel stage must not cause this lane to clear an existing usable channel cache.

The result does not expose refresh exceptions, URLs, or credentials.

## 12. Activation semantics

Re-entry does not activate, deactivate, or switch providers.

`ProviderReentryService` never calls `setActiveProviderId()` or `ProviderCoreService.switchActiveProvider()`.

The active provider ID before the transaction must equal the active provider ID after success, preflight failure, credential-save failure, compensation failure, and refresh degradation.

`ProviderSyncService.refresh()` may update `lastSuccessfulSyncAtMs` as existing derived metadata when channel refresh succeeds; this does not change active-provider state.

## 13. Favorites/watch preservation

Re-entry has no dependency on `FavoriteRepository`, `StructuredFavoriteRepository`, `WatchStateRepository`, or `StructuredWatchStateRepository`.

It never calls any user-state deletion operation.

Because `providerId` remains exact, existing provider-scoped Favorites, last-watched state, and watch aggregates stay in the same partition. Channel reconciliation behavior remains owned by existing catalog/watch/favorites lanes; this transaction must not preemptively delete user state because a remote catalog changes.

Provider deletion cleanup remains the separate `PROV-DEL-I` lane.

## 14. Presenter additive contract

Extend `ProviderManagementOperations` with:

```ts
requestEditProvider(providerId: ProviderId, kind: ProviderKind): void | Promise<void>;
```

Extend each `ProviderManagementProviderItem` with:

```ts
editFocusId: string;
```

The stable focus key is exactly:

```text
provider:${providerId}:edit
```

Per-provider focus order is exactly:

```text
switch → edit → delete
```

The global order remains provider rows in snapshot order, then `add-provider`.

Focus/highlight movement emits no operation.

Activating an edit focus delegates only:

```ts
operations.requestEditProvider(provider.id, provider.kind)
```

It must not call switch, delete, add, credential storage, provider repository, playback, or navigation implementations directly.

If the injected edit callback throws, keep edit focus stable and expose only a fixed sanitized presentation error such as `Sağlayıcı düzenleme açılamadı.`. Do not expose the callback exception.

The presenter never imports or reads `CredentialStore` and never pre-fills stored credentials/URLs into state.

Delete confirmation semantics remain unchanged.

## 15. Security/privacy invariants

The lane must satisfy all of the following:

- no credential/server/playlist URL in `ProviderReentryResult`;
- no candidate secret in `ProviderError.message` or `ProviderError.status`;
- no raw exception object/message in presenter state;
- no credential-bearing DOM work exists in this lane;
- no logging of candidate inputs or exceptions;
- no stored credential/URL is read by the presenter;
- tests that use obvious secret marker strings assert those markers are absent from serialized results/errors/state.

## 16. TDD acceptance matrix

`player/test-ts/provider-reentry-service.test.ts` must cover at least:

1. provider identity preserved exactly on success;
2. no delete+add / no provider removal operation;
3. Xtream ↔ M3U kind mismatch rejected before adapter network/write;
4. Xtream profile preflight failure causes zero credential/catalog/provider writes;
5. Xtream channel-list preflight failure causes zero writes;
6. Xtream success performs profile + channel preflight before credential save;
7. M3U existing validation failure causes zero network/write;
8. M3U zero usable channels rejected before credential save;
9. M3U success commits the validated canonical credential;
10. credential save failure restores the exact previous credential best-effort;
11. credential save failure with no previous credential best-effort removes a partial candidate;
12. compensation failure returns only sanitized `UNAVAILABLE` and does not claim rollback success;
13. post-commit refresh failure/degraded report does not restore the previous credential;
14. existing usable cache is not destructively cleared merely because refresh fails;
15. active provider state is unchanged;
16. Favorites and watch state remain unchanged;
17. service result/error is secret-free even when injected dependencies throw secret-bearing raw errors;
18. duplicate same-provider concurrent submission is bounded by the service guard and does not perform a second network/write sequence.

`player/test-ts/provider-management-presenter.test.ts` must cover at least:

1. edit focus IDs are stable;
2. per-provider focus order is switch → edit → delete;
3. focus movement over edit emits no operation;
4. edit activation calls only `requestEditProvider(providerId, kind)`;
5. edit activation never switches/deletes the provider;
6. edit callback failure is sanitized and focus-stable;
7. state remains free of credential/server/playlist URL data;
8. existing switch/add/delete/delete-confirmation behavior remains green after the additive focus slot.

## 17. Canonical verification

The exact final production head must pass:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

The final exact-base diff must contain only the four owned production/test files.

Any temporary verification workflow must have zero net diff on the production branch.

## 18. PR and merge policy

Open a Draft PR only.

The Draft PR body records:

- ROLE `PROV-REENTRY`;
- frozen base SHA;
- exact production head;
- exact four changed files;
- RED evidence;
- focused GREEN evidence;
- canonical exact-head evidence;
- identity/kind/activation/user-state/security invariant review;
- physical runtime as `NOT VERIFIED` unless actually executed.

The worker must not mark Ready and must not merge. Controller audit is required before either action.
