# BabuşTV V1 Wave 1 SRCH-C Local Search Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight Turkish-safe local catalog search over channel names, category names, and unambiguous channel numbers without UI or playback ownership.

**Architecture:** `SRCH-C` is a pure in-memory search function over normalized `Channel` and `Category` data. It performs locale-correct Turkish case normalization, deterministic ranking, stable tie-breaking, and optional exact channel-number matching only when that number identifies one channel unambiguously.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`; no search dependency.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `SRCH-C`.
- Branch: `feature/search-core`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/search/search-core.ts` and `player/test-ts/search-core.test.ts`.
- Read-only dependency: `player/src/domain/models.ts`.
- Forbidden hot zones: `main.js`, Live TV/UI/focus composition, provider/network code, storage, playback/session, package/Tizen identity.
- Search is local and must not fetch or mutate provider data.
- Highlight/playback invariant: this module returns data only and has no playback intent or callback type.
- Do not add Fuse.js/Lunr/other search dependencies.
- Synthetic catalogs only; no real provider/channel dump.

---

### Task 1: Add Turkish-safe normalization and deterministic name/category matching

**Files:**
- Create: `player/src/search/search-core.ts`
- Create: `player/test-ts/search-core.test.ts`

**Interfaces:**
- Consumes: `Channel`, `Category`.
- Produces: `normalizeSearchText`, `CatalogSearchResult`, `searchCatalog`.

- [ ] **Step 1: Write RED Turkish-case acceptance**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCatalog } from '../src/search/search-core.js';

test('SRCH-C is Turkish-case-safe for channel and category names', () => {
  const categories = [{ providerId: 'p1', id: 'news', name: 'İç Haber' }];
  const channels = [
    { providerId: 'p1', id: 'c1', name: 'İSTANBUL TV', categoryId: 'news', logoUrl: null, number: 7 },
    { providerId: 'p1', id: 'c2', name: 'Spor', categoryId: null, logoUrl: null, number: 8 },
  ];

  assert.deepEqual(searchCatalog({ channels, categories, query: 'istanbul' }).map((x) => x.channel.id), ['c1']);
  assert.deepEqual(searchCatalog({ channels, categories, query: 'iç haber' }).map((x) => x.channel.id), ['c1']);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="SRCH-C is Turkish-case-safe"
npm run typecheck -w player
```

Expected: FAIL because `search/search-core.ts` does not exist.

- [ ] **Step 3: Implement text normalization and ranking primitives**

Use:

```ts
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR');
}

export type CatalogSearchMatch = 'number' | 'name' | 'category';

export interface CatalogSearchResult {
  channel: Channel;
  matchedBy: CatalogSearchMatch;
  rank: number;
}
```

For non-numeric text, rank channel-name exact/prefix/contains as `10/20/30` and category exact/prefix/contains as `40/50/60`. Keep only the strongest match for each channel. Tie-break by channel number (`null` last), normalized name, then stable `channel.id`.

`searchCatalog` signature:

```ts
export function searchCatalog(input: {
  channels: readonly Channel[];
  categories: readonly Category[];
  query: string;
  limit?: number;
}): readonly CatalogSearchResult[];
```

Blank normalized query returns `[]`. Default limit is 50; invalid/non-positive limits return `[]`; never mutate input arrays.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="SRCH-C"
npm run typecheck -w player
git add player/src/search/search-core.ts player/test-ts/search-core.test.ts
git commit -m "feat(search): add Turkish-safe local catalog search"
```

---

### Task 2: Add unambiguous channel-number matching and stable ties

**Files:**
- Modify: `player/src/search/search-core.ts`
- Modify: `player/test-ts/search-core.test.ts`

- [ ] **Step 1: Write RED numeric acceptance**

```ts
test('SRCH-C promotes an exact channel number only when unambiguous', () => {
  const base = { providerId: 'p1', categoryId: null, logoUrl: null };
  const unique = [
    { ...base, id: 'c7', name: 'Yedi', number: 7 },
    { ...base, id: 'c8', name: 'Sekiz', number: 8 },
  ];
  assert.deepEqual(searchCatalog({ channels: unique, categories: [], query: '7' }).map((x) => x.channel.id), ['c7']);

  const ambiguous = [...unique, { ...base, id: 'other7', name: 'Başka', number: 7 }];
  assert.deepEqual(searchCatalog({ channels: ambiguous, categories: [], query: '7' }), []);
});
```

- [ ] **Step 2: Implement exact numeric rule**

If normalized query matches `/^\d+$/`, parse it as a safe integer. Gather channels whose non-null `number` equals it. When exactly one match exists, return one `CatalogSearchResult` with `matchedBy: 'number'` and `rank: 0`; when zero or multiple matches exist, do not infer a number result. Text matching may still run only if the query contains non-digit text.

- [ ] **Step 3: Add provider-agnostic stable-order tests**

The search function does not choose an active provider; callers pass the catalog scope. Add tests proving stable ordering is independent of input reorder and that category lookup uses each channel's `categoryId` rather than category array position.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="SRCH-C"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/search/search-core.ts player/test-ts/search-core.test.ts
git commit -m "test(search): lock number and ranking semantics"
```

---

### Task 3: Add large-catalog regression evidence

**Files:**
- Modify: `player/test-ts/search-core.test.ts`

- [ ] **Step 1: Add deterministic synthetic performance test**

Construct 10,000 channels and 100 categories in-memory, place one exact-name hit near the end, search once after one warm-up call, assert the correct result is first and measured elapsed time is below 500 ms on Node 22. Include elapsed time in the assertion message. This is a guard against accidental quadratic scans, not a production SLA.

- [ ] **Step 2: Commit performance acceptance**

```bash
npm run test:ts -w player -- --test-name-pattern="SRCH-C"
npm run typecheck -w player
git add player/test-ts/search-core.test.ts
git commit -m "test(search): cover large synthetic catalogs"
```

---

### Task 4: Verify exact head and open Draft PR

- [ ] **Step 1: Run full gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
```

- [ ] **Step 2: Audit exact diff**

```bash
git diff --name-only aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff --check aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected: only the two owned files. Confirm no UI, focus, provider, playback, persistence, dependency, or real catalog data changes.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, Turkish-case RED/GREEN, numeric ambiguity, stable ordering, large-catalog timing, full gates, and scope audit. State explicitly that Search UI and playback intents are out of scope. Do not Ready/merge.
