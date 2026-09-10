# BabuşTV V1 Wave 1 WATCH-S Frequently Watched Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure deterministic frequently-watched scoring/ranking function using meaningful duration, meaningful opens, and recency, with no persistence or UI ownership.

**Architecture:** `WATCH-S` consumes frozen `WatchAggregate` values. The scoring formula is stable, but its weights and recency half-life are injected so product tuning does not require changing interfaces or coupling this lane to Home. Short-zap suppression is upstream `WATCH-R` behavior; aggregates with no meaningful activity score zero.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`, RC-F0 watch/domain contracts.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `WATCH-S`.
- Branch: `feature/watch-score`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/watch/score.ts` and `player/test-ts/watch-score.test.ts`.
- Read-only dependencies: `player/src/watch/contracts.ts`, `player/src/domain/models.ts`.
- Forbidden hot zones: watch persistence/service, playback/session, Home/UI, storage/IndexedDB, provider runtime, `main.js`, package/Tizen identity.
- No final product weight/half-life constant is guessed in this lane; callers pass `WatchScorePolicy`.
- No new dependency or real provider data.

---

### Task 1: Add deterministic score calculation

**Files:**
- Create: `player/src/watch/score.ts`
- Create: `player/test-ts/watch-score.test.ts`

**Interfaces:**
- Consumes: `WatchAggregate`.
- Produces: `WatchScorePolicy`, `scoreWatchAggregate`.

- [ ] **Step 1: Write RED scoring acceptance**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreWatchAggregate } from '../src/watch/score.js';

const policy = {
  durationWeightPerMinute: 1,
  openWeight: 5,
  recencyHalfLifeMs: 7 * 24 * 60 * 60 * 1000,
};

test('WATCH-S combines duration, opens, and recency deterministically', () => {
  const now = 10_000;
  const recent = scoreWatchAggregate({
    providerId: 'p1', channelId: 'c1', meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: now,
  }, now, policy);
  const old = scoreWatchAggregate({
    providerId: 'p1', channelId: 'c1', meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: now - policy.recencyHalfLifeMs,
  }, now, policy);

  assert.equal(recent, 6);
  assert.equal(old, 3);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="WATCH-S combines"
npm run typecheck -w player
```

Expected: FAIL because `watch/score.ts` does not exist.

- [ ] **Step 3: Implement exact formula**

```ts
import type { WatchAggregate } from './contracts.js';

export interface WatchScorePolicy {
  durationWeightPerMinute: number;
  openWeight: number;
  recencyHalfLifeMs: number;
}

export function scoreWatchAggregate(
  record: WatchAggregate,
  nowMs: number,
  policy: WatchScorePolicy,
): number {
  if (!Number.isFinite(nowMs)) throw new RangeError('nowMs must be finite.');
  if (!Number.isFinite(policy.durationWeightPerMinute) || policy.durationWeightPerMinute < 0) {
    throw new RangeError('durationWeightPerMinute must be finite and non-negative.');
  }
  if (!Number.isFinite(policy.openWeight) || policy.openWeight < 0) {
    throw new RangeError('openWeight must be finite and non-negative.');
  }
  if (!Number.isFinite(policy.recencyHalfLifeMs) || policy.recencyHalfLifeMs <= 0) {
    throw new RangeError('recencyHalfLifeMs must be finite and positive.');
  }
  if (record.meaningfulWatchMs < 0 || record.meaningfulOpenCount < 0) {
    throw new RangeError('Watch aggregate counters must be non-negative.');
  }
  if (record.lastMeaningfulWatchAtMs === null) return 0;

  const durationScore = (record.meaningfulWatchMs / 60_000) * policy.durationWeightPerMinute;
  const openScore = record.meaningfulOpenCount * policy.openWeight;
  const ageMs = Math.max(0, nowMs - record.lastMeaningfulWatchAtMs);
  const recencyFactor = Math.pow(0.5, ageMs / policy.recencyHalfLifeMs);
  return (durationScore + openScore) * recencyFactor;
}
```

- [ ] **Step 4: Lock null/future/invalid behavior and commit**

Add tests proving null `lastMeaningfulWatchAtMs` scores zero, a future timestamp is clamped to age zero, and invalid negative counters/policy values throw `RangeError`.

```bash
npm run test:ts -w player -- --test-name-pattern="WATCH-S"
npm run typecheck -w player
git add player/src/watch/score.ts player/test-ts/watch-score.test.ts
git commit -m "feat(watch): add deterministic watch scoring"
```

---

### Task 2: Rank one provider with stable ties

**Files:**
- Modify: `player/src/watch/score.ts`
- Modify: `player/test-ts/watch-score.test.ts`

**Interfaces:**
- Produces: `ScoredWatchAggregate`, `rankFrequentlyWatched`.

- [ ] **Step 1: Write RED ranking acceptance**

```ts
test('WATCH-S ranks only the requested provider with stable tie breaking', () => {
  const now = 1000;
  const records = [
    { providerId: 'p2', channelId: 'x', meaningfulWatchMs: 999999, meaningfulOpenCount: 99, lastMeaningfulWatchAtMs: now },
    { providerId: 'p1', channelId: 'b', meaningfulWatchMs: 60_000, meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: now },
    { providerId: 'p1', channelId: 'a', meaningfulWatchMs: 60_000, meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: now },
  ];
  assert.deepEqual(
    rankFrequentlyWatched('p1', records, now, policy, 8).map((item) => item.record.channelId),
    ['a', 'b'],
  );
});
```

- [ ] **Step 2: Implement exact ranking**

```ts
export interface ScoredWatchAggregate {
  record: WatchAggregate;
  score: number;
}

export function rankFrequentlyWatched(
  providerId: string,
  records: readonly WatchAggregate[],
  nowMs: number,
  policy: WatchScorePolicy,
  limit: number,
): readonly ScoredWatchAggregate[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  return records
    .filter((record) => record.providerId === providerId)
    .map((record) => ({ record, score: scoreWatchAggregate(record, nowMs, policy) }))
    .filter((item) => item.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || (b.record.lastMeaningfulWatchAtMs ?? -1) - (a.record.lastMeaningfulWatchAtMs ?? -1)
      || a.record.channelId.localeCompare(b.record.channelId),
    )
    .slice(0, limit);
}
```

Use `ProviderId` rather than plain `string` in final implementation import/signature.

- [ ] **Step 3: Add input-reorder and limit tests**

Prove identical inputs in reverse order produce the same ranking, p2 never leaks into p1, zero-score records are absent, and limit truncation is deterministic.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="WATCH-S"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/watch/score.ts player/test-ts/watch-score.test.ts
git commit -m "feat(watch): rank frequently watched channels"
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

Expected: only the two owned files. No persistence, playback, UI, provider, credential, or global configuration changes.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, scoring RED/GREEN, policy validation, provider isolation, stable ranking, full gates, and scope audit. State that thresholding/event capture belongs to `WATCH-R`/`WATCH-I` and Home projection belongs to later lanes. Do not Ready/merge.
