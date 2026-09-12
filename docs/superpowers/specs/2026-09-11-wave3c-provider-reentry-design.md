# Wave 3C Provider Credential Re-entry Design

**Date:** 2026-09-11  
**Role:** `PROV-REENTRY`  
**Repository:** `eyildirim82/babu-TV`  
**Frozen production base:** `860d9efa8efac7c9872bf31f7f592ae12a414889`  
**Status:** APPROVED

## Purpose

Add safe credential re-entry/edit for an existing provider without implementing delete+add, changing provider identity, changing activation, or disturbing provider-scoped Favorites/watch state.

The approved transaction is:

```text
write-free candidate preflight
  -> credential commit point
  -> non-destructive derived-cache refresh
```

This lane does not integrate the edit surface into M5 application routing. It exposes the service contract and additive Provider Management presentation intent only.

## Owned production/test files

Exactly:

- `player/src/providers/provider-reentry-service.ts`
- `player/src/provider-management/provider-management-presenter.ts`
- `player/test-ts/provider-reentry-service.test.ts`
- `player/test-ts/provider-management-presenter.test.ts`

No other production/test file is owned by this lane. Planning documents remain on the docs branch and are read-only inputs to the production worker.

## Existing seams used read-only

- `ProviderRepository.getProvider(providerId)`
- `CredentialStore.load/save/remove`
- `ProviderAdapterFactory.create(provider, credential)`
- `ProviderAdapter.getProfile()` / `listChannels()`
- `ProviderSyncService.refresh(providerId)`
- `validateM3uEntry(...)`
- existing `ProviderError` sanitized public error model

The service deliberately does not receive `ProviderRepository.removeProvider`, `ProviderCoreService.deleteProvider`, Favorites repositories, watch repositories, playback/session objects, or navigation objects.

## Public service contract

`provider-reentry-service.ts` defines a strict provider-kind input union:

```ts
export type ProviderReentryInput =
  | {
      providerId: ProviderId;
      kind: 'xtream';
      serverUrl: string;
      username: string;
      password: string;
    }
  | {
      providerId: ProviderId;
      kind: 'm3u';
      playlistUrl: string;
    };

export type ProviderReentryRefreshStatus = 'completed' | 'degraded';

export interface ProviderReentryResult {
  providerId: ProviderId;
  kind: ProviderKind;
  refresh: ProviderReentryRefreshStatus;
}
```

The result contains no credential, server URL, playlist URL, raw exception, or secret-derived text.

Dependencies are intentionally narrow:

```ts
export interface ProviderReentryDependencies {
  providers: Pick<ProviderRepository, 'getProvider'>;
  credentials: Pick<CredentialStore, 'load' | 'save' | 'remove'>;
  adapters: ProviderAdapterFactory;
  sync: Pick<ProviderSyncService, 'refresh'>;
}
```

## Identity and kind invariants

1. The existing `ProviderRecord` is loaded by `providerId` and never replaced or removed by this service.
2. The existing provider ID is passed unchanged to credential persistence, adapter creation, and refresh.
3. `input.kind` must exactly equal `provider.kind` before adapter creation, network access, or writes.
4. Xtream-to-M3U and M3U-to-Xtream conversion is rejected with a sanitized `MALFORMED` `ProviderError` before network/write.
5. No active-provider setter is available to the service, so activation state cannot change.

## Write-free preflight

Preflight has zero credential, catalog, and provider writes.

Common order:

1. reject same-provider duplicate in-flight request;
2. read existing provider;
3. reject missing provider / kind mismatch;
4. normalize and validate the candidate input;
5. create an adapter for the existing provider + candidate credential;
6. run provider-kind-specific network/decode checks;
7. only after complete success proceed to credential commit preparation.

### Xtream

- Trim `serverUrl`, `username`, and `password`; reject missing values as sanitized `MALFORMED`.
- Call candidate adapter `getProfile()` and require it to succeed.
- Require the returned profile to match the existing `providerId` and kind `xtream`; mismatch is malformed candidate data.
- Call candidate adapter `listChannels()` and require successful fetch/decode.
- An empty decoded Xtream channel list is not independently rejected by this lane because the approved Xtream preflight requirement is successful profile validation plus successful channel-list fetch/decode.

### M3U

- Reuse `validateM3uEntry({ playlistUrl })` to normalize/validate the candidate URL.
- Validation failures are mapped to a fixed sanitized `MALFORMED` error; the validation result containing raw input is never returned by this service.
- Call candidate adapter `listChannels()`.
- Require at least one usable decoded channel. Zero channels is a sanitized `MALFORMED` preflight failure.

Any raw adapter/network/parser exception is converted to a fixed safe `ProviderError`; credential/server/playlist values must never enter the public error message or logs.

## Credential commit and compensation

After preflight succeeds, load the exact previous credential value for compensation. A previous-credential load failure performs no write and returns sanitized `UNAVAILABLE`.

The single commit point is:

```ts
await credentials.save(providerId, candidateCredential);
```

If the candidate save throws, it may have partially persisted. Perform best-effort compensation:

- previous credential exists -> `save(providerId, previousCredential)` exactly;
- no previous credential -> `remove(providerId)` to clean a possibly partial candidate.

Regardless of whether compensation succeeds or fails, the externally reported failure is only a sanitized `UNAVAILABLE` error. The service never claims rollback succeeded. Compensation errors are neither logged nor exposed.

`ProviderRepository.removeProvider`, Provider Core delete/register, and catalog removal are never used as compensation.

## Post-commit refresh

Once candidate credential save succeeds, the credential commit is final for this transaction.

Call existing `sync.refresh(providerId)` as a derived-cache refresh. This may update catalog/provider sync metadata through the established sync service. Re-entry itself does not clear catalog data.

- all refresh stages succeed -> `{ refresh: 'completed' }`;
- a refresh report contains any failed stage, or `refresh()` throws -> `{ refresh: 'degraded' }`.

A post-commit refresh failure never rolls the credential back. Existing usable cache must not be explicitly cleared merely because refresh failed. The service has no catalog-removal dependency and therefore cannot destructively clear it.

## Concurrency

`ProviderReentryService` owns an in-memory `Set<ProviderId>` in-flight guard.

- first request for a provider enters the guard before reads/network;
- a concurrent request for the same provider is immediately rejected with fixed sanitized `UNAVAILABLE` and performs no network/write;
- different provider IDs may proceed independently;
- the guard is released in `finally` on every path.

This bounds duplicate submits without creating a global lock and avoids ambiguous competing credential commits.

## Favorites/watch and activation preservation

This lane does not depend on Favorites/watch repositories and has no code path that deletes/rekeys a provider, so provider-scoped user state remains keyed to the same `providerId`.

The service does not read or write active-provider state. Re-entry completion therefore preserves whichever provider was active before the transaction.

Tests use sentinel user-state/activation values around the transaction and assert they remain unchanged; implementation must not gain dependencies that can mutate them.

## Presenter additive behavior

`ProviderManagementOperations` gains:

```ts
requestEditProvider(providerId: ProviderId, kind: ProviderKind): void | Promise<void>;
```

Each projected provider item gains:

```ts
editFocusId: `provider:${providerId}:edit`
```

Per-provider focus order becomes:

```text
switch -> edit -> delete
```

then the existing `add-provider` entry.

Activating the edit focus calls only `requestEditProvider(provider.id, provider.kind)`. It does not switch the active provider, delete a provider, reload provider state, read credentials, or prefill stored server/playlist/username/password values.

Moving/highlighting focus remains side-effect free. Delete confirmation semantics remain unchanged apart from the inserted edit focus position.

## Secret handling

No credential/server/playlist URL or raw exception may appear in:

- `ProviderReentryResult`;
- thrown public error messages;
- Provider Management state;
- DOM-facing presenter data;
- logs.

The new service contains no logging calls. Presenter continues to project only provider identity/kind/name/active state and focus IDs.

## TDD acceptance matrix

Tests must cover at minimum:

- provider identity preserved exactly;
- no delete+add / no provider removal;
- kind mismatch rejected before network/write;
- zero-write Xtream/M3U preflight failures;
- Xtream profile + channel-list success;
- M3U validation reuse and zero-channel rejection;
- candidate credential commit only after full preflight;
- save failure restores exact previous credential best-effort;
- no-previous-credential save failure attempts candidate cleanup;
- compensation failure still exposes only sanitized `UNAVAILABLE` and no rollback-success claim;
- post-commit refresh failure retains committed credential and returns degraded refresh;
- activation invariant;
- Favorites/watch preservation by unchanged provider identity/no user-state operations;
- secret-free success/error state;
- same-provider duplicate submit bounded by the in-flight guard;
- presenter edit intent purity;
- focus order/focus stability `switch -> edit -> delete`;
- focus/highlight does not invoke operations;
- presenter never reads credentials and never prefills stored credentials/URLs.

## Verification and handoff

Production worker must start from exact frozen base `860d9efa8efac7c9872bf31f7f592ae12a414889`, follow RED -> GREEN TDD, and finish with fresh exact-production-head evidence for:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Final production diff must contain exactly the four owned production/test files. Open a Draft PR only. Do not integrate M5 app routing/surface, mark Ready, or merge without Controller audit.
