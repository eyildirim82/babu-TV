# BabuşTV V1 Wave 1 EPG-Q Query Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic current/next/window EPG lookup through the frozen `EpgProgramRepository` interface without owning ingestion, persistence, provider networking, or UI.

**Architecture:** `EPG-Q` provides `RepositoryEpgQuery`, an `EpgQuery` implementation with explicitly injected look-behind/look-ahead bounds. It uses half-open program intervals (`startMs <= t < endMs`) and deterministic ordering. No default cache horizon is guessed in this lane; callers must provide measured/query bounds later.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`, RC-F0 EPG repository contracts and memory test seam.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `EPG-Q`.
- Branch: `feature/epg-query-engine`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/epg/query-engine.ts` and `player/test-ts/epg-query-engine.test.ts`.
- Read-only dependencies: `player/src/epg/contracts.ts`, `player/src/domain/models.ts`, `player/test-ts/support/v1-rc-memory-repositories.ts`.
- Forbidden hot zones: provider ingestion, storage/IndexedDB implementations, Live TV/UI, `main.js`, playback/session, package/Tizen identity.
- Do not modify RC-F0 contracts or its memory repositories.
- No guessed product-wide EPG retention window; constructor bounds are explicit inputs.
- No new npm dependency and no provider data.

---

### Task 1: Add half-open current-program lookup

**Files:**
- Create: `player/src/epg/query-engine.ts`
- Create: `player/test-ts/epg-query-engine.test.ts`

**Interfaces:**
- Consumes: `EpgProgramRepository`, `EpgQuery`, `EpgWindow`.
- Produces: `EpgQueryBounds` and `RepositoryEpgQuery`.

- [ ] **Step 1: Write RED current-boundary test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { RepositoryEpgQuery } from '../src/epg/query-engine.js';
import { MemoryEpgProgramRepository } from './support/v1-rc-memory-repositories.js';

test('EPG-Q current lookup uses half-open intervals', async () => {
  const repo = new MemoryEpgProgramRepository();
  await repo.replaceWindow('p1', { startMs: 0, endMs: 300 }, [
    { channelId: 'c1', startMs: 100, endMs: 200, title: 'A', description: null },
    { channelId: 'c1', startMs: 200, endMs: 300, title: 'B', description: null },
  ]);
  const query = new RepositoryEpgQuery(repo, { lookBehindMs: 1000, lookAheadMs: 1000 });
  assert.equal((await query.getCurrent('p1', 'c1', 199))?.title, 'A');
  assert.equal((await query.getCurrent('p1', 'c1', 200))?.title, 'B');
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-Q current lookup"
npm run typecheck -w player
```

Expected: FAIL because `query-engine.ts` does not exist.

- [ ] **Step 3: Implement bounds and current selection**

Use this public shape:

```ts
export interface EpgQueryBounds {
  lookBehindMs: number;
  lookAheadMs: number;
}

export class RepositoryEpgQuery implements EpgQuery {
  constructor(
    private readonly repository: EpgProgramRepository,
    private readonly bounds: EpgQueryBounds,
  ) {
    if (!Number.isFinite(bounds.lookBehindMs) || bounds.lookBehindMs <= 0) {
      throw new RangeError('lookBehindMs must be positive.');
    }
    if (!Number.isFinite(bounds.lookAheadMs) || bounds.lookAheadMs <= 0) {
      throw new RangeError('lookAheadMs must be positive.');
    }
  }

  async getCurrent(providerId: ProviderId, channelId: ChannelId, atMs: number): Promise<EpgProgram | null> {
    const programs = await this.repository.listPrograms(providerId, channelId, {
      startMs: atMs - this.bounds.lookBehindMs,
      endMs: atMs + 1,
    });
    const matches = programs.filter((program) => program.startMs <= atMs && atMs < program.endMs);
    matches.sort((a, b) => b.startMs - a.startMs || a.endMs - b.endMs || a.title.localeCompare(b.title));
    return matches[0] ?? null;
  }
}
```

The latest-starting overlapping record wins deterministically; this lane does not mutate overlapping source data.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-Q current lookup"
npm run typecheck -w player
git add player/src/epg/query-engine.ts player/test-ts/epg-query-engine.test.ts
git commit -m "feat(epg): add current-program query"
```

---

### Task 2: Add deterministic next and bounded window lookup

**Files:**
- Modify: `player/src/epg/query-engine.ts`
- Modify: `player/test-ts/epg-query-engine.test.ts`

- [ ] **Step 1: Write RED next-program test**

```ts
test('EPG-Q next lookup starts after the current programme ends', async () => {
  const repo = new MemoryEpgProgramRepository();
  await repo.replaceWindow('p1', { startMs: 0, endMs: 500 }, [
    { channelId: 'c1', startMs: 100, endMs: 250, title: 'Current', description: null },
    { channelId: 'c1', startMs: 200, endMs: 220, title: 'Overlap', description: null },
    { channelId: 'c1', startMs: 250, endMs: 300, title: 'Next', description: null },
  ]);
  const query = new RepositoryEpgQuery(repo, { lookBehindMs: 1000, lookAheadMs: 1000 });
  assert.equal((await query.getNext('p1', 'c1', 150))?.title, 'Next');
});
```

- [ ] **Step 2: Implement exact next rule**

`getNext` must:

1. call `getCurrent`;
2. define `threshold = current?.endMs ?? atMs`;
3. query repository window `{ startMs: threshold, endMs: atMs + lookAheadMs }`;
4. keep records with `program.startMs >= threshold`;
5. sort by `startMs`, then `endMs`, then title;
6. return first or `null`.

If `atMs + lookAheadMs <= threshold`, return `null` rather than issuing an inverted window.

- [ ] **Step 3: Implement `listWindow` as validated delegation**

```ts
async listWindow(
  providerId: ProviderId,
  channelId: ChannelId,
  window: EpgWindow,
): Promise<readonly EpgProgram[]> {
  if (!Number.isFinite(window.startMs) || !Number.isFinite(window.endMs) || window.startMs >= window.endMs) {
    throw new RangeError('EPG query window must be finite and non-empty.');
  }
  return this.repository.listPrograms(providerId, channelId, window);
}
```

- [ ] **Step 4: Lock gap, no-data, provider isolation, and overlap ordering**

Add tests for no current program, gap-to-next lookup, no future program, two providers sharing `channelId`, and deterministic overlap selection.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-Q"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/epg/query-engine.ts player/test-ts/epg-query-engine.test.ts
git commit -m "feat(epg): add next and window queries"
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

Expected: exactly the two owned files. No persistence implementation, provider data/networking, UI, or playback changes.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, RED/GREEN, boundary/gap/overlap/provider-isolation evidence, full gates, and diff audit. State that query bounds are injected and that default retention/cache sizing remains a later measured integration decision. Do not Ready/merge.
