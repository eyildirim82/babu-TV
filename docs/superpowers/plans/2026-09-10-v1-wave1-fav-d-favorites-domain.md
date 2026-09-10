# BabuşTV V1 Wave 1 FAV-D Favorites Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-scoped Favorites domain behavior through the frozen `FavoriteRepository` seam, including add/remove/toggle/query and non-destructive reconciliation of temporarily missing channels.

**Architecture:** `FAV-D` is a repository-driven domain service with an injected clock. Favorites remain keyed by provider + stable channel ID. Catalog refresh does not silently delete user-owned favorite records; reconciliation partitions favorites into available and missing records for later UI/integration decisions.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`, RC-F0 Favorites contract and memory repository seam.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `FAV-D`.
- Branch: `feature/favorites-domain`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/favorites/service.ts` and `player/test-ts/favorites-service.test.ts`.
- Read-only dependencies: `player/src/favorites/contracts.ts`, `player/src/domain/models.ts`, `player/test-ts/support/v1-rc-memory-repositories.ts`.
- Forbidden hot zones: storage/IndexedDB, Live TV UI/controller/runtime, `main.js`, provider runtime, playback/session, package/Tizen identity.
- Do not change `FavoriteRepository` or create persistence stores.
- Provider refresh/reorder must not erase favorites when stable identity still exists; a temporarily missing channel remains user-owned state until explicit provider/user cleanup.
- No new dependency, real provider data, URLs, or secrets.

---

### Task 1: Add provider-scoped add/remove/toggle/query behavior

**Files:**
- Create: `player/src/favorites/service.ts`
- Create: `player/test-ts/favorites-service.test.ts`

**Interfaces:**
- Consumes: `FavoriteRepository`, `FavoriteRecord`, `ProviderId`, `ChannelId`.
- Produces: `FavoriteService`.

- [ ] **Step 1: Write RED toggle acceptance**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { FavoriteService } from '../src/favorites/service.js';
import { MemoryFavoriteRepository } from './support/v1-rc-memory-repositories.js';

test('FAV-D toggles one provider-scoped favorite deterministically', async () => {
  const repo = new MemoryFavoriteRepository();
  const service = new FavoriteService(repo, () => 1234);

  assert.equal(await service.toggle('p1', 'c1'), true);
  assert.deepEqual(await service.list('p1'), [
    { providerId: 'p1', channelId: 'c1', addedAtMs: 1234 },
  ]);
  assert.equal(await service.toggle('p1', 'c1'), false);
  assert.deepEqual(await service.list('p1'), []);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="FAV-D toggles"
npm run typecheck -w player
```

Expected: FAIL because `favorites/service.ts` does not exist.

- [ ] **Step 3: Implement minimum service**

Use this public shape:

```ts
import type { ChannelId, ProviderId } from '../domain/models.js';
import type { FavoriteRecord, FavoriteRepository } from './contracts.js';

export class FavoriteService {
  constructor(
    private readonly repository: FavoriteRepository,
    private readonly nowMs: () => number = Date.now,
  ) {}

  list(providerId: ProviderId): Promise<readonly FavoriteRecord[]> {
    return this.repository.list(providerId);
  }

  isFavorite(providerId: ProviderId, channelId: ChannelId): Promise<boolean> {
    return this.repository.has(providerId, channelId);
  }

  async add(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    if (await this.repository.has(providerId, channelId)) return;
    await this.repository.put({ providerId, channelId, addedAtMs: this.nowMs() });
  }

  remove(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    return this.repository.delete(providerId, channelId);
  }

  async toggle(providerId: ProviderId, channelId: ChannelId): Promise<boolean> {
    if (await this.repository.has(providerId, channelId)) {
      await this.repository.delete(providerId, channelId);
      return false;
    }
    await this.add(providerId, channelId);
    return true;
  }
}
```

Return value from `toggle` is the new favorite state (`true` = favorite after operation).

- [ ] **Step 4: Add provider-isolation/idempotence tests**

Prove adding `p1/c1` does not affect `p2/c1`, repeated `add` preserves the original timestamp, and `remove` of a missing item is harmless under the repository seam.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="FAV-D"
npm run typecheck -w player
git add player/src/favorites/service.ts player/test-ts/favorites-service.test.ts
git commit -m "feat(favorites): add provider-scoped domain service"
```

---

### Task 2: Add non-destructive reconciliation

**Files:**
- Modify: `player/src/favorites/service.ts`
- Modify: `player/test-ts/favorites-service.test.ts`

**Interfaces:**
- Produces: `FavoriteReconciliation` and `reconcile(providerId, availableChannelIds)`.

- [ ] **Step 1: Write RED reconciliation acceptance**

```ts
test('FAV-D reconciliation reports missing favorites without deleting them', async () => {
  const repo = new MemoryFavoriteRepository();
  const service = new FavoriteService(repo, () => 10);
  await service.add('p1', 'present');
  await service.add('p1', 'missing');

  const result = await service.reconcile('p1', new Set(['present']));
  assert.deepEqual(result.available.map((item) => item.channelId), ['present']);
  assert.deepEqual(result.missing.map((item) => item.channelId), ['missing']);
  assert.equal(await service.isFavorite('p1', 'missing'), true);
});
```

- [ ] **Step 2: Implement exact partition behavior**

```ts
export interface FavoriteReconciliation {
  available: readonly FavoriteRecord[];
  missing: readonly FavoriteRecord[];
}

async reconcile(
  providerId: ProviderId,
  availableChannelIds: ReadonlySet<ChannelId>,
): Promise<FavoriteReconciliation> {
  const records = await this.repository.list(providerId);
  return {
    available: records.filter((record) => availableChannelIds.has(record.channelId)),
    missing: records.filter((record) => !availableChannelIds.has(record.channelId)),
  };
}
```

Do not call `repository.delete` during reconciliation. Explicit user removal/provider deletion is separate behavior.

- [ ] **Step 3: Add reorder and provider-cleanup tests**

Assert reconciliation result is based on stable IDs rather than catalog order. Add `deleteProvider(providerId)` as a thin repository delegation and prove deleting p1 favorites does not touch p2.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="FAV-D"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/favorites/service.ts player/test-ts/favorites-service.test.ts
git commit -m "test(favorites): lock reconciliation semantics"
```

---

### Task 3: Verify exact head and open Draft PR

- [ ] **Step 1: Run full gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
```

- [ ] **Step 2: Audit scope**

```bash
git diff --name-only aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff --check aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected: only the two owned files. No storage schema, UI, provider, playback, credential, package, or Tizen changes.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, RED/GREEN, provider-isolation/idempotence/reconciliation evidence, full gates, and scope audit. Explicitly defer durable persistence to `USER-P` and presentation to `FAV-UI`/composition. Do not Ready/merge.
