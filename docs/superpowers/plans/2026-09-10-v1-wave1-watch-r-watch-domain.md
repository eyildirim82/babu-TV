# BabuşTV V1 Wave 1 WATCH-R Watch State Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-scoped last-watched and meaningful-watch aggregation behavior through the frozen `WatchStateRepository`, while leaving scoring, durable persistence, playback event wiring, and Home UI to separate lanes.

**Architecture:** `WATCH-R` records playback-start as Last Watched and completed sessions as meaningful aggregates only when an injected policy threshold is met. The final product threshold is not guessed here; the caller supplies it. All state access remains provider + stable channel scoped.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`, RC-F0 watch contracts and memory repository seam.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `WATCH-R`.
- Branch: `feature/watch-state-domain`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/watch/service.ts` and `player/test-ts/watch-service.test.ts`.
- Read-only dependencies: `player/src/watch/contracts.ts`, `player/src/domain/models.ts`, `player/test-ts/support/v1-rc-memory-repositories.ts`.
- Forbidden hot zones: playback/session engine internals, `main.js`, Live TV/Home UI, storage/IndexedDB, provider runtime, package/Tizen identity.
- Do not implement frequently-watched scoring; `WATCH-S` owns scoring.
- Do not choose a product-wide meaningful-watch threshold in this lane. `minimumSessionMs` is injected and must be finite/non-negative.
- No new dependency or real provider data.

---

### Task 1: Record Last Watched independently from scoring

**Files:**
- Create: `player/src/watch/service.ts`
- Create: `player/test-ts/watch-service.test.ts`

**Interfaces:**
- Consumes: `WatchStateRepository`, `LastWatchedRecord`, `ProviderId`, `ChannelId`.
- Produces: `WatchStateService.recordPlaybackStarted`, `getLastWatched`.

- [ ] **Step 1: Write RED Last Watched acceptance**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { WatchStateService } from '../src/watch/service.js';
import { MemoryWatchStateRepository } from './support/v1-rc-memory-repositories.js';

test('WATCH-R records Last Watched by provider and stable channel id', async () => {
  const repo = new MemoryWatchStateRepository();
  const service = new WatchStateService(repo, { minimumSessionMs: 30_000 });
  await service.recordPlaybackStarted('p1', 'c1', 1000);
  assert.deepEqual(await service.getLastWatched('p1'), {
    providerId: 'p1', channelId: 'c1', lastPlayedAtMs: 1000,
  });
  assert.equal(await service.getLastWatched('p2'), null);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="WATCH-R records Last Watched"
npm run typecheck -w player
```

Expected: FAIL because `watch/service.ts` does not exist.

- [ ] **Step 3: Implement the service shell**

```ts
import type { ChannelId, ProviderId } from '../domain/models.js';
import type { LastWatchedRecord, WatchAggregate, WatchStateRepository } from './contracts.js';

export interface MeaningfulWatchPolicy {
  minimumSessionMs: number;
}

export class WatchStateService {
  constructor(
    private readonly repository: WatchStateRepository,
    private readonly policy: MeaningfulWatchPolicy,
  ) {
    if (!Number.isFinite(policy.minimumSessionMs) || policy.minimumSessionMs < 0) {
      throw new RangeError('minimumSessionMs must be finite and non-negative.');
    }
  }

  getLastWatched(providerId: ProviderId): Promise<LastWatchedRecord | null> {
    return this.repository.getLastWatched(providerId);
  }

  async recordPlaybackStarted(providerId: ProviderId, channelId: ChannelId, atMs: number): Promise<void> {
    if (!Number.isFinite(atMs)) throw new RangeError('atMs must be finite.');
    await this.repository.setLastWatched({ providerId, channelId, lastPlayedAtMs: atMs });
  }
}
```

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="WATCH-R"
npm run typecheck -w player
git add player/src/watch/service.ts player/test-ts/watch-service.test.ts
git commit -m "feat(watch): record provider-scoped last watched"
```

---

### Task 2: Aggregate only meaningful completed sessions

**Files:**
- Modify: `player/src/watch/service.ts`
- Modify: `player/test-ts/watch-service.test.ts`

**Interfaces:**
- Produces: `CompletedWatchSession`, `recordCompletedSession`, `getAggregate`, `listAggregates`.

- [ ] **Step 1: Write RED meaningful-session acceptance**

```ts
test('WATCH-R ignores short zaps and aggregates meaningful sessions', async () => {
  const repo = new MemoryWatchStateRepository();
  const service = new WatchStateService(repo, { minimumSessionMs: 30_000 });

  assert.equal(await service.recordCompletedSession({
    providerId: 'p1', channelId: 'c1', durationMs: 5_000, endedAtMs: 10_000,
  }), null);

  assert.deepEqual(await service.recordCompletedSession({
    providerId: 'p1', channelId: 'c1', durationMs: 60_000, endedAtMs: 70_000,
  }), {
    providerId: 'p1', channelId: 'c1', meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: 70_000,
  });
});
```

- [ ] **Step 2: Implement exact aggregation**

```ts
export interface CompletedWatchSession {
  providerId: ProviderId;
  channelId: ChannelId;
  durationMs: number;
  endedAtMs: number;
}

async recordCompletedSession(session: CompletedWatchSession): Promise<WatchAggregate | null> {
  if (!Number.isFinite(session.durationMs) || session.durationMs < 0) {
    throw new RangeError('durationMs must be finite and non-negative.');
  }
  if (!Number.isFinite(session.endedAtMs)) throw new RangeError('endedAtMs must be finite.');
  if (session.durationMs < this.policy.minimumSessionMs) {
    return this.repository.getAggregate(session.providerId, session.channelId);
  }

  const previous = await this.repository.getAggregate(session.providerId, session.channelId);
  const next: WatchAggregate = {
    providerId: session.providerId,
    channelId: session.channelId,
    meaningfulWatchMs: (previous?.meaningfulWatchMs ?? 0) + session.durationMs,
    meaningfulOpenCount: (previous?.meaningfulOpenCount ?? 0) + 1,
    lastMeaningfulWatchAtMs: session.endedAtMs,
  };
  await this.repository.putAggregate(next);
  return next;
}
```

Add thin query delegations for `getAggregate` and `listAggregates`.

- [ ] **Step 3: Lock repeated/provider-isolation behavior**

Add tests proving two meaningful sessions accumulate, short zaps do not change an existing aggregate, and identical channel IDs across providers remain isolated.

- [ ] **Step 4: Add explicit cleanup delegations**

Implement `deleteChannel(providerId, channelId)` and `deleteProvider(providerId)` as repository delegations. Prove channel cleanup only clears Last Watched when that channel is the stored last-watched record, matching the RC-F0 memory seam.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="WATCH-R"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/watch/service.ts player/test-ts/watch-service.test.ts
git commit -m "feat(watch): aggregate meaningful watch sessions"
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

- [ ] **Step 2: Audit exact scope**

```bash
git diff --name-only aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff --check aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected: only the two owned files. No playback engine, persistence implementation, scoring, UI, provider, credential, package, or Tizen changes.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, Last Watched RED/GREEN, short-zap/meaningful aggregation/provider isolation/cleanup evidence, full gates, and scope audit. State explicitly that `WATCH-S` owns scoring, `USER-P` owns persistence, and `WATCH-I` owns playback-event composition. Do not Ready/merge.
