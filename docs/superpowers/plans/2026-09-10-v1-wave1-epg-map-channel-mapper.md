# BabuşTV V1 Wave 1 EPG-MAP Channel Mapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement provider-scoped, deterministic EPG-to-channel matching with stable identifiers first, normalized-name fallback last, and strict ambiguity rejection.

**Architecture:** `EPG-MAP` is a pure reconciliation module. It consumes `EpgSourceChannelRef` and `EpgChannelDescriptor`, returns a single `ChannelId` or `null`, and never parses provider payloads, changes channel data, writes persistence, or emits playback/UI actions.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`, RC-F0 EPG/domain contracts.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `EPG-MAP`.
- Branch: `feature/epg-channel-mapper`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/epg/channel-mapper.ts` and `player/test-ts/epg-channel-mapper.test.ts`.
- Read-only dependencies: `player/src/domain/models.ts`, `player/src/epg/contracts.ts`.
- Forbidden hot zones: provider parsers/network, storage/IndexedDB, Live TV, `main.js`, playback/session, package/Tizen identity.
- Matching priority is stable identity before text fallback. Ambiguous matches return `null`; never pick the first array element merely because it is first.
- Provider isolation is mandatory; descriptors from another provider can never satisfy a match.
- No new dependency and no real provider fixtures.

---

### Task 1: Add stable-ID and tvg-id matching

**Files:**
- Create: `player/src/epg/channel-mapper.ts`
- Create: `player/test-ts/epg-channel-mapper.test.ts`

**Interfaces:**
- Consumes: `ProviderId`, `ChannelId`, `EpgSourceChannelRef`, `EpgChannelDescriptor`.
- Produces: `matchEpgChannel(providerId, source, channels): ChannelId | null`.

- [ ] **Step 1: Write RED stable-ID acceptance**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchEpgChannel } from '../src/epg/channel-mapper.js';

const channels = [
  { providerId: 'p1', channelId: '42', name: 'TRT 1', epgIds: ['trt1.tr'] },
  { providerId: 'p2', channelId: '42', name: 'Other', epgIds: ['other'] },
] as const;

test('EPG-MAP prefers provider-scoped channel id then tvg id', () => {
  assert.equal(matchEpgChannel('p1', {
    providerChannelId: '42', tvgId: 'wrong', name: 'Wrong',
  }, channels), '42');

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null, tvgId: 'trt1.tr', name: null,
  }, channels), '42');
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-MAP prefers provider-scoped"
npm run typecheck -w player
```

Expected: FAIL because the mapper module does not exist.

- [ ] **Step 3: Implement ordered unique matching**

Use helpers that trim identifier strings but do not lowercase stable IDs. Filter descriptors by `providerId` first. Matching order:

1. `source.providerChannelId === descriptor.channelId`;
2. `source.providerChannelId` present in `descriptor.epgIds`;
3. `source.tvgId` present in `descriptor.epgIds`;
4. normalized-name fallback in Task 2.

For each stage, collect all candidates. Return the channel only when the candidate set has exactly one distinct `channelId`; if a stage has more than one distinct match, return `null` immediately instead of falling through to a weaker rule.

Implement the public function around:

```ts
function uniqueChannelId(matches: readonly EpgChannelDescriptor[]): ChannelId | null {
  const ids = Array.from(new Set(matches.map((item) => item.channelId)));
  return ids.length === 1 ? ids[0] ?? null : null;
}
```

- [ ] **Step 4: Prove focused GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-MAP"
npm run typecheck -w player
git add player/src/epg/channel-mapper.ts player/test-ts/epg-channel-mapper.test.ts
git commit -m "feat(epg): add stable channel mapper"
```

---

### Task 2: Add approved text fallback and ambiguity rejection

**Files:**
- Modify: `player/src/epg/channel-mapper.ts`
- Modify: `player/test-ts/epg-channel-mapper.test.ts`

- [ ] **Step 1: Add RED fallback tests**

```ts
test('EPG-MAP uses normalized name only when unambiguous', () => {
  const unique = [
    { providerId: 'p1', channelId: 'a', name: 'İstanbul TV', epgIds: [] },
  ] as const;
  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null, tvgId: null, name: '  İSTANBUL   TV ',
  }, unique), 'a');

  const ambiguous = [
    ...unique,
    { providerId: 'p1', channelId: 'b', name: 'İstanbul TV', epgIds: [] },
  ] as const;
  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null, tvgId: null, name: 'İstanbul TV',
  }, ambiguous), null);
});
```

- [ ] **Step 2: Implement Turkish-safe fallback normalization**

```ts
function normalizeFallbackName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR');
}
```

Only run this stage when `source.name` is non-empty after trimming. Do not remove punctuation, channel numbers, HD/UHD suffixes, or diacritics; that would create false-positive matches outside the approved conservative fallback.

- [ ] **Step 3: Lock reorder/duplicate/provider-isolation behavior**

Add tests proving:

- reversing descriptor order does not change the selected ID;
- duplicate descriptors with the same `channelId` still yield that ID;
- two distinct channels with the same stable EPG ID return `null`;
- a perfect ID match in provider `p2` cannot satisfy a `p1` lookup;
- no identifiers/name returns `null`.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-MAP"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/epg/channel-mapper.ts player/test-ts/epg-channel-mapper.test.ts
git commit -m "test(epg): lock channel reconciliation rules"
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

Expected: exactly the two owned files. No provider network data, credentials, URLs, persistence, or UI changes.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, stable-ID RED/GREEN, ambiguity/reorder/provider-isolation results, full gates, and scope audit. Explicitly state that normalization/parser/persistence/query/UI are separate lanes. Do not Ready/merge.
