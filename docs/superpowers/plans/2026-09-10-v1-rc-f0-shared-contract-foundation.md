# BabuşTV V1 RC-F0 Shared Contract Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the smallest shared EPG, Favorites, Watch State, and structured-persistence seams required for the first maximum-parallel V1 RC production wave, without implementing feature behavior or changing user-visible runtime composition.

**Architecture:** RC-F0 is an additive contract-and-test-double package. It introduces provider-scoped repository interfaces, EPG capability/input contracts, and a declarative future structured-store schema descriptor while deliberately avoiding real IndexedDB migration, provider-specific EPG parsing, Favorites/Search/watch behavior, pairing behavior, UI, playback, or application wiring. After RC-F0 merges and the resulting `main` is GREEN, first-wave workers branch from that one exact post-F0 SHA and consume these frozen interfaces rather than editing shared hot-zone files independently.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx --test`, existing BabuşTV domain/provider/repository abstractions, Vite build.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- Execute only after PR #33 and the maximum-parallel execution documentation are integrated and the resulting `main` is exact-head GREEN.
- Production branch name: `foundation/v1-rc-contracts`.
- Branch from the then-current exact GREEN `main`; never branch production work from `docs/v1-rc-roadmap`, `docs/v1-maximum-parallel-execution`, or historical worker/evidence branches.
- RC-F0 must not implement EPG ingestion, EPG normalization behavior, Favorites behavior, Search behavior, watch scoring, M3U onboarding behavior, pairing behavior, Home, or user-facing UI.
- Do not modify `player/src/main.js`, `player/index.html`, Live TV controller/view/runtime composition, playback/session code, remote semantics, Settings UI, global copy, package metadata, or Tizen packaging identity.
- Do not perform the actual IndexedDB V1 RC feature-store migration in RC-F0. EPG-P and USER-P own real persistence migrations later.
- Credentials, credential-bearing provider URLs, transient stream URLs, tokens, or real provider fixtures must not appear in source, tests, logs, or evidence.
- Provider-scoped channel identity reuses `makeChannelKey(providerId, channelId)` from `player/src/domain/models.ts`; do not introduce a competing identity format.
- Existing M3 invariants remain untouched: highlight is not playback, last intent wins, and playback/recovery ownership stays behind existing boundaries.
- TDD is mandatory: focused RED → minimum implementation → focused GREEN → full regression/typecheck/build/brand gates → exact-head CI.
- No new runtime dependency.

---

### Task 1: Freeze EPG source, capability, and repository contracts

**Files:**
- Create: `player/src/epg/contracts.ts`
- Create: `player/test-ts/rc-f0-epg-contracts.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `ChannelId`, `EpgProgram` from `player/src/domain/models.ts`.
- Produces:
  - `EpgWindow`
  - `EpgSourceChannelRef`
  - `EpgSourceProgram`
  - `EpgRepository`
  - `EpgProviderCapability`
  - `hasEpgProviderCapability(value)`
- Later consumers: EPG-N, EPG-X, EPG-XML, EPG-MAP, EPG-Q, EPG-P, EPG-PI.

- [ ] **Step 1: Write the failing EPG contract test**

Create `player/test-ts/rc-f0-epg-contracts.test.ts` with a compile-and-runtime acceptance that imports the new module and verifies the capability guard without touching `ProviderAdapter`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { EpgProgram } from '../src/domain/models.js';
import {
  hasEpgProviderCapability,
  type EpgProviderCapability,
  type EpgRepository,
  type EpgSourceProgram,
  type EpgWindow,
} from '../src/epg/contracts.js';

void test('RC-F0 exposes an optional EPG capability without widening ProviderAdapter', async () => {
  const window: EpgWindow = { startMs: 1_789_000_000_000, endMs: 1_789_086_400_000 };
  const sourceProgram: EpgSourceProgram = {
    sourceChannel: {
      providerChannelId: '100',
      tvgId: 'trt1.tr',
      name: 'TRT 1',
    },
    startMs: window.startMs,
    endMs: window.startMs + 3_600_000,
    title: 'Haber',
    description: null,
  };

  const capability: EpgProviderCapability = {
    listEpg: async () => [sourceProgram],
  };

  assert.equal(hasEpgProviderCapability(capability), true);
  assert.equal(hasEpgProviderCapability({}), false);
  assert.deepEqual(await capability.listEpg(window), [sourceProgram]);

  const repository: EpgRepository = {
    replaceProviderWindow: async () => {},
    listChannelPrograms: async () => [] as readonly EpgProgram[],
    removeProviderEpg: async () => {},
  };
  assert.deepEqual(await repository.listChannelPrograms('provider-a', 'channel-1', window), []);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0 exposes an optional EPG capability"
```

Expected: FAIL because `../src/epg/contracts.js` does not exist.

- [ ] **Step 3: Add the minimum EPG contract module**

Create `player/src/epg/contracts.ts`:

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

export interface EpgSourceChannelRef {
  providerChannelId: string | null;
  tvgId: string | null;
  name: string | null;
}

export interface EpgSourceProgram {
  sourceChannel: EpgSourceChannelRef;
  startMs: number;
  endMs: number;
  title: string;
  description: string | null;
}

export interface EpgRepository {
  replaceProviderWindow(
    providerId: ProviderId,
    window: EpgWindow,
    programs: readonly EpgProgram[],
  ): Promise<void>;

  listChannelPrograms(
    providerId: ProviderId,
    channelId: ChannelId,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]>;

  removeProviderEpg(providerId: ProviderId): Promise<void>;
}

export interface EpgProviderCapability {
  listEpg(window: EpgWindow): Promise<readonly EpgSourceProgram[]>;
}

export function hasEpgProviderCapability(value: unknown): value is EpgProviderCapability {
  if (value === null || typeof value !== 'object') return false;
  return typeof (value as { listEpg?: unknown }).listEpg === 'function';
}
```

Do not edit `player/src/providers/contracts.ts` in this task. EPG remains an optional capability so EPG failure does not become a mandatory channel/playback capability.

- [ ] **Step 4: Run focused GREEN and typecheck**

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0 exposes an optional EPG capability"
npm run typecheck -w player
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add player/src/epg/contracts.ts player/test-ts/rc-f0-epg-contracts.test.ts
git commit -m "feat(rc-f0): freeze EPG contracts"
```

---

### Task 2: Freeze Favorites repository contract and memory test double

**Files:**
- Create: `player/src/favorites/contracts.ts`
- Create: `player/src/favorites/memory-favorite-repository.ts`
- Create: `player/test-ts/rc-f0-favorites-contracts.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `ChannelId`, `makeChannelKey` from `player/src/domain/models.ts`.
- Produces:
  - `FavoriteRecord`
  - `FavoriteRepository`
  - `MemoryFavoriteRepository`
- Later consumers: FAV-D, USER-P, FAV-UI, HOME-D.

- [ ] **Step 1: Write the failing Favorites seam test**

Create `player/test-ts/rc-f0-favorites-contracts.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChannelKey } from '../src/domain/models.js';
import { MemoryFavoriteRepository } from '../src/favorites/memory-favorite-repository.js';

void test('RC-F0 favorite test double scopes identical channel IDs by provider', async () => {
  const repository = new MemoryFavoriteRepository();

  await repository.save({ providerId: 'provider-a', channelId: 'shared', addedAtMs: 100 });
  await repository.save({ providerId: 'provider-b', channelId: 'shared', addedAtMs: 200 });

  assert.equal(makeChannelKey('provider-a', 'shared'), 'provider-a:shared');
  assert.deepEqual(await repository.list('provider-a'), [
    { providerId: 'provider-a', channelId: 'shared', addedAtMs: 100 },
  ]);
  assert.equal(await repository.has('provider-a', 'shared'), true);
  assert.equal(await repository.has('provider-a', 'missing'), false);

  await repository.remove('provider-a', 'shared');
  assert.deepEqual(await repository.list('provider-a'), []);
  assert.equal(await repository.has('provider-b', 'shared'), true);
});
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0 favorite test double"
```

Expected: FAIL because the Favorites modules do not exist.

- [ ] **Step 3: Add the minimum Favorites contracts**

Create `player/src/favorites/contracts.ts`:

```ts
import type { ChannelId, ProviderId } from '../domain/models.js';

export interface FavoriteRecord {
  providerId: ProviderId;
  channelId: ChannelId;
  addedAtMs: number;
}

export interface FavoriteRepository {
  list(providerId: ProviderId): Promise<readonly FavoriteRecord[]>;
  has(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  save(record: FavoriteRecord): Promise<void>;
  remove(providerId: ProviderId, channelId: ChannelId): Promise<void>;
  removeProviderFavorites(providerId: ProviderId): Promise<void>;
}
```

- [ ] **Step 4: Add only the memory test double, not Favorites behavior**

Create `player/src/favorites/memory-favorite-repository.ts`:

```ts
import { makeChannelKey } from '../domain/models.js';
import type { ChannelId, ProviderId } from '../domain/models.js';
import type { FavoriteRecord, FavoriteRepository } from './contracts.js';

export class MemoryFavoriteRepository implements FavoriteRepository {
  private readonly records = new Map<string, FavoriteRecord>();

  async list(providerId: ProviderId): Promise<readonly FavoriteRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => record.providerId === providerId)
      .sort((a, b) => a.addedAtMs - b.addedAtMs)
      .map((record) => ({ ...record }));
  }

  async has(providerId: ProviderId, channelId: ChannelId): Promise<boolean> {
    return this.records.has(makeChannelKey(providerId, channelId));
  }

  async save(record: FavoriteRecord): Promise<void> {
    this.records.set(makeChannelKey(record.providerId, record.channelId), { ...record });
  }

  async remove(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    this.records.delete(makeChannelKey(providerId, channelId));
  }

  async removeProviderFavorites(providerId: ProviderId): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.providerId === providerId) this.records.delete(key);
    }
  }
}
```

This class is a deterministic worker/test seam. Do not add toggle semantics, channel reconciliation rules, UI, or durable storage here; FAV-D and USER-P own those later.

- [ ] **Step 5: Run focused GREEN and typecheck**

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0 favorite test double"
npm run typecheck -w player
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add player/src/favorites player/test-ts/rc-f0-favorites-contracts.test.ts
git commit -m "feat(rc-f0): freeze favorite repository seam"
```

---

### Task 3: Freeze Watch State repository contract and memory test double

**Files:**
- Create: `player/src/watch/contracts.ts`
- Create: `player/src/watch/memory-watch-state-repository.ts`
- Create: `player/test-ts/rc-f0-watch-contracts.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `ChannelId`, `makeChannelKey` from `player/src/domain/models.ts`.
- Produces:
  - `LastWatchedRecord`
  - `WatchStatsRecord`
  - `WatchStateRepository`
  - `MemoryWatchStateRepository`
- Later consumers: WATCH-R, WATCH-S, USER-P, WATCH-I, HOME-D.

- [ ] **Step 1: Write the failing Watch State seam test**

Create `player/test-ts/rc-f0-watch-contracts.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryWatchStateRepository } from '../src/watch/memory-watch-state-repository.js';

void test('RC-F0 watch-state test double keeps last-watched and stats provider scoped', async () => {
  const repository = new MemoryWatchStateRepository();

  await repository.saveLastWatched({
    providerId: 'provider-a',
    channelId: 'shared',
    lastPlayedAtMs: 300,
  });
  await repository.saveLastWatched({
    providerId: 'provider-b',
    channelId: 'shared',
    lastPlayedAtMs: 400,
  });
  await repository.saveStats({
    providerId: 'provider-a',
    channelId: 'shared',
    meaningfulOpenCount: 2,
    totalWatchMs: 120_000,
    lastPlayedAtMs: 300,
  });

  assert.deepEqual(await repository.getLastWatched('provider-a'), {
    providerId: 'provider-a',
    channelId: 'shared',
    lastPlayedAtMs: 300,
  });
  assert.deepEqual(await repository.listStats('provider-a'), [{
    providerId: 'provider-a',
    channelId: 'shared',
    meaningfulOpenCount: 2,
    totalWatchMs: 120_000,
    lastPlayedAtMs: 300,
  }]);
  assert.deepEqual(await repository.listStats('provider-b'), []);

  await repository.removeProviderWatchState('provider-a');
  assert.equal(await repository.getLastWatched('provider-a'), null);
  assert.deepEqual(await repository.listStats('provider-a'), []);
  assert.notEqual(await repository.getLastWatched('provider-b'), null);
});
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0 watch-state test double"
```

Expected: FAIL because the Watch State modules do not exist.

- [ ] **Step 3: Add the minimum Watch State contracts**

Create `player/src/watch/contracts.ts`:

```ts
import type { ChannelId, ProviderId } from '../domain/models.js';

export interface LastWatchedRecord {
  providerId: ProviderId;
  channelId: ChannelId;
  lastPlayedAtMs: number;
}

export interface WatchStatsRecord {
  providerId: ProviderId;
  channelId: ChannelId;
  meaningfulOpenCount: number;
  totalWatchMs: number;
  lastPlayedAtMs: number;
}

export interface WatchStateRepository {
  getLastWatched(providerId: ProviderId): Promise<LastWatchedRecord | null>;
  saveLastWatched(record: LastWatchedRecord): Promise<void>;
  listStats(providerId: ProviderId): Promise<readonly WatchStatsRecord[]>;
  getStats(providerId: ProviderId, channelId: ChannelId): Promise<WatchStatsRecord | null>;
  saveStats(record: WatchStatsRecord): Promise<void>;
  removeProviderWatchState(providerId: ProviderId): Promise<void>;
}
```

Do not encode scoring weights, meaningful-watch thresholds, session timers, or playback semantics here.

- [ ] **Step 4: Add the minimum memory Watch State test double**

Create `player/src/watch/memory-watch-state-repository.ts`:

```ts
import { makeChannelKey } from '../domain/models.js';
import type { ChannelId, ProviderId } from '../domain/models.js';
import type {
  LastWatchedRecord,
  WatchStateRepository,
  WatchStatsRecord,
} from './contracts.js';

export class MemoryWatchStateRepository implements WatchStateRepository {
  private readonly lastWatched = new Map<ProviderId, LastWatchedRecord>();
  private readonly stats = new Map<string, WatchStatsRecord>();

  async getLastWatched(providerId: ProviderId): Promise<LastWatchedRecord | null> {
    const record = this.lastWatched.get(providerId);
    return record ? { ...record } : null;
  }

  async saveLastWatched(record: LastWatchedRecord): Promise<void> {
    this.lastWatched.set(record.providerId, { ...record });
  }

  async listStats(providerId: ProviderId): Promise<readonly WatchStatsRecord[]> {
    return Array.from(this.stats.values())
      .filter((record) => record.providerId === providerId)
      .map((record) => ({ ...record }));
  }

  async getStats(providerId: ProviderId, channelId: ChannelId): Promise<WatchStatsRecord | null> {
    const record = this.stats.get(makeChannelKey(providerId, channelId));
    return record ? { ...record } : null;
  }

  async saveStats(record: WatchStatsRecord): Promise<void> {
    this.stats.set(makeChannelKey(record.providerId, record.channelId), { ...record });
  }

  async removeProviderWatchState(providerId: ProviderId): Promise<void> {
    this.lastWatched.delete(providerId);
    for (const [key, record] of this.stats) {
      if (record.providerId === providerId) this.stats.delete(key);
    }
  }
}
```

- [ ] **Step 5: Run focused GREEN and typecheck**

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0 watch-state test double"
npm run typecheck -w player
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add player/src/watch player/test-ts/rc-f0-watch-contracts.test.ts
git commit -m "feat(rc-f0): freeze watch-state repository seam"
```

---

### Task 4: Freeze future V1 RC structured-store schema ownership without migrating IndexedDB

**Files:**
- Create: `player/src/storage/v1-rc-store-schema.ts`
- Create: `player/test-ts/rc-f0-store-schema.test.ts`
- Do not modify: `player/src/storage/contracts.ts`
- Do not modify: `player/src/storage/indexeddb-structured-store.ts`
- Do not modify: `player/src/storage/memory-structured-store.ts`

**Interfaces:**
- Produces:
  - `V1RcFeatureStoreName`
  - `V1RcFeatureStoreIndex`
  - `V1RcFeatureStoreDefinition`
  - `V1_RC_FEATURE_STORE_SCHEMA`
- Later consumers: EPG-P, USER-P, MIG.

- [ ] **Step 1: Write the failing schema-descriptor acceptance**

Create `player/test-ts/rc-f0-store-schema.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { V1_RC_FEATURE_STORE_SCHEMA } from '../src/storage/v1-rc-store-schema.js';

void test('RC-F0 reserves non-conflicting V1 feature store names and provider indexes', () => {
  assert.deepEqual(V1_RC_FEATURE_STORE_SCHEMA, [
    {
      name: 'epg_programs',
      keyPath: 'key',
      indexes: [
        { name: 'providerId', keyPath: 'providerId' },
        { name: 'providerChannel', keyPath: 'providerChannelKey' },
      ],
    },
    {
      name: 'favorites',
      keyPath: 'key',
      indexes: [{ name: 'providerId', keyPath: 'providerId' }],
    },
    {
      name: 'watch_state',
      keyPath: 'key',
      indexes: [{ name: 'providerId', keyPath: 'providerId' }],
    },
  ]);
  assert.equal(new Set(V1_RC_FEATURE_STORE_SCHEMA.map((store) => store.name)).size, 3);
});
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0 reserves non-conflicting V1 feature store names"
```

Expected: FAIL because `v1-rc-store-schema.ts` does not exist.

- [ ] **Step 3: Add the declarative schema descriptor only**

Create `player/src/storage/v1-rc-store-schema.ts`:

```ts
export type V1RcFeatureStoreName = 'epg_programs' | 'favorites' | 'watch_state';

export interface V1RcFeatureStoreIndex {
  name: string;
  keyPath: string;
}

export interface V1RcFeatureStoreDefinition {
  name: V1RcFeatureStoreName;
  keyPath: 'key';
  indexes: readonly V1RcFeatureStoreIndex[];
}

export const V1_RC_FEATURE_STORE_SCHEMA = [
  {
    name: 'epg_programs',
    keyPath: 'key',
    indexes: [
      { name: 'providerId', keyPath: 'providerId' },
      { name: 'providerChannel', keyPath: 'providerChannelKey' },
    ],
  },
  {
    name: 'favorites',
    keyPath: 'key',
    indexes: [{ name: 'providerId', keyPath: 'providerId' }],
  },
  {
    name: 'watch_state',
    keyPath: 'key',
    indexes: [{ name: 'providerId', keyPath: 'providerId' }],
  },
] as const satisfies readonly V1RcFeatureStoreDefinition[];
```

Important: this reserves names and index conventions only. Do not widen `StructuredStoreName`, bump `DATABASE_VERSION`, or create object stores in RC-F0. That work remains serialized under EPG-P / USER-P / MIG so two parallel workers cannot independently choose conflicting IndexedDB versions.

- [ ] **Step 4: Run focused GREEN and typecheck**

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0 reserves non-conflicting V1 feature store names"
npm run typecheck -w player
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add player/src/storage/v1-rc-store-schema.ts player/test-ts/rc-f0-store-schema.test.ts
git commit -m "feat(rc-f0): reserve V1 feature store schema"
```

---

### Task 5: Add one cross-lane compile contract proving first-wave independence

**Files:**
- Create: `player/test-ts/rc-f0-parallel-contract.test.ts`
- Read only: `player/src/domain/models.ts`
- Read only: `player/src/epg/contracts.ts`
- Read only: `player/src/favorites/contracts.ts`
- Read only: `player/src/watch/contracts.ts`
- Read only: `player/src/storage/v1-rc-store-schema.ts`

**Interfaces:**
- Consumes all RC-F0 outputs.
- Produces no runtime API; this test is the contract-lock gate for first-wave worker branching.

- [ ] **Step 1: Write the cross-lane compile/runtime test**

Create `player/test-ts/rc-f0-parallel-contract.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChannelKey } from '../src/domain/models.js';
import type { EpgRepository } from '../src/epg/contracts.js';
import type { FavoriteRepository } from '../src/favorites/contracts.js';
import type { WatchStateRepository } from '../src/watch/contracts.js';
import { V1_RC_FEATURE_STORE_SCHEMA } from '../src/storage/v1-rc-store-schema.js';

void test('RC-F0 contracts let EPG Favorites and Watch workers share identity without shared implementation', () => {
  const channelKey = makeChannelKey('provider-a', 'channel-7');
  assert.equal(channelKey, 'provider-a:channel-7');
  assert.deepEqual(
    V1_RC_FEATURE_STORE_SCHEMA.map((store) => store.name),
    ['epg_programs', 'favorites', 'watch_state'],
  );

  type RequiredContracts = [EpgRepository, FavoriteRepository, WatchStateRepository];
  const contractCount: RequiredContracts['length'] = 3;
  assert.equal(contractCount, 3);
});
```

This test must not import `main.js`, Live TV UI, IndexedDB implementation, Provider Core service, playback code, or any future feature implementation.

- [ ] **Step 2: Run the complete RC-F0 focused suite**

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0"
```

Expected: all RC-F0 tests PASS.

- [ ] **Step 3: Run full repository regression gates**

Run exactly:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
```

Expected: PASS for all commands. `tizen:package` is not required for this contract-only foundation unless the controller explicitly adds it; RC-F0 does not change package/Tizen staging sources.

- [ ] **Step 4: Verify planned-file scope**

Run:

```bash
git diff --name-only HEAD~4..HEAD
```

Expected production/test scope is limited to:

```text
player/src/epg/contracts.ts
player/src/favorites/contracts.ts
player/src/favorites/memory-favorite-repository.ts
player/src/watch/contracts.ts
player/src/watch/memory-watch-state-repository.ts
player/src/storage/v1-rc-store-schema.ts
player/test-ts/rc-f0-epg-contracts.test.ts
player/test-ts/rc-f0-favorites-contracts.test.ts
player/test-ts/rc-f0-watch-contracts.test.ts
player/test-ts/rc-f0-store-schema.test.ts
player/test-ts/rc-f0-parallel-contract.test.ts
```

If evidence/status docs are updated in the final task, they are allowed in addition to this list. Any change to `main.js`, Live TV composition, IndexedDB implementation, provider-specific adapters, playback, remote, package metadata, or UI is scope drift and must be removed before review.

- [ ] **Step 5: Commit Task 5**

```bash
git add player/test-ts/rc-f0-parallel-contract.test.ts
git commit -m "test(rc-f0): lock parallel worker contracts"
```

---

### Task 6: Record exact-head evidence and hand off the fan-out baseline

**Files:**
- Modify: `docs/verification/v1-parallel-execution.md`
- Modify: `docs/verification/v1-rc-readiness.md`
- Modify only if controller state materially changes: `docs/verification/parallel-development-control.md`

**Interfaces:**
- Consumes: final RC-F0 exact head and CI evidence.
- Produces: one authoritative post-F0 fan-out base for EPG-N, EPG-X, EPG-XML, EPG-MAP, EPG-Q, FAV-D, SRCH-C, M3U-V, WATCH-R, WATCH-S, PAIR-C, PAIR-S, PAIR-R, and optionally PAIR-WEB when its pairing UI input contracts are frozen.

- [ ] **Step 1: Update readiness status without opening workers early**

Before merge, record RC-F0 as `IN PROGRESS` or `READY FOR CONTROLLER REVIEW` with:

- branch `foundation/v1-rc-contracts`;
- exact base SHA;
- exact head SHA;
- focused RC-F0 test result;
- full `npm test` result;
- typecheck/brand/build/tizen:build results;
- changed-file scope;
- statement that no user-visible feature behavior was added.

Do not write the future post-merge fan-out SHA yet.

- [ ] **Step 2: Open or update the Draft PR**

PR body must contain:

```text
Scope: RC-F0 shared contract foundation only.
Feature behavior: none.
IndexedDB migration: none.
Runtime/UI composition: none.
Parallel fan-out: remains blocked until this PR merges and resulting main is GREEN.
```

Include exact base/head and all verification evidence.

- [ ] **Step 3: Require exact-head CI and controller review**

Exact-head CI must be SUCCESS before Ready/merge consideration. Controller reviews:

- contract names and signatures;
- no duplicated provider/channel identity scheme;
- no actual feature-store migration;
- no provider-specific implementation;
- no runtime composition changes;
- no secret-bearing fixtures/logs;
- planned-file scope.

Critical/Important findings return the branch to RED → minimum fix → GREEN.

- [ ] **Step 4: Merge only with explicit authority, then verify resulting main**

After explicit merge authority, merge RC-F0 using the repository/controller-selected method. Then run/observe post-merge `main` verification and record the exact resulting GREEN SHA.

Only that exact post-F0 GREEN SHA becomes the common first-wave fan-out base.

- [ ] **Step 5: Open the first-wave roles in the board**

After post-merge GREEN only, update `docs/verification/v1-parallel-execution.md` so these roles become `OPEN` with the same base SHA:

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

`PAIR-WEB` becomes `OPEN` only if its bounded pairing UI contract is already frozen; otherwise leave it `WAITING`.

Recommended active concurrency is 8–12 workers even if all eligible roles are OPEN.

- [ ] **Step 6: Final documentation commit**

```bash
git add docs/verification/v1-parallel-execution.md docs/verification/v1-rc-readiness.md docs/verification/parallel-development-control.md
git commit -m "docs(rc-f0): record shared foundation evidence"
```

Omit unchanged docs from the commit rather than touching them mechanically.

---

## Plan Self-Review Result

### Spec coverage

- Shared EPG source/query boundary: Task 1.
- Provider EPG capability without coupling ordinary ProviderAdapter availability: Task 1.
- Provider-scoped Favorites repository seam and worker test double: Task 2.
- Provider-scoped Watch State repository seam and worker test double: Task 3.
- One identity convention using existing `makeChannelKey`: Tasks 2, 3, and 5.
- Future structured-store names/index ownership without actual migration: Task 4.
- No central runtime/IndexedDB/UI composition edits: enforced in Global Constraints and Tasks 4–5.
- First-wave common exact GREEN fan-out base: Task 6.
- RED → GREEN → full regression → exact-head CI → controller review: every task plus Task 6.

### Deliberately excluded from RC-F0

The following remain owned by later bounded roles and must not be pulled into this plan: EPG normalization/parser/mapping/query behavior, Xtream/XMLTV network/data implementation, actual EPG/Favorites/Watch IndexedDB persistence, Favorites services, search, watch scoring, M3U onboarding, pairing crypto/session/relay, Home, UI/composition, playback/recovery changes, remote changes, and Tizen physical acceptance.

### Type consistency

The plan uses the existing `ProviderId`, `ChannelId`, `EpgProgram`, and `makeChannelKey` definitions. EPG provider scope is carried by repository method parameters rather than mutating `EpgProgram`. Favorites and Watch State use the same provider/channel key convention. Feature-store names are reserved declaratively but are not added to the active `StructuredStoreName` union until the serialized persistence integration owns the actual migration.
