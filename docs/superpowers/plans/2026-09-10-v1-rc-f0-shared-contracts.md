# BabuşTV V1 RC-F0 Shared Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the minimum shared TypeScript contracts and test-support seams required to fan out BabuşTV V1 RC work into independent EPG, Favorites, Search, M3U, Watch State, and later integration lanes without creating shared-file merge conflicts.

**Architecture:** RC-F0 is deliberately contract-only. It adds provider-scoped EPG/Favorites/watch-state interfaces in new focused modules and memory-backed test doubles under test support. It does not implement feature behavior, provider-specific parsing, IndexedDB migrations, UI, runtime composition, pairing protocol behavior, or playback changes. Real persistence remains owned by later single-owner integration packages (`EPG-P`, `USER-P`).

**Tech Stack:** TypeScript 5.9, Node test runner through `tsx`, existing BabuşTV domain types, framework-free modules.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- Branch target: `foundation/v1-rc-contracts`.
- Base only from the exact GREEN `main` produced after the V1 RC roadmap/parallel-execution documentation is integrated.
- No development directly on `main`.
- TDD is mandatory: focused RED → minimum contract implementation → focused GREEN → full regression/typecheck/build.
- RC-F0 must not implement EPG ingestion, Favorites behavior, Search behavior, watch scoring, M3U onboarding behavior, pairing behavior, Home, or user-facing UI.
- RC-F0 must not modify `player/src/main.js`, `player/index.html`, Live TV controller/view/runtime composition, playback/session code, credential-store implementations, or global presentation files.
- Do not increase the IndexedDB `DATABASE_VERSION` or create actual `epg`, `favorites`, or `watch_state` object stores in RC-F0.
- Provider secrets, credential-bearing URLs, stream URLs, tokens, and decrypted pairing payloads must never be introduced into these contracts, tests, logs, fixtures, or failure messages.
- Provider-scoped identity is always explicit. No new user-owned state may rely on raw array index or URL identity.
- Existing `Channel`, `ProviderId`, `ChannelId`, `EpgProgram`, and `makeChannelKey()` remain authoritative unless this plan explicitly says otherwise.
- No new npm dependency.

---

## File Structure

Create only these production contract modules:

- `player/src/epg/contracts.ts` — provider-independent EPG source, mapping descriptor, repository, and query boundaries.
- `player/src/favorites/contracts.ts` — durable provider-scoped Favorite record/repository boundary.
- `player/src/watch/contracts.ts` — last-watched/watch aggregate record and repository boundary.

Create only these test-support/test files:

- `player/test-ts/support/v1-rc-memory-repositories.ts` — in-memory implementations used by first-wave workers and RC-F0 acceptance tests; never imported by production runtime.
- `player/test-ts/v1-rc-contracts.test.ts` — compile/runtime acceptance for frozen contracts and provider isolation.

Do **not** modify:

- `player/src/storage/contracts.ts`
- `player/src/storage/indexeddb-structured-store.ts`
- `player/src/storage/memory-structured-store.ts`
- `player/src/providers/contracts.ts`
- `player/src/providers/create-browser-provider-runtime.ts`
- `player/src/live-tv/*`
- `player/src/main.js`

If implementation pressure requires one of those files, stop and return to controller review; do not silently broaden F0.

---

### Task 1: Freeze EPG contracts

**Files:**
- Create: `player/src/epg/contracts.ts`
- Test: `player/test-ts/v1-rc-contracts.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `ChannelId`, `EpgProgram` from `player/src/domain/models.ts`.
- Produces:
  - `EpgWindow`
  - `EpgSourceProgram`
  - `EpgChannelDescriptor`
  - `EpgSource`
  - `EpgProgramRepository`
  - `EpgQuery`

The exact contract must be:

```ts
import type {
  ChannelId,
  EpgProgram,
  ProviderId,
} from '../domain/models.js';

export interface EpgWindow {
  startMs: number;
  endMs: number;
}

export interface EpgSourceProgram {
  sourceChannelId: string;
  startMs: number;
  endMs: number;
  title: string;
  description: string | null;
}

export interface EpgChannelDescriptor {
  providerId: ProviderId;
  channelId: ChannelId;
  name: string;
  epgIds: readonly string[];
}

export interface EpgSource {
  readonly providerId: ProviderId;
  listPrograms(window: EpgWindow): Promise<readonly EpgSourceProgram[]>;
}

export interface EpgProgramRepository {
  replaceWindow(
    providerId: ProviderId,
    window: EpgWindow,
    programs: readonly EpgProgram[],
  ): Promise<void>;

  listPrograms(
    providerId: ProviderId,
    channelId: ChannelId,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]>;

  deleteProvider(providerId: ProviderId): Promise<void>;
}

export interface EpgQuery {
  getCurrent(
    providerId: ProviderId,
    channelId: ChannelId,
    atMs: number,
  ): Promise<EpgProgram | null>;

  getNext(
    providerId: ProviderId,
    channelId: ChannelId,
    atMs: number,
  ): Promise<EpgProgram | null>;

  listWindow(
    providerId: ProviderId,
    channelId: ChannelId,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]>;
}
```

This contract intentionally keeps provider parsing/network credentials outside EPG domain records and intentionally does not add EPG methods to the existing `ProviderAdapter` yet. `EPG-PI` owns later provider capability integration.

- [ ] **Step 1: Write the RED contract acceptance import**

Create `player/test-ts/v1-rc-contracts.test.ts` with:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { EpgQuery, EpgSource } from '../src/epg/contracts.js';

void (null as unknown as EpgQuery);
void (null as unknown as EpgSource);

test('RC-F0 exposes EPG contracts without runtime side effects', () => {
  assert.equal(true, true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd player && npx tsx --test test-ts/v1-rc-contracts.test.ts
```

Expected: FAIL because `../src/epg/contracts.js` does not exist.

- [ ] **Step 3: Add the minimum EPG contract module**

Create `player/src/epg/contracts.ts` with the exact interface block above. Add no implementation functions and no provider-specific fields.

- [ ] **Step 4: Run focused test and typecheck**

Run:

```bash
cd player && npx tsx --test test-ts/v1-rc-contracts.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add player/src/epg/contracts.ts player/test-ts/v1-rc-contracts.test.ts
git commit -m "feat(rc-f0): define EPG shared contracts"
```

---

### Task 2: Freeze Favorites and Watch State contracts

**Files:**
- Create: `player/src/favorites/contracts.ts`
- Create: `player/src/watch/contracts.ts`
- Modify: `player/test-ts/v1-rc-contracts.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `ChannelId` from `player/src/domain/models.ts`.
- Produces:
  - `FavoriteRecord`
  - `FavoriteRepository`
  - `LastWatchedRecord`
  - `WatchAggregate`
  - `WatchStateRepository`

Use exactly:

```ts
// player/src/favorites/contracts.ts
import type { ChannelId, ProviderId } from '../domain/models.js';

export interface FavoriteRecord {
  providerId: ProviderId;
  channelId: ChannelId;
  addedAtMs: number;
}

export interface FavoriteRepository {
  list(providerId: ProviderId): Promise<readonly FavoriteRecord[]>;
  has(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  put(record: FavoriteRecord): Promise<void>;
  delete(providerId: ProviderId, channelId: ChannelId): Promise<void>;
  deleteProvider(providerId: ProviderId): Promise<void>;
}
```

```ts
// player/src/watch/contracts.ts
import type { ChannelId, ProviderId } from '../domain/models.js';

export interface LastWatchedRecord {
  providerId: ProviderId;
  channelId: ChannelId;
  lastPlayedAtMs: number;
}

export interface WatchAggregate {
  providerId: ProviderId;
  channelId: ChannelId;
  meaningfulWatchMs: number;
  meaningfulOpenCount: number;
  lastMeaningfulWatchAtMs: number | null;
}

export interface WatchStateRepository {
  getLastWatched(providerId: ProviderId): Promise<LastWatchedRecord | null>;
  setLastWatched(record: LastWatchedRecord): Promise<void>;
  getAggregate(
    providerId: ProviderId,
    channelId: ChannelId,
  ): Promise<WatchAggregate | null>;
  listAggregates(providerId: ProviderId): Promise<readonly WatchAggregate[]>;
  putAggregate(record: WatchAggregate): Promise<void>;
  deleteChannel(providerId: ProviderId, channelId: ChannelId): Promise<void>;
  deleteProvider(providerId: ProviderId): Promise<void>;
}
```

Do not define the frequently-watched scoring formula here. `WATCH-S` owns scoring behavior. Do not define persistence serialization here. `USER-P` owns durable representation.

- [ ] **Step 1: Extend the acceptance test to import the missing contracts**

Add:

```ts
import type { FavoriteRepository } from '../src/favorites/contracts.js';
import type { WatchStateRepository } from '../src/watch/contracts.js';

void (null as unknown as FavoriteRepository);
void (null as unknown as WatchStateRepository);
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
cd player && npx tsx --test test-ts/v1-rc-contracts.test.ts
```

Expected: FAIL because Favorites/Watch contract modules do not exist.

- [ ] **Step 3: Add exact Favorites and Watch State interfaces**

Create the two files with the exact definitions above. Do not add services, storage code, or UI behavior.

- [ ] **Step 4: Run focused test and typecheck**

```bash
cd player && npx tsx --test test-ts/v1-rc-contracts.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add player/src/favorites/contracts.ts player/src/watch/contracts.ts player/test-ts/v1-rc-contracts.test.ts
git commit -m "feat(rc-f0): define user-state contracts"
```

---

### Task 3: Add shared in-memory test doubles without production persistence

**Files:**
- Create: `player/test-ts/support/v1-rc-memory-repositories.ts`
- Modify: `player/test-ts/v1-rc-contracts.test.ts`

**Interfaces:**
- Consumes: `EpgProgramRepository`, `EpgWindow`, `FavoriteRepository`, `WatchStateRepository` plus existing domain IDs/models.
- Produces test-only:
  - `MemoryEpgProgramRepository`
  - `MemoryFavoriteRepository`
  - `MemoryWatchStateRepository`

The memory doubles are contract fixtures, not production feature implementations. They must preserve provider isolation and return copies/arrays that callers cannot mutate into stored state.

- [ ] **Step 1: Add RED behavioral acceptance for provider isolation**

Append to `player/test-ts/v1-rc-contracts.test.ts`:

```ts
import {
  MemoryEpgProgramRepository,
  MemoryFavoriteRepository,
  MemoryWatchStateRepository,
} from './support/v1-rc-memory-repositories.js';

test('RC-F0 memory repositories keep provider-owned state isolated', async () => {
  const favorites = new MemoryFavoriteRepository();
  await favorites.put({ providerId: 'p1', channelId: 'c1', addedAtMs: 10 });
  await favorites.put({ providerId: 'p2', channelId: 'c1', addedAtMs: 20 });

  assert.deepEqual(await favorites.list('p1'), [
    { providerId: 'p1', channelId: 'c1', addedAtMs: 10 },
  ]);

  const watch = new MemoryWatchStateRepository();
  await watch.setLastWatched({ providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 30 });
  assert.equal(await watch.getLastWatched('p2'), null);

  const epg = new MemoryEpgProgramRepository();
  await epg.replaceWindow(
    'p1',
    { startMs: 0, endMs: 100 },
    [{ channelId: 'c1', startMs: 0, endMs: 50, title: 'Program', description: null }],
  );
  assert.deepEqual(await epg.listPrograms('p2', 'c1', { startMs: 0, endMs: 100 }), []);
});
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
cd player && npx tsx --test test-ts/v1-rc-contracts.test.ts
```

Expected: FAIL because the support module does not exist.

- [ ] **Step 3: Implement the minimum memory doubles**

Create `player/test-ts/support/v1-rc-memory-repositories.ts`.

Use provider/channel composite keys based on existing `makeChannelKey(providerId, channelId)`. Keep EPG storage internally partitioned by provider; `replaceWindow()` replaces only programs for that provider that overlap the requested window, leaving other providers untouched. `listPrograms()` returns only the requested provider/channel and programs intersecting the requested window, sorted by `startMs` ascending.

Required class signatures:

```ts
export class MemoryEpgProgramRepository implements EpgProgramRepository { /* exact interface */ }
export class MemoryFavoriteRepository implements FavoriteRepository { /* exact interface */ }
export class MemoryWatchStateRepository implements WatchStateRepository { /* exact interface */ }
```

Minimum implementation rules:

```text
MemoryFavoriteRepository
- Map<providerId:channelId, FavoriteRecord>
- list(providerId) filters provider and returns addedAtMs ascending, then channelId lexical
- has() tests composite key
- put() replaces same provider/channel record
- delete() deletes one composite key
- deleteProvider() deletes only matching provider records

MemoryWatchStateRepository
- Map<ProviderId, LastWatchedRecord>
- Map<providerId:channelId, WatchAggregate>
- all getters return copied records
- deleteChannel() removes matching aggregate and clears last-watched only if it points at that channel
- deleteProvider() removes that provider's last-watched and aggregates only

MemoryEpgProgramRepository
- Map<ProviderId, EpgProgram[]>
- replaceWindow() removes existing records intersecting [startMs,endMs) for that provider, then inserts copies of supplied records
- listPrograms() filters provider/channel and intersection with [startMs,endMs)
- deleteProvider() removes only one provider partition
```

Window validity checks or normalization are intentionally **not** feature behavior in F0; first-wave EPG normalization/query workers own those rules.

- [ ] **Step 4: Run focused acceptance**

```bash
cd player && npx tsx --test test-ts/v1-rc-contracts.test.ts
```

Expected: all RC-F0 tests PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add player/test-ts/support/v1-rc-memory-repositories.ts player/test-ts/v1-rc-contracts.test.ts
git commit -m "test(rc-f0): add shared memory repository doubles"
```

---

### Task 4: Lock contract invariants needed by parallel workers

**Files:**
- Modify: `player/test-ts/v1-rc-contracts.test.ts`

**Interfaces:**
- Consumes all RC-F0 contracts/test doubles.
- Produces executable acceptance proving provider isolation, deletion boundaries, EPG half-open window fixture behavior, and no dependency on production IndexedDB changes.

- [ ] **Step 1: Add provider cleanup and mutation-safety tests**

Add tests equivalent to:

```ts
test('RC-F0 favorite deleteProvider cannot erase another provider', async () => {
  const repo = new MemoryFavoriteRepository();
  await repo.put({ providerId: 'p1', channelId: 'c1', addedAtMs: 1 });
  await repo.put({ providerId: 'p2', channelId: 'c1', addedAtMs: 2 });
  await repo.deleteProvider('p1');
  assert.equal(await repo.has('p1', 'c1'), false);
  assert.equal(await repo.has('p2', 'c1'), true);
});

test('RC-F0 watch deleteChannel clears only matching last watched state', async () => {
  const repo = new MemoryWatchStateRepository();
  await repo.setLastWatched({ providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 1 });
  await repo.putAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 1000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 1,
  });
  await repo.deleteChannel('p1', 'c1');
  assert.equal(await repo.getLastWatched('p1'), null);
  assert.equal(await repo.getAggregate('p1', 'c1'), null);
});

test('RC-F0 returned records cannot mutate memory repository state', async () => {
  const repo = new MemoryFavoriteRepository();
  await repo.put({ providerId: 'p1', channelId: 'c1', addedAtMs: 1 });
  const first = (await repo.list('p1'))[0];
  if (!first) throw new Error('favorite fixture missing');
  (first as { addedAtMs: number }).addedAtMs = 999;
  assert.equal((await repo.list('p1'))[0]?.addedAtMs, 1);
});
```

- [ ] **Step 2: Run focused RC-F0 acceptance**

```bash
cd player && npx tsx --test test-ts/v1-rc-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full TypeScript test suite**

```bash
npm run test:ts -w player
```

Expected: PASS with all pre-existing tests plus RC-F0 acceptance.

- [ ] **Step 4: Run full repository verification before final commit**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
```

Expected: all PASS. `npm run tizen:build` is not required by this contract-only F0 unless controller policy at execution time requires it; if run, record the real result.

- [ ] **Step 5: Verify forbidden files and scope**

Run:

```bash
git diff --name-only <EXACT_F0_BASE_SHA>...HEAD
```

Expected changed production files are only:

```text
player/src/epg/contracts.ts
player/src/favorites/contracts.ts
player/src/watch/contracts.ts
```

Expected changed test files are only:

```text
player/test-ts/support/v1-rc-memory-repositories.ts
player/test-ts/v1-rc-contracts.test.ts
```

If any storage schema, IndexedDB, provider runtime, main.js, Live TV, playback, credential, UI, package, or Tizen source appears, RC-F0 is out of scope and must not be marked ready.

- [ ] **Step 6: Commit Task 4 acceptance**

```bash
git add player/test-ts/v1-rc-contracts.test.ts
git commit -m "test(rc-f0): lock parallel contract invariants"
```

---

### Task 5: Exact-head evidence and fan-out handoff

**Files:**
- Modify after implementation only: `docs/verification/v1-parallel-execution.md`
- Modify after implementation only: `docs/verification/v1-rc-readiness.md`

**Interfaces:**
- Consumes exact RC-F0 branch head and CI evidence.
- Produces the single authoritative post-F0 fan-out base for first-wave workers.

- [ ] **Step 1: Open/update RC-F0 Draft PR**

PR body must record:

```text
base exact SHA
head exact SHA
changed files
focused RED evidence
focused GREEN evidence
full npm test result
TypeScript test count/result
npm run typecheck result
npm run brand:check result
npm run build result
forbidden-file scope audit
```

State explicitly that no EPG/Favorites/Search/watch/M3U/pairing/Home/UI behavior or IndexedDB migration is implemented.

- [ ] **Step 2: Require exact-head CI**

Do not use a workflow run from an earlier head. Record the exact-head `verify` run ID and conclusion.

Expected: SUCCESS before Ready/merge consideration.

- [ ] **Step 3: Controller review**

Controller verifies:

```text
- only five planned source/test files changed before verification-doc updates
- contracts match this plan exactly unless an approved plan amendment exists
- no runtime integration slipped in
- no IndexedDB schema/version change exists
- no provider/playback/credential semantics changed
- no secrets/URLs/tokens appear in source or evidence
- exact-head CI is GREEN
```

- [ ] **Step 4: Merge only with explicit user/controller authority**

After merge, wait for post-merge `main` verify to complete and record its exact SHA/run.

- [ ] **Step 5: Update canonical fan-out base**

Only after post-merge `main` is GREEN, update `docs/verification/v1-parallel-execution.md` so first-wave roles use one exact shared base:

```text
RC-F0 = CLOSED GREEN
FIRST_WAVE_BASE = <post-F0 exact main SHA>
FIRST_WAVE_VERIFY = <post-F0 verify run ID> SUCCESS
```

Then the controller may open approved first-wave roles such as:

```text
EPG-N
EPG-X
EPG-XML
EPG-MAP
EPG-Q
FAV-D
SRCH-C
M3U-V
WATCH-R
WATCH-S
PAIR-C
PAIR-S
PAIR-R
```

`PAIR-WEB` remains closed until its pairing payload/interface design is explicitly frozen.

---

## Plan Self-Review Checklist

Before declaring this plan ready for execution, verify:

- Every RC-F0 responsibility from the maximum-parallel design maps to a task above.
- No feature implementation is hidden inside the foundation.
- No production IndexedDB schema migration is required by the plan.
- EPG contracts do not contain provider credentials or transport URLs.
- Favorites and Watch State are explicitly provider-scoped.
- Frequently-watched scoring is deferred to `WATCH-S`.
- Provider EPG capability integration is deferred to `EPG-PI`.
- Actual EPG persistence is deferred to `EPG-P`.
- Actual Favorites/watch durable persistence is deferred to `USER-P`.
- Test doubles are test-only and do not become runtime dependencies.
- All named interfaces are defined exactly once and use existing domain ID types.
- There are no placeholders such as TBD/TODO/implement-later instructions.

## Execution Handoff

RC-F0 is the only serial production gate before maximum fan-out. It must be merged and followed by a GREEN `main` before first-wave feature branches are created.

Recommended worker command after this plan is approved and documentation is integrated:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=RC-F0.
```
