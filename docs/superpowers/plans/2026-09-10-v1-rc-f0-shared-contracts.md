# BabuşTV V1 RC-F0 Shared Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the minimum shared TypeScript contracts and test-only memory seams needed to fan BabuşTV V1 RC work out into independent EPG, Favorites, Search, M3U, Watch State, and Pairing lanes without forcing those workers into shared runtime or IndexedDB files.

**Architecture:** RC-F0 is deliberately contract-only. It creates three focused production contract modules plus one test-support module and one acceptance test. It does not implement feature behavior, provider-specific EPG parsing, persistence migrations, Provider Core/runtime composition, UI, pairing, M3U onboarding, or playback changes. Real persistence remains owned by the later single-owner `EPG-P` and `USER-P` integration packages.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`, existing BabuşTV domain types, framework-free modules.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- Production branch: `foundation/v1-rc-contracts`.
- Start only from the exact GREEN `main` produced after the RC roadmap and maximum-parallel documentation are integrated.
- No development directly on `main` and no production work from a docs branch.
- TDD is mandatory: strict compile RED where contracts do not yet exist → minimum contract implementation → focused GREEN → full regression/typecheck/build gates.
- RC-F0 must not implement EPG normalization/query behavior, Favorites behavior, Search behavior, watch scoring, M3U onboarding behavior, Pairing behavior, Home, or user-visible UI.
- Do not modify `player/src/main.js`, `player/index.html`, `player/src/live-tv/*`, playback/session code, credential-store implementations, provider runtime composition, Settings UI, package metadata, or Tizen packaging identity.
- Do not modify `player/src/storage/contracts.ts`, `player/src/storage/indexeddb-structured-store.ts`, or `player/src/storage/memory-structured-store.ts`; do not bump IndexedDB `DATABASE_VERSION` and do not create feature object stores in F0.
- Do not widen the existing `ProviderAdapter` in F0. Provider EPG capability integration belongs to `EPG-PI`.
- Provider-scoped identity is explicit. Reuse existing `ProviderId`, `ChannelId`, `EpgProgram`, and `makeChannelKey()` from `player/src/domain/models.ts`.
- No provider secrets, credential-bearing URLs, transient stream URLs, tokens, decrypted pairing payloads, or real provider fixtures may appear in source, tests, logs, or evidence.
- No new npm dependency.
- Existing M3 invariants remain untouched: highlight is not playback, last intent wins, and playback/recovery ownership remains behind existing boundaries.

---

## Planned File Ownership

Create only these production files:

- `player/src/epg/contracts.ts`
- `player/src/favorites/contracts.ts`
- `player/src/watch/contracts.ts`

Create only these test files:

- `player/test-ts/support/v1-rc-memory-repositories.ts`
- `player/test-ts/v1-rc-contracts.test.ts`

Evidence/status documentation may be updated only after implementation verification. Any other production/test file in the RC-F0 diff is scope drift unless this plan is explicitly amended by the controller first.

---

### Task 1: Freeze the EPG contracts

**Files:**
- Create: `player/src/epg/contracts.ts`
- Create: `player/test-ts/v1-rc-contracts.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `ChannelId`, `EpgProgram`.
- Produces: `EpgWindow`, `EpgSourceChannelRef`, `EpgSourceProgram`, `EpgChannelDescriptor`, `EpgSource`, `EpgProgramRepository`, `EpgQuery`.
- Later consumers: `EPG-N`, `EPG-X`, `EPG-XML`, `EPG-MAP`, `EPG-Q`, `EPG-P`, `EPG-PI`.

- [ ] **Step 1: Write the compile RED acceptance**

Create `player/test-ts/v1-rc-contracts.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  EpgProgramRepository,
  EpgQuery,
  EpgSource,
  EpgSourceProgram,
  EpgWindow,
} from '../src/epg/contracts.js';

void (null as unknown as EpgProgramRepository);
void (null as unknown as EpgQuery);
void (null as unknown as EpgSource);
void (null as unknown as EpgSourceProgram);
void (null as unknown as EpgWindow);

test('RC-F0 contract suite loads without runtime side effects', () => {
  assert.equal(true, true);
});
```

- [ ] **Step 2: Prove RED with the strict TypeScript gate**

Run:

```bash
npm run typecheck -w player
```

Expected: FAIL with TypeScript module-resolution error for `../src/epg/contracts.js` because the contract module does not exist yet.

Do not use `tsx --test` alone as the RED proof for a type-only import; `tsx` is a runtime transpilation/test path, not the repository's strict typecheck gate.

- [ ] **Step 3: Add the minimum EPG contract module**

Create `player/src/epg/contracts.ts` exactly as follows:

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

The three source-channel hints are intentionally transport-neutral. They are enough for Xtream/XMLTV/channel-mapping workers without putting credentials, playlist URLs, or provider-specific HTTP details into the shared domain seam.

- [ ] **Step 4: Prove GREEN**

Run:

```bash
npm run typecheck -w player
npm run test:ts -w player -- --test-name-pattern="RC-F0 contract suite"
```

Expected: both PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add player/src/epg/contracts.ts player/test-ts/v1-rc-contracts.test.ts
git commit -m "feat(rc-f0): freeze EPG contracts"
```

---

### Task 2: Freeze Favorites and Watch State contracts

**Files:**
- Create: `player/src/favorites/contracts.ts`
- Create: `player/src/watch/contracts.ts`
- Modify: `player/test-ts/v1-rc-contracts.test.ts`

**Interfaces:**
- Produces Favorites: `FavoriteRecord`, `FavoriteRepository`.
- Produces Watch State: `LastWatchedRecord`, `WatchAggregate`, `WatchStateRepository`.
- Later consumers: `FAV-D`, `USER-P`, `FAV-UI`, `HOME-D`, `WATCH-R`, `WATCH-S`, `WATCH-I`.

- [ ] **Step 1: Extend the compile acceptance with missing user-state modules**

Add to `player/test-ts/v1-rc-contracts.test.ts`:

```ts
import type { FavoriteRepository } from '../src/favorites/contracts.js';
import type { WatchStateRepository } from '../src/watch/contracts.js';

void (null as unknown as FavoriteRepository);
void (null as unknown as WatchStateRepository);
```

- [ ] **Step 2: Prove RED with typecheck**

Run:

```bash
npm run typecheck -w player
```

Expected: FAIL because `../src/favorites/contracts.js` and `../src/watch/contracts.js` do not exist.

- [ ] **Step 3: Add exact Favorites contract**

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
  put(record: FavoriteRecord): Promise<void>;
  delete(providerId: ProviderId, channelId: ChannelId): Promise<void>;
  deleteProvider(providerId: ProviderId): Promise<void>;
}
```

Do not add toggle behavior or reconciliation here; `FAV-D` owns those semantics.

- [ ] **Step 4: Add exact Watch State contract**

Create `player/src/watch/contracts.ts`:

```ts
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

Do not add scoring weights, session timers, or meaningful-watch thresholds. `WATCH-S` and `WATCH-R` own those behaviors.

- [ ] **Step 5: Prove GREEN and commit**

Run:

```bash
npm run typecheck -w player
npm run test:ts -w player -- --test-name-pattern="RC-F0 contract suite"
```

Expected: PASS.

Then:

```bash
git add player/src/favorites/contracts.ts player/src/watch/contracts.ts player/test-ts/v1-rc-contracts.test.ts
git commit -m "feat(rc-f0): freeze user-state contracts"
```

---

### Task 3: Add test-only memory repositories for independent workers

**Files:**
- Create: `player/test-ts/support/v1-rc-memory-repositories.ts`
- Modify: `player/test-ts/v1-rc-contracts.test.ts`

**Interfaces:**
- Produces test-only `MemoryEpgProgramRepository`, `MemoryFavoriteRepository`, `MemoryWatchStateRepository`.
- These are never imported from production runtime modules.

- [ ] **Step 1: Add runtime RED acceptance**

Add imports and test:

```ts
import {
  MemoryEpgProgramRepository,
  MemoryFavoriteRepository,
  MemoryWatchStateRepository,
} from './support/v1-rc-memory-repositories.js';

test('RC-F0 memory seams isolate providers', async () => {
  const favorites = new MemoryFavoriteRepository();
  await favorites.put({ providerId: 'p1', channelId: 'shared', addedAtMs: 10 });
  await favorites.put({ providerId: 'p2', channelId: 'shared', addedAtMs: 20 });
  assert.deepEqual(await favorites.list('p1'), [
    { providerId: 'p1', channelId: 'shared', addedAtMs: 10 },
  ]);

  const watch = new MemoryWatchStateRepository();
  await watch.setLastWatched({ providerId: 'p1', channelId: 'shared', lastPlayedAtMs: 30 });
  assert.equal(await watch.getLastWatched('p2'), null);

  const epg = new MemoryEpgProgramRepository();
  await epg.replaceWindow(
    'p1',
    { startMs: 0, endMs: 100 },
    [{ channelId: 'shared', startMs: 0, endMs: 50, title: 'Program', description: null }],
  );
  assert.deepEqual(await epg.listPrograms('p2', 'shared', { startMs: 0, endMs: 100 }), []);
});
```

- [ ] **Step 2: Prove RED**

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0 memory seams"
```

Expected: FAIL because `support/v1-rc-memory-repositories.ts` does not exist.

- [ ] **Step 3: Implement the exact test-support module**

Create `player/test-ts/support/v1-rc-memory-repositories.ts`:

```ts
import { makeChannelKey } from '../../src/domain/models.js';
import type {
  ChannelId,
  EpgProgram,
  ProviderId,
} from '../../src/domain/models.js';
import type {
  EpgProgramRepository,
  EpgWindow,
} from '../../src/epg/contracts.js';
import type {
  FavoriteRecord,
  FavoriteRepository,
} from '../../src/favorites/contracts.js';
import type {
  LastWatchedRecord,
  WatchAggregate,
  WatchStateRepository,
} from '../../src/watch/contracts.js';

function intersects(program: EpgProgram, window: EpgWindow): boolean {
  return program.startMs < window.endMs && program.endMs > window.startMs;
}

export class MemoryEpgProgramRepository implements EpgProgramRepository {
  private readonly programs = new Map<ProviderId, EpgProgram[]>();

  async replaceWindow(
    providerId: ProviderId,
    window: EpgWindow,
    programs: readonly EpgProgram[],
  ): Promise<void> {
    const retained = (this.programs.get(providerId) ?? [])
      .filter((program) => !intersects(program, window));
    this.programs.set(providerId, [
      ...retained.map((program) => ({ ...program })),
      ...programs.map((program) => ({ ...program })),
    ]);
  }

  async listPrograms(
    providerId: ProviderId,
    channelId: ChannelId,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]> {
    return (this.programs.get(providerId) ?? [])
      .filter((program) => program.channelId === channelId && intersects(program, window))
      .sort((a, b) => a.startMs - b.startMs)
      .map((program) => ({ ...program }));
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    this.programs.delete(providerId);
  }
}

export class MemoryFavoriteRepository implements FavoriteRepository {
  private readonly records = new Map<string, FavoriteRecord>();

  async list(providerId: ProviderId): Promise<readonly FavoriteRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => record.providerId === providerId)
      .sort((a, b) => a.addedAtMs - b.addedAtMs || a.channelId.localeCompare(b.channelId))
      .map((record) => ({ ...record }));
  }

  async has(providerId: ProviderId, channelId: ChannelId): Promise<boolean> {
    return this.records.has(makeChannelKey(providerId, channelId));
  }

  async put(record: FavoriteRecord): Promise<void> {
    this.records.set(makeChannelKey(record.providerId, record.channelId), { ...record });
  }

  async delete(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    this.records.delete(makeChannelKey(providerId, channelId));
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.providerId === providerId) this.records.delete(key);
    }
  }
}

export class MemoryWatchStateRepository implements WatchStateRepository {
  private readonly lastWatched = new Map<ProviderId, LastWatchedRecord>();
  private readonly aggregates = new Map<string, WatchAggregate>();

  async getLastWatched(providerId: ProviderId): Promise<LastWatchedRecord | null> {
    const record = this.lastWatched.get(providerId);
    return record ? { ...record } : null;
  }

  async setLastWatched(record: LastWatchedRecord): Promise<void> {
    this.lastWatched.set(record.providerId, { ...record });
  }

  async getAggregate(
    providerId: ProviderId,
    channelId: ChannelId,
  ): Promise<WatchAggregate | null> {
    const record = this.aggregates.get(makeChannelKey(providerId, channelId));
    return record ? { ...record } : null;
  }

  async listAggregates(providerId: ProviderId): Promise<readonly WatchAggregate[]> {
    return Array.from(this.aggregates.values())
      .filter((record) => record.providerId === providerId)
      .map((record) => ({ ...record }));
  }

  async putAggregate(record: WatchAggregate): Promise<void> {
    this.aggregates.set(makeChannelKey(record.providerId, record.channelId), { ...record });
  }

  async deleteChannel(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    this.aggregates.delete(makeChannelKey(providerId, channelId));
    const last = this.lastWatched.get(providerId);
    if (last?.channelId === channelId) this.lastWatched.delete(providerId);
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    this.lastWatched.delete(providerId);
    for (const [key, record] of this.aggregates) {
      if (record.providerId === providerId) this.aggregates.delete(key);
    }
  }
}
```

These classes intentionally implement repository mechanics only. They do not implement EPG normalization/current-next lookup, Favorite toggle/reconciliation, or watch scoring.

- [ ] **Step 4: Prove GREEN and commit**

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0"
npm run typecheck -w player
```

Expected: PASS.

Then:

```bash
git add player/test-ts/support/v1-rc-memory-repositories.ts player/test-ts/v1-rc-contracts.test.ts
git commit -m "test(rc-f0): add shared memory repository seams"
```

---

### Task 4: Lock cross-lane invariants

**Files:**
- Modify: `player/test-ts/v1-rc-contracts.test.ts`

- [ ] **Step 1: Add deletion and mutation-safety acceptance**

Append:

```ts
test('RC-F0 cleanup stays provider scoped and returned records are copies', async () => {
  const favorites = new MemoryFavoriteRepository();
  await favorites.put({ providerId: 'p1', channelId: 'c1', addedAtMs: 1 });
  await favorites.put({ providerId: 'p2', channelId: 'c1', addedAtMs: 2 });
  await favorites.deleteProvider('p1');
  assert.equal(await favorites.has('p1', 'c1'), false);
  assert.equal(await favorites.has('p2', 'c1'), true);

  const first = (await favorites.list('p2'))[0];
  if (!first) throw new Error('favorite fixture missing');
  (first as { addedAtMs: number }).addedAtMs = 999;
  assert.equal((await favorites.list('p2'))[0]?.addedAtMs, 2);

  const watch = new MemoryWatchStateRepository();
  await watch.setLastWatched({ providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 1 });
  await watch.putAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 1000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 1,
  });
  await watch.deleteChannel('p1', 'c1');
  assert.equal(await watch.getLastWatched('p1'), null);
  assert.equal(await watch.getAggregate('p1', 'c1'), null);
});

test('RC-F0 EPG memory seam treats windows as half-open intersections', async () => {
  const epg = new MemoryEpgProgramRepository();
  await epg.replaceWindow('p1', { startMs: 0, endMs: 100 }, [
    { channelId: 'c1', startMs: 0, endMs: 50, title: 'A', description: null },
    { channelId: 'c1', startMs: 50, endMs: 100, title: 'B', description: null },
  ]);

  assert.deepEqual(
    (await epg.listPrograms('p1', 'c1', { startMs: 50, endMs: 100 })).map((p) => p.title),
    ['B'],
  );
});
```

This half-open behavior is a test-double storage boundary only. EPG-N/EPG-Q remain responsible for validating/normalizing real windows and current/next semantics.

- [ ] **Step 2: Run focused and full TypeScript tests**

```bash
npm run test:ts -w player -- --test-name-pattern="RC-F0"
npm run test:ts -w player
```

Expected: PASS.

- [ ] **Step 3: Commit acceptance lock**

```bash
git add player/test-ts/v1-rc-contracts.test.ts
git commit -m "test(rc-f0): lock parallel contract invariants"
```

---

### Task 5: Run exact scope and repository verification

**Files:**
- No new production files.

- [ ] **Step 1: Run repository gates**

Run exactly:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
```

Expected: all PASS. `npm run tizen:package` is not required by this contract-only foundation unless controller policy at execution time explicitly adds it; if run, record the real result and never manufacture a PASS for unavailable signing/tooling.

- [ ] **Step 2: Verify scope from the exact RC-F0 base**

```bash
git diff --name-only <EXACT_RC_F0_BASE_SHA>...HEAD
```

Expected production/test files only:

```text
player/src/epg/contracts.ts
player/src/favorites/contracts.ts
player/src/watch/contracts.ts
player/test-ts/support/v1-rc-memory-repositories.ts
player/test-ts/v1-rc-contracts.test.ts
```

Evidence/status docs may appear only after Task 6. Any storage implementation, provider runtime, Live TV, `main.js`, playback, remote, credential, UI, package, or Tizen source file is a blocker and must be removed or covered by an explicit plan amendment before review.

- [ ] **Step 3: Perform secret/scope scan**

Inspect the exact diff and test output. Confirm there are no provider passwords, usernames, credential-bearing URLs, stream URLs/tokens, or real provider data. Confirm the production contract modules have no imports from provider HTTP, playback engines, DOM/UI, or credential implementations.

---

### Task 6: Exact-head evidence and fan-out handoff

**Files:**
- Modify after implementation verification: `docs/verification/v1-parallel-execution.md`
- Modify after implementation verification: `docs/verification/v1-rc-readiness.md`
- Modify `docs/verification/parallel-development-control.md` only if controller state materially changes.

- [ ] **Step 1: Open/update RC-F0 Draft PR**

Record:

```text
base exact SHA
head exact SHA
five planned source/test files
strict typecheck RED evidence for missing contracts
runtime RED evidence for missing memory test-support module
focused GREEN evidence
full npm test result
npm run typecheck result
npm run brand:check result
npm run build result
npm run tizen:build result
secret/scope audit
```

State explicitly: no EPG/Favorites/Search/watch/M3U/Pairing/Home/UI behavior, no IndexedDB migration, and no provider/playback/credential/runtime integration is implemented.

- [ ] **Step 2: Require exact-head CI**

Use only a workflow run whose `head_sha` equals the final RC-F0 branch head. Expected: `verify` SUCCESS before Ready/merge consideration.

- [ ] **Step 3: Controller review**

Controller verifies:

```text
contracts match this plan
only planned source/test files changed before evidence docs
no hot-zone file changed
no IndexedDB version/schema implementation changed
no ProviderAdapter/runtime composition changed
no feature behavior slipped into F0
no provider secret/transient URL leakage
exact-head CI GREEN
```

- [ ] **Step 4: Merge only with explicit user/controller authority**

After merge, require the resulting `main` verify to complete successfully.

- [ ] **Step 5: Record the one authoritative fan-out base**

Only after post-merge `main` is GREEN, update the canonical boards with:

```text
RC-F0 = CLOSED GREEN
FIRST_WAVE_BASE = <exact post-F0 main SHA>
FIRST_WAVE_VERIFY = <exact post-F0 verify run ID> SUCCESS
```

Then the controller may open approved Wave 1 roles from that same exact base:

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

`PAIR-WEB` remains blocked until its payload/interface design is separately frozen.

---

## Plan Self-Review

Before execution approval, verify all of the following:

- RC-F0 remains exactly three production contract files plus two test/test-support files before evidence updates.
- EPG source references support provider-channel ID, `tvg-id`, and name matching without carrying credentials or URLs.
- EPG provider capability/runtime wiring is deferred to `EPG-PI`.
- EPG normalization/query behavior is deferred to `EPG-N` / `EPG-Q`.
- Durable EPG persistence/IndexedDB migration is deferred to `EPG-P`.
- Favorites behavior/reconciliation is deferred to `FAV-D`; durable persistence to `USER-P`.
- Watch event semantics are deferred to `WATCH-R`, scoring to `WATCH-S`, durable persistence to `USER-P`, playback observation to `WATCH-I`.
- Search, M3U onboarding, Pairing, Home, UI, playback, and runtime composition are absent from F0 implementation.
- Type-only contract RED steps use `npm run typecheck -w player`, not `tsx --test` alone.
- Memory seams are under `player/test-ts/support` and are not production runtime dependencies.
- No placeholders such as `TBD`, `TODO`, `implement later`, or undefined neighboring interfaces remain.

## Execution Handoff

RC-F0 is the only serial production gate before maximum fan-out. It must be integrated and followed by an exact GREEN `main` before any Wave 1 implementation branch is opened.

Worker command after the documentation stack is merged, post-docs `main` is GREEN, and this plan receives execution approval:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=RC-F0.
```
