# BabuşTV V1 Wave 1 EPG-N Normalizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pure provider-independent EPG record normalization that converts frozen `EpgSourceProgram` values into safe normalized `EpgProgram` values without owning provider parsing, persistence, mapping, query, or UI behavior.

**Architecture:** `EPG-N` is a pure TypeScript lane. It consumes RC-F0 EPG contracts and `ChannelId`, rejects malformed intervals/titles, normalizes text, removes exact duplicates, and returns deterministic ordering. It never fetches data and never chooses a channel mapping.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`, existing BabuşTV domain/EPG contracts.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `EPG-N`.
- Branch: `feature/epg-normalizer`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/epg/normalize.ts` and `player/test-ts/epg-normalize.test.ts`.
- Read-only dependencies: `player/src/domain/models.ts`, `player/src/epg/contracts.ts`.
- Forbidden hot zones: `player/src/main.js`, `player/index.html`, `player/src/live-tv/*`, `player/src/providers/*`, `player/src/storage/*`, playback/session code, package/Tizen identity.
- Do not modify RC-F0 contracts. If the frozen seam is insufficient, report a controller blocker instead of widening it.
- No provider HTTP, XML parsing, channel reconciliation, repository persistence, query engine, UI, or background refresh.
- No new npm dependency.
- Synthetic data only; no provider URLs, credentials, tokens, stream URLs, or real EPG dumps.
- Preserve existing M3 invariants; this lane cannot emit playback intents.

---

### Task 1: Establish the pure normalizer API

**Files:**
- Create: `player/src/epg/normalize.ts`
- Create: `player/test-ts/epg-normalize.test.ts`

**Interfaces:**
- Consumes: `ChannelId`, `EpgProgram`, `EpgSourceProgram`.
- Produces: `normalizeEpgProgram(channelId, source)` and `normalizeEpgPrograms(channelId, sources)`.

- [ ] **Step 1: Write the RED acceptance**

Create `player/test-ts/epg-normalize.test.ts` with:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpgProgram } from '../src/epg/normalize.js';

test('EPG-N normalizes one valid source program', () => {
  assert.deepEqual(
    normalizeEpgProgram('c1', {
      sourceChannel: { providerChannelId: null, tvgId: 'tv-1', name: ' Kanal ' },
      startMs: 100,
      endMs: 200,
      title: '  Haberler  ',
      description: '  Günün özeti  ',
    }),
    {
      channelId: 'c1',
      startMs: 100,
      endMs: 200,
      title: 'Haberler',
      description: 'Günün özeti',
    },
  );
});
```

- [ ] **Step 2: Prove RED**

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-N normalizes one valid source program"
npm run typecheck -w player
```

Expected: FAIL because `../src/epg/normalize.js` does not exist.

- [ ] **Step 3: Add the minimum implementation**

Create `player/src/epg/normalize.ts`:

```ts
import type { ChannelId, EpgProgram } from '../domain/models.js';
import type { EpgSourceProgram } from './contracts.js';

export function normalizeEpgProgram(
  channelId: ChannelId,
  source: EpgSourceProgram,
): EpgProgram | null {
  if (!Number.isFinite(source.startMs) || !Number.isFinite(source.endMs)) return null;
  if (source.startMs >= source.endMs) return null;

  const title = source.title.trim();
  if (title.length === 0) return null;

  const description = source.description?.trim() ?? null;
  return {
    channelId,
    startMs: source.startMs,
    endMs: source.endMs,
    title,
    description: description && description.length > 0 ? description : null,
  };
}

export function normalizeEpgPrograms(
  channelId: ChannelId,
  sources: readonly EpgSourceProgram[],
): readonly EpgProgram[] {
  const seen = new Set<string>();
  const normalized: EpgProgram[] = [];

  for (const source of sources) {
    const program = normalizeEpgProgram(channelId, source);
    if (!program) continue;
    const key = `${program.startMs}\u0000${program.endMs}\u0000${program.title}\u0000${program.description ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(program);
  }

  return normalized.sort((a, b) =>
    a.startMs - b.startMs || a.endMs - b.endMs || a.title.localeCompare(b.title),
  );
}
```

Do not clip legitimate overlaps or invent timezone offsets here. Source parsers must already provide epoch milliseconds; later query logic owns current/next selection.

- [ ] **Step 4: Prove focused GREEN**

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-N"
npm run typecheck -w player
```

Expected: PASS.

- [ ] **Step 5: Commit the API slice**

```bash
git add player/src/epg/normalize.ts player/test-ts/epg-normalize.test.ts
git commit -m "feat(epg): add provider-independent normalizer"
```

---

### Task 2: Lock malformed, duplicate, and boundary behavior

**Files:**
- Modify: `player/test-ts/epg-normalize.test.ts`

- [ ] **Step 1: Add edge-case acceptance**

Append tests proving:

```ts
test('EPG-N rejects invalid intervals and blank titles', () => {
  const base = {
    sourceChannel: { providerChannelId: null, tvgId: null, name: null },
    description: null,
  };
  assert.equal(normalizeEpgProgram('c1', { ...base, startMs: 10, endMs: 10, title: 'X' }), null);
  assert.equal(normalizeEpgProgram('c1', { ...base, startMs: Number.NaN, endMs: 20, title: 'X' }), null);
  assert.equal(normalizeEpgProgram('c1', { ...base, startMs: 10, endMs: 20, title: '   ' }), null);
});

test('EPG-N removes exact duplicates and sorts deterministically', () => {
  const ref = { providerChannelId: null, tvgId: null, name: null };
  const rows = normalizeEpgPrograms('c1', [
    { sourceChannel: ref, startMs: 20, endMs: 30, title: 'B', description: null },
    { sourceChannel: ref, startMs: 10, endMs: 20, title: 'A', description: null },
    { sourceChannel: ref, startMs: 10, endMs: 20, title: 'A', description: null },
  ]);
  assert.deepEqual(rows.map((row) => row.title), ['A', 'B']);
});
```

- [ ] **Step 2: Run focused and full TypeScript tests**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-N"
npm run test:ts -w player
npm run typecheck -w player
```

Expected: PASS.

- [ ] **Step 3: Commit the invariant tests**

```bash
git add player/test-ts/epg-normalize.test.ts
git commit -m "test(epg): lock normalizer invariants"
```

---

### Task 3: Run exact-head repository verification and open Draft PR

**Files:**
- No new production files.

- [ ] **Step 1: Run all repository gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
```

Expected: all commands exit 0.

- [ ] **Step 2: Audit exact diff and secrets**

```bash
git diff --name-only aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff --check aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected changed files: only the two owned files. Confirm the diff contains no credentials, provider URLs, tokens, stream URLs, or real EPG data.

- [ ] **Step 3: Open Draft PR**

The PR body must record exact base/head SHA, changed files, RED command/failure, focused GREEN, full gate results, secret/scope audit, and state explicitly that provider parsing/mapping/query/persistence/UI remain out of scope. Do not mark Ready or merge; Controller owns that gate.
