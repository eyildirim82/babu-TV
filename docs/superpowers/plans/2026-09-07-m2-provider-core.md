# BabuşTV M2 Provider Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the provider core behind BabuşTV's approved boundaries: safe provider metadata/credentials, Xtream Live TV, M3U Live TV, persistent provider/catalog cache, one-active-provider switching, and cache-first background synchronization without changing the current user-visible Live TV UI.

**Architecture:** M2 keeps provider endpoint/parser details behind provider-scoped `ProviderAdapter` instances and keeps secrets behind `CredentialStore`. Provider-derived display data is normalized and persisted separately from credentials; UI-facing consumers read repositories first and background refresh merges provider data by stable provider-scoped IDs. M2 is split into four bounded PR slices so security, Xtream, M3U, and persistence/sync can be reviewed independently.

**Tech Stack:** Node 22, npm workspaces, Vite 6 (`es2015` build target), TypeScript 5.x, Node built-in test runner through `tsx`, browser/Tizen Fetch, native IndexedDB, Samsung Tizen KeyManager candidate API, inherited Shaka/AVPlay playback boundary.

**Spec:** `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`

## Global Constraints

- Samsung Tizen remains the target; generated code stays compatible with the existing `es2015` build target until the Tizen 5 compatibility spike authorizes a change.
- No React migration.
- M2 does not redesign Home, onboarding, Settings, or the Live TV overlay. M3–M5 own those user-visible migrations.
- M2 does not implement EPG, local search, favorites, last watched, or frequently watched; those remain M4–M5 work.
- Multiple providers may be configured, but exactly one provider is active at a time. Provider lists are never aggregated in V1.
- Xtream and M3U normalize into common BabuşTV `Category`/`Channel` domain objects. UI-facing code must never depend on Xtream response field names or M3U parser internals.
- Provider metadata must not contain server URLs, usernames, passwords, M3U playlist URLs, tokens, or raw stream URLs.
- Provider credentials and credential-bearing M3U playlist URLs are stored only behind `CredentialStore`; never in ordinary IndexedDB/localStorage provider metadata.
- Raw M3U channel stream URLs may exist transiently inside a provider adapter/session but are not persisted in ordinary catalog stores in M2.
- Never log passwords, Xtream user/password query strings, credential-bearing M3U URLs, raw stream URLs containing credentials, tokens, decrypted pairing payloads, or provider secrets.
- Tizen KeyManager is the primary secure-storage candidate, not an assumed guarantee. Do not claim hardware-backed storage. The mandatory runtime security spike must be recorded before M2 is declared complete.
- If secure credential persistence is unavailable at runtime, fail closed for persistent provider saving; never silently fall back to localStorage/IndexedDB plaintext secrets.
- Use only synthetic credentials and reserved example domains in tests.
- No public CI test depends on the owner's IPTV provider or on external network access.
- Existing inherited playlist/playback behavior stays operational until a later UI migration deliberately switches to Provider Core.
- No blind upstream merge. Fresh-check `Nur-allhi/en-tvplayer` before every M2 PR slice.
- Every behavior-changing task follows characterization/root cause -> RED -> minimum implementation -> GREEN -> review -> exact-head CI.

---

## PR Slice M2A — Provider Metadata and Credential Security Foundation

**Branch:** `feat/m2a-provider-security-foundation`

### Task 1: Define Provider Credential Boundary and Tizen KeyManager Candidate

**Files:**
- Create: `player/src/credentials/contracts.ts`
- Create: `player/src/credentials/memory-credential-store.ts`
- Create: `player/src/credentials/tizen-keymanager-credential-store.ts`
- Create: `player/test-ts/credential-store.test.ts`
- Create: `docs/decisions/0002-tizen-credential-storage.md`

**Interfaces:**
- Produces `ProviderCredential`, `CredentialStore`, `MemoryCredentialStore`, and `TizenKeyManagerCredentialStore`.
- Credentials are provider-scoped and are never embedded in `ProviderRecord`.
- KeyManager adapter accepts an injected API object so Node tests require no Tizen runtime.

Use these contracts:

```ts
import type { ProviderId } from '../domain/models.js';

export type XtreamCredential = {
  kind: 'xtream';
  serverUrl: string;
  username: string;
  password: string;
};

export type M3uCredential = {
  kind: 'm3u';
  playlistUrl: string;
};

export type ProviderCredential = XtreamCredential | M3uCredential;

export interface CredentialStore {
  isAvailable(): boolean;
  save(providerId: ProviderId, credential: ProviderCredential): Promise<void>;
  load(providerId: ProviderId): Promise<ProviderCredential | null>;
  remove(providerId: ProviderId): Promise<void>;
}
```

The KeyManager adapter must expose only sanitized failures:

```ts
export class CredentialStoreUnavailableError extends Error {
  constructor() {
    super('Secure credential storage is unavailable.');
    this.name = 'CredentialStoreUnavailableError';
  }
}
```

- [ ] **Step 1: Write credential-store RED tests**

Tests must cover:

```ts
void test('memory credential store isolates credentials by provider', async () => {
  const store = new MemoryCredentialStore();
  await store.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo-user',
    password: 'demo-pass',
  });
  await store.save('provider-b', {
    kind: 'm3u',
    playlistUrl: 'https://example.com/demo.m3u',
  });

  assert.equal((await store.load('provider-a'))?.kind, 'xtream');
  assert.equal((await store.load('provider-b'))?.kind, 'm3u');
});

void test('unavailable KeyManager fails closed instead of persisting elsewhere', async () => {
  const store = new TizenKeyManagerCredentialStore(null);
  assert.equal(store.isAvailable(), false);
  await assert.rejects(store.save('provider-a', {
    kind: 'm3u',
    playlistUrl: 'https://example.com/demo.m3u',
  }), CredentialStoreUnavailableError);
});
```

Add injected-KeyManager tests for save/load/remove and verify thrown errors never contain `demo-user`, `demo-pass`, or a credential-bearing URL.

- [ ] **Step 2: Run RED**

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="credential"
```

Expected: FAIL because credential modules do not exist.

- [ ] **Step 3: Implement `MemoryCredentialStore` and the minimum KeyManager adapter**

The KeyManager wrapper must serialize the credential to JSON only at the secure-store boundary and use provider-scoped aliases such as `babustv.provider.<providerId>`. It may call `removeData` before `saveData` to replace an existing value; a missing alias during replacement/removal is ignored. It must never call `console.*` with credential values or raw KeyManager data.

Use an injected shape equivalent to:

```ts
export interface KeyManagerLike {
  saveData(
    name: string,
    data: string,
    password: string | null,
    successCallback?: () => void,
    errorCallback?: (error: unknown) => void,
  ): void;
  getData(alias: string, password?: string | null): { rawData?: string } | null;
  removeData(alias: string): void;
}
```

If the actual Samsung runtime return shape differs, adapt this internal interface to the official API without changing `CredentialStore`.

- [ ] **Step 4: Record the secure-storage decision and runtime gate**

`docs/decisions/0002-tizen-credential-storage.md` must record:

- Samsung Tizen KeyManager is the primary candidate because Samsung documents it as a secure repository for TV profile data.
- Samsung WidgetData secure storage is evaluated only as a secondary candidate during the runtime spike.
- No claim is made that storage is hardware-backed or TEE-backed.
- No localStorage/IndexedDB plaintext fallback is allowed for persistent provider credentials.
- Runtime probe matrix before M2 completion: Tizen Emulator where available, Samsung RTL where available, and the next available physical Samsung TV. For each target record API presence, save/load/remove behavior, persistence after app restart, and failure behavior.
- Until at least one Tizen runtime probe passes, the implementation is a documented candidate and M2 cannot be called fully complete.

- [ ] **Step 5: Run GREEN and full verification**

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
```

Expected: all existing and new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add player/src/credentials player/test-ts/credential-store.test.ts docs/decisions/0002-tizen-credential-storage.md
git commit -m "feat(m2a): add secure credential store boundary"
```

### Task 2: Add Non-Secret Provider Registry and Active Provider State

**Files:**
- Modify: `player/src/domain/models.ts`
- Create: `player/src/repository/provider-repository.ts`
- Create: `player/src/repository/memory-provider-repository.ts`
- Create: `player/test-ts/provider-repository.test.ts`

**Interfaces:**

Add only non-secret metadata:

```ts
export interface ProviderRecord {
  id: ProviderId;
  kind: ProviderKind;
  name: string;
  createdAtMs: number;
  lastSuccessfulSyncAtMs: number | null;
}
```

Repository contract:

```ts
export interface ProviderRepository {
  listProviders(): Promise<readonly ProviderRecord[]>;
  getProvider(providerId: ProviderId): Promise<ProviderRecord | null>;
  saveProvider(provider: ProviderRecord): Promise<void>;
  removeProvider(providerId: ProviderId): Promise<void>;
  getActiveProviderId(): Promise<ProviderId | null>;
  setActiveProviderId(providerId: ProviderId | null): Promise<void>;
}
```

- [ ] **Step 1: Write RED tests**

Cover multiple records, one active provider, switching active IDs, removal, and a structural assertion that `ProviderRecord` persistence data contains no `serverUrl`, `playlistUrl`, `username`, or `password` fields.

- [ ] **Step 2: Run RED**

```bash
npm run test:ts -w player -- --test-name-pattern="provider repository"
```

Expected: FAIL because provider repository modules do not exist.

- [ ] **Step 3: Implement the minimum memory repository**

Use a `Map<ProviderId, ProviderRecord>` plus `activeProviderId`. `setActiveProviderId(nonNullId)` must reject unknown providers with a deterministic `UnknownProviderError` rather than silently accepting invalid state.

- [ ] **Step 4: Run GREEN and full verification**

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
```

- [ ] **Step 5: Commit**

```bash
git add player/src/domain/models.ts player/src/repository player/test-ts/provider-repository.test.ts
git commit -m "feat(m2a): add provider registry state"
```

### Task 3: Evolve the Provider Adapter into a Provider-Scoped Contract

**Files:**
- Modify: `player/src/providers/contracts.ts`
- Modify: `player/src/providers/fake-provider.ts`
- Modify: `player/test-ts/fake-provider.test.ts`
- Modify: `player/test-ts/boundary-contracts.test.ts`

**Interfaces:**

Add a normalized validation/profile result:

```ts
export interface ProviderProfile {
  providerId: ProviderId;
  kind: ProviderKind;
  accountName: string | null;
  expiresAtMs: number | null;
  maxConnections: number | null;
}

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  readonly kind: ProviderKind;
  getProfile(): Promise<ProviderProfile>;
  listCategories(): Promise<readonly Category[]>;
  listChannels(): Promise<readonly Channel[]>;
  resolveStream(channelId: ChannelId): Promise<StreamRequest>;
}

export interface ProviderAdapterFactory {
  create(provider: ProviderRecord, credential: ProviderCredential): ProviderAdapter;
}
```

- [ ] **Step 1: Update fake-provider tests first**

RED expectations:

- constructor receives a fixed `providerId` once;
- returned categories/channels always carry that provider ID;
- `getProfile()` returns a deterministic synthetic profile;
- two adapters using identical external channel IDs remain provider-scoped;
- fake failure modes remain deterministic.

- [ ] **Step 2: Run RED**

```bash
npm run test:ts -w player -- --test-name-pattern="fake provider|boundary contracts"
```

Expected: FAIL because the current adapter methods still accept `providerId` per call.

- [ ] **Step 3: Implement the minimum contract migration**

Update `FakeProvider` and tests only. Do not wire current UI or legacy playlist loading to the new contract in M2A.

- [ ] **Step 4: Full verification and exact-head CI**

```bash
npm ci
npm test
npm run typecheck
npm run build
git diff --exit-code
```

Open/update the M2A Draft PR. Exact-head CI must be GREEN before merge approval.

---

## PR Slice M2B — Xtream Provider

**Branch:** `feat/m2b-xtream-provider`

### Task 4: Add Provider HTTP Transport and Safe Provider Errors

**Files:**
- Create: `player/src/providers/http/contracts.ts`
- Create: `player/src/providers/http/fetch-provider-http-client.ts`
- Create: `player/src/providers/errors.ts`
- Create: `player/test-ts/provider-http.test.ts`

**Interfaces:**

```ts
export type ProviderErrorCode =
  | 'AUTH'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'SERVER'
  | 'MALFORMED'
  | 'UNAVAILABLE';

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly status: number | null,
    safeMessage: string,
  ) {
    super(safeMessage);
    this.name = 'ProviderError';
  }
}

export interface ProviderHttpClient {
  getJson<T>(url: string, timeoutMs?: number): Promise<T>;
  getText(url: string, timeoutMs?: number): Promise<string>;
}
```

- [ ] **Step 1: Write RED tests with injected fake fetch**

Cover 200 JSON/text, 401/403 -> `AUTH`, 404 -> `NOT_FOUND`, 500 -> `SERVER`, rejected fetch -> `NETWORK`, timeout without sleeping via injected timer/deferred promise, and malformed JSON -> `MALFORMED`.

Assert errors never include the request URL when it contains `demo-user`/`demo-pass`.

- [ ] **Step 2: Run RED**

```bash
npm run test:ts -w player -- --test-name-pattern="provider http"
```

- [ ] **Step 3: Implement minimum transport**

Use injected `fetch` and a bounded timeout. Do not log raw URLs. If diagnostics are needed later, pass URLs through `sanitizeUrlForLog` before emission.

- [ ] **Step 4: GREEN/full verification and commit**

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
```

### Task 5: Implement Xtream Auth, Categories, Live Channels, and Stream Resolution

**Files:**
- Create: `player/src/providers/xtream/xtream-provider.ts`
- Create: `player/src/providers/xtream/xtream-types.ts`
- Create: `player/src/providers/xtream/xtream-normalize.ts`
- Create: `player/test-ts/xtream-provider.test.ts`
- Create: `player/test-ts/fixtures/xtream-fixtures.ts`

**Interfaces and normalization:**

- Base server accepts `http://` or `https://`, strips trailing `/`, and rejects other schemes.
- Account validation calls `player_api.php?username=<...>&password=<...>`.
- Categories call the same endpoint with `action=get_live_categories`.
- Live channels call `action=get_live_streams`.
- Raw Xtream responses never escape the adapter.
- `Channel.id = String(stream_id)`.
- `categoryId = String(category_id)` when present, otherwise `null`.
- `logoUrl = stream_icon || null`.
- positive provider `num` becomes `number`, otherwise `null`.
- The adapter retains only non-persisted stream-extension metadata keyed by channel ID; the normalized `Channel` does not contain username/password or a raw stream URL.
- `resolveStream(channelId)` generates the live URL at call time from the secure credential and current channel metadata.

- [ ] **Step 1: Write Xtream RED tests**

Use only synthetic fixtures. Cover:

```ts
void test('Xtream maps live stream into normalized provider-scoped Channel', async () => {
  const channels = await adapter.listChannels();
  assert.deepEqual(channels[0], {
    providerId: 'provider-a',
    id: '42',
    name: 'Example News',
    categoryId: '7',
    logoUrl: 'https://example.com/logo.png',
    number: 1,
  });
});
```

Also cover auth=0, expired/inactive account response classification, missing arrays, malformed items, empty categories, duplicate stream IDs, and stream resolution. Verify no normalized channel/profile/error contains `demo-pass`.

- [ ] **Step 2: Run RED**

```bash
npm run test:ts -w player -- --test-name-pattern="Xtream"
```

- [ ] **Step 3: Implement minimum Xtream adapter**

Account profile parses `exp_date` as Unix seconds when numeric, otherwise `null`; `max_connections` becomes a finite positive integer or `null`. Do not add VOD/Series endpoints.

- [ ] **Step 4: Full verification and exact-head M2B CI**

```bash
npm ci
npm test
npm run typecheck
npm run build
git diff --exit-code
```

Exact-head CI must be GREEN before M2B merge approval.

---

## PR Slice M2C — M3U Provider

**Branch:** `feat/m2c-m3u-provider`

### Task 6: Add a Typed M3U Parser for Provider Core Without Breaking Legacy Playback

**Files:**
- Create: `player/src/providers/m3u/m3u-parser.ts`
- Create: `player/test-ts/m3u-parser.test.ts`
- Create: `player/test-ts/fixtures/m3u-fixtures.ts`
- Keep unchanged in this task: `player/src/utils.js`

**Reason for temporary parallel parser:** the inherited JS parser is still used by the current production UI and is protected by characterization tests. M2 introduces a typed Provider Core parser beside it; the legacy parser is removed only when the UI migration has tests proving equivalence.

**Parsed shape:**

```ts
export interface ParsedM3uEntry {
  tvgId: string | null;
  name: string;
  group: string | null;
  logoUrl: string | null;
  channelNumber: number | null;
  streamUrl: string;
  userAgent: string | null;
  headers: Readonly<Record<string, string>>;
  drm: { keyId: string; key: string } | null;
  useProxy: boolean;
  proxyUrl: string | null;
}
```

- [ ] **Step 1: Write RED characterization/extension tests**

The new parser must preserve the useful inherited semantics: quoted comma handling, `group-title`, `tvg-chno`/`channel-number`, `#KODIPROP` ClearKey, `#EXTVLCOPT:http-user-agent`, `#EXTHTTP`, pipe headers, `edge-*` query params, and proxy flags. It additionally parses `tvg-id` and `tvg-logo`.

Malformed lines are skipped rather than throwing the entire list unless the document is not recognizable as M3U.

- [ ] **Step 2: Run RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M3U parser"
```

- [ ] **Step 3: Implement the typed parser**

Do not modify the legacy JS parser in this slice. Parsed raw stream URLs stay inside Provider Core and are never placed in `Channel` or the ordinary repository.

- [ ] **Step 4: GREEN/full verification**

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
```

### Task 7: Implement M3U Provider, Stable Identity, Categories, and Stream Resolution

**Files:**
- Create: `player/src/providers/m3u/m3u-provider.ts`
- Create: `player/src/providers/m3u/m3u-identity.ts`
- Create: `player/test-ts/m3u-provider.test.ts`
- Modify: `player/src/playback/contracts.ts` only if required to carry already-supported transient user-agent/header/DRM/proxy information through `StreamRequest`.

**Identity rule:**

1. non-empty `tvg-id` -> stable ID derived from `tvg-id`;
2. otherwise derive a deterministic non-plaintext identifier from normalized stream URL + channel name + group;
3. never use raw array index as identity;
4. never persist the source URL merely to support identity.

Use a deterministic 32-bit FNV-1a helper for fallback identity because it is an identity hash, not a credential-security primitive:

```ts
export function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
```

Tests must show list reordering does not change IDs and two same-name channels with different stream identities do not collapse.

**M3U adapter behavior:**

- constructor captures `providerId`, M3U credential, and injected HTTP client;
- `getProfile()` validates a load/parse and returns a normalized local profile with nullable account fields;
- categories are unique non-empty groups in first-seen order plus no synthetic UI-only favorites category;
- channels contain providerId/id/name/categoryId/logo/number only;
- raw parsed stream entries are held in an in-memory `Map<ChannelId, ParsedM3uEntry>`;
- `resolveStream()` returns the transient stream request from that map;
- after app restart, cached display channels may be shown before network refresh, but M2 does not persist raw M3U stream URLs in ordinary IndexedDB.

- [ ] **Step 1: Write provider RED tests**

Cover valid playlist, malformed/broken playlist, duplicate names, duplicate `tvg-id`, reorder stability, large 1000-channel list, group categories, headers/user-agent propagation, and credential-bearing playlist URL never appearing in errors.

- [ ] **Step 2: Run RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M3U provider"
```

- [ ] **Step 3: Implement minimum M3U adapter**

The new core performs direct provider fetch through the injected transport. Do not route a credential-bearing playlist URL through a BabuşTV-owned generic relay in Provider Core.

- [ ] **Step 4: Full verification and exact-head M2C CI**

```bash
npm ci
npm test
npm run typecheck
npm run build
git diff --exit-code
```

---

## PR Slice M2D — IndexedDB Cache, Sync, Switching, and Provider Lifecycle

**Branch:** `feat/m2d-provider-cache-sync`

### Task 8: Add Native IndexedDB Storage Boundary and Persistent Provider/Catalog Repositories

**Files:**
- Create: `player/src/storage/contracts.ts`
- Create: `player/src/storage/memory-structured-store.ts`
- Create: `player/src/storage/indexeddb-structured-store.ts`
- Create: `player/src/repository/catalog-repository.ts`
- Create: `player/src/repository/structured-provider-repository.ts`
- Create: `player/src/repository/structured-catalog-repository.ts`
- Create: `player/test-ts/structured-repository.test.ts`

**Database:** `babustv`, schema version `1`.

Stores:

- `providers`, key path `id` — non-secret `ProviderRecord` only;
- `categories`, key path `key`, index `providerId`;
- `channels`, key path `key`, index `providerId`;
- `app_state`, key path `key` — includes only `activeProviderId` in M2.

No credential store exists inside this database.

**Catalog contract:**

```ts
export interface CatalogRepository {
  replaceCategories(providerId: ProviderId, categories: readonly Category[]): Promise<void>;
  listCategories(providerId: ProviderId): Promise<readonly Category[]>;
  replaceChannels(providerId: ProviderId, channels: readonly Channel[]): Promise<void>;
  listChannels(providerId: ProviderId): Promise<readonly Channel[]>;
  getChannel(providerId: ProviderId, channelId: ChannelId): Promise<Channel | null>;
  removeProviderCatalog(providerId: ProviderId): Promise<void>;
}
```

- [ ] **Step 1: Write RED repository tests against `MemoryStructuredStore`**

Cover two provider catalogs with identical channel IDs, replacement of only one provider's rows, active-provider persistence, removal scoped to one provider, and absence of credential fields in all stored records.

- [ ] **Step 2: Run RED**

```bash
npm run test:ts -w player -- --test-name-pattern="structured repository"
```

- [ ] **Step 3: Implement memory and IndexedDB store boundaries**

The Node behavioral suite uses `MemoryStructuredStore`. `IndexedDbStructuredStore` accepts an injected `IDBFactory`; creation/upgrade logic creates the four stores/indexes above. If IndexedDB is unavailable, surface a deterministic storage-unavailable error; do not switch to localStorage for provider catalog persistence.

- [ ] **Step 4: GREEN/full verification**

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
```

### Task 9: Add Provider Adapter Factory

**Files:**
- Create: `player/src/providers/provider-adapter-factory.ts`
- Create: `player/test-ts/provider-adapter-factory.test.ts`

**Interfaces:**

The factory receives the shared `ProviderHttpClient`; `create(record, credential)` checks `record.kind === credential.kind` and returns `XtreamProvider` or `M3uProvider`. A kind mismatch throws a safe configuration error without serializing the credential.

- [ ] **Step 1: RED tests for Xtream/M3U selection and kind mismatch**
- [ ] **Step 2: Run RED**
- [ ] **Step 3: Implement minimum factory**
- [ ] **Step 4: Run GREEN/full verification**

Commands:

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
```

### Task 10: Implement Partitioned Provider Sync and Cache Preservation

**Files:**
- Create: `player/src/providers/provider-sync-service.ts`
- Create: `player/test-ts/provider-sync-service.test.ts`

**Interfaces:**

```ts
export type SyncStageResult =
  | { status: 'success'; count: number }
  | { status: 'failed'; code: ProviderErrorCode };

export interface ProviderSyncReport {
  providerId: ProviderId;
  profile: 'success' | 'failed';
  categories: SyncStageResult;
  channels: SyncStageResult;
  completedAtMs: number;
}
```

`ProviderSyncService.refresh(providerId)`:

1. loads provider metadata and credential independently;
2. creates the provider adapter;
3. refreshes profile, categories, and channels as isolated stages;
4. successful category stage replaces that provider's categories;
5. successful channel stage reconciles previous/new channels by stable ID and replaces only that provider's channel cache;
6. a failed stage leaves the previous cache for that stage untouched;
7. updates `lastSuccessfulSyncAtMs` only when channel refresh succeeds;
8. never clears another provider's data.

- [ ] **Step 1: RED tests**

Cover full success, categories success + channels failure preserving old channels, channels success + profile failure, auth failure, provider missing credential, duplicate IDs across providers, rename/update/remove reconciliation, and 1000-channel refresh.

- [ ] **Step 2: Run RED**

```bash
npm run test:ts -w player -- --test-name-pattern="provider sync"
```

- [ ] **Step 3: Implement minimum sync service**

Do not wire M2 sync directly into the current UI. Expose it as a domain service for later startup/onboarding integration.

- [ ] **Step 4: GREEN/full verification**

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
```

### Task 11: Implement Cache-First Load, Provider Switching, and Provider Deletion

**Files:**
- Create: `player/src/providers/provider-core-service.ts`
- Create: `player/test-ts/provider-core-service.test.ts`

**Interfaces:**

```ts
export interface ProviderSnapshot {
  provider: ProviderRecord;
  categories: readonly Category[];
  channels: readonly Channel[];
}

export interface CacheFirstLoad {
  cached: ProviderSnapshot;
  refresh: Promise<ProviderSyncReport>;
}
```

`ProviderCoreService` operations:

- `loadCacheFirst(providerId)` resolves cached metadata/categories/channels without waiting for provider network and returns a separately awaitable refresh promise;
- `switchActiveProvider(providerId)` only changes active provider after confirming the provider exists;
- `deleteProvider(providerId)` removes credential, catalog, and provider metadata, then clears `activeProviderId` if that provider was active;
- provider deletion does not touch other providers;
- later provider-scoped user-state repositories from M4/M5 must register with the deletion orchestrator before those milestones claim provider deletion completeness.

- [ ] **Step 1: RED tests**

Use a deferred fake provider to prove cached snapshot resolves while refresh remains pending. Cover switch A -> B, unknown-provider switch rejection, delete active provider, delete inactive provider, secure credential removal, and failed background refresh retaining cached channels.

- [ ] **Step 2: Run RED**

```bash
npm run test:ts -w player -- --test-name-pattern="cache-first|provider core"
```

- [ ] **Step 3: Implement minimum service**

No screen/UI changes in M2D.

- [ ] **Step 4: GREEN/full verification**

```bash
npm test
npm run typecheck
npm run build
git diff --exit-code
```

### Task 12: M2 Milestone Verification and Security Runtime Gate

**Files:**
- Update: `docs/decisions/0002-tizen-credential-storage.md` with actual runtime evidence when available.
- No production feature work in this task unless verification reveals a defect; any defect starts a new RED-first cycle.

- [ ] **Step 1: Fresh repository/upstream gate**

Verify current `main`, exact M2D head, open PR state, exact-head CI, and fresh `Nur-allhi/en-tvplayer` head. Do not reuse earlier SHA/status assumptions.

- [ ] **Step 2: Run the exact M2D verification suite**

```bash
npm ci
npm test
npm run typecheck
npm run build
git diff --exit-code
```

- [ ] **Step 3: Review M2 cumulative diff against the approved spec**

Confirm:

- provider metadata and secrets are structurally separated;
- no plaintext credential fallback exists;
- Xtream supports account validation, live categories, live channels, and stream resolution only;
- M3U supports typed parsing, groups/categories, stable IDs, and transient stream resolution;
- raw provider fields do not reach normalized UI-facing models;
- raw stream URLs are not persisted in ordinary catalog stores;
- multiple providers remain provider-scoped with exactly one active provider;
- cache-first load returns cached state without waiting for refresh;
- failed refresh preserves useful cache;
- provider deletion purges all M2-era provider metadata/catalog/credentials;
- no real provider data, signing material, or credential-bearing test fixture exists in git;
- current inherited production UI/playback remains buildable and behavior-compatible.

- [ ] **Step 4: Execute the mandatory credential-storage runtime probe**

On the first available Tizen runtime, run save/load/remove for a synthetic credential, restart the app, load again, then remove and confirm absence. Record device/runtime class and result without recording the synthetic credential value. If KeyManager is unavailable or fails persistence, evaluate WidgetData as the documented secondary candidate with the same probe. Do not enable an insecure fallback.

If no Tizen runtime is available at this checkpoint, record the gate as **not yet satisfied** and do not claim M2 fully complete; code/test progress may remain merged only if the PR description clearly states the remaining hardware security gate.

- [ ] **Step 5: Exact-head CI checkpoint**

Every M2 slice requires GREEN CI on its exact head before merge. M2 milestone completion additionally requires the runtime credential-storage gate above.

## M2 Expected End State

After M2, BabuşTV has a testable provider core that can validate and read Xtream Live TV, parse and read M3U Live TV, normalize both into common provider-scoped models, persist non-secret provider/catalog data, keep credentials behind a secure-store abstraction, switch one active provider at a time, and serve cached catalog state before background refresh finishes. The inherited UI remains in place until M3–M5 deliberately consume these services.
