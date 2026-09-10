# BabuşTV V1 Wave 1 EPG-XML XMLTV Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse the XMLTV subset needed by BabuşTV into transport-neutral `EpgSourceProgram` records with explicit timezone handling and bounded, dependency-free behavior.

**Architecture:** `EPG-XML` owns a small single-pass XMLTV parser for `<programme>` records and the timestamp/entity primitives it needs. It does not fetch XML, map programs to BabuşTV channels, persist data, choose cache windows, or render UI. Unknown XMLTV elements are ignored; malformed required programme fields are skipped without poisoning valid siblings.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`; no XML parser dependency.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `EPG-XML`.
- Branch: `feature/epg-xmltv-parser`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/epg/xmltv-parser.ts` and `player/test-ts/epg-xmltv-parser.test.ts`.
- Read-only dependency: `player/src/epg/contracts.ts`.
- Forbidden hot zones: provider/network code, M3U channel reconciliation, storage/IndexedDB, Live TV, `main.js`, playback/session, package/Tizen identity.
- Do not add an npm XML dependency. The parser must be framework-free and deterministic under Node tests and the generated Tizen bundle.
- XMLTV timestamps without an explicit numeric UTC offset are rejected rather than interpreted in the device timezone.
- No real provider XMLTV files or credential-bearing XMLTV URLs in source/tests/evidence.

---

### Task 1: Freeze XMLTV timestamp and entity primitives

**Files:**
- Create: `player/src/epg/xmltv-parser.ts`
- Create: `player/test-ts/epg-xmltv-parser.test.ts`

**Interfaces:**
- Produces: `parseXmltvTimestamp(value)` and `decodeXmlText(value)` as exported testable helpers.

- [ ] **Step 1: Write RED timestamp tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeXmlText,
  parseXmltvTimestamp,
} from '../src/epg/xmltv-parser.js';

test('EPG-XML parses explicit XMLTV offsets to epoch milliseconds', () => {
  assert.equal(
    parseXmltvTimestamp('20260910150000 +0300'),
    Date.UTC(2026, 8, 10, 12, 0, 0),
  );
  assert.equal(parseXmltvTimestamp('20260910150000'), null);
});

test('EPG-XML decodes XML entities and CDATA text', () => {
  assert.equal(decodeXmlText('A &amp; B &#304;'), 'A & B İ');
  assert.equal(decodeXmlText('<![CDATA[A < B]]>'), 'A < B');
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-XML parses explicit XMLTV offsets"
npm run typecheck -w player
```

Expected: FAIL because `xmltv-parser.ts` does not exist.

- [ ] **Step 3: Implement exact timestamp behavior**

Use this shape:

```ts
export function parseXmltvTimestamp(value: string): number | null {
  const match = value.trim().match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s+([+-])(\d{2})(\d{2})$/,
  );
  if (!match) return null;

  const [, y, mo, d, h, mi, s = '00', sign, oh, om] = match;
  const localLikeUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const offsetMs = (+oh * 60 + +om) * 60_000 * (sign === '+' ? 1 : -1);
  const epochMs = localLikeUtc - offsetMs;
  return Number.isFinite(epochMs) ? epochMs : null;
}
```

Validate calendar round-tripping so impossible dates such as month 13 or February 31 return `null`; do not rely on `Date.UTC` rollover as validity.

- [ ] **Step 4: Implement entity/CDATA decoding**

`decodeXmlText` must strip one outer CDATA wrapper and decode `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, decimal numeric entities, and hexadecimal numeric entities. Unknown named entities remain unchanged rather than executing or expanding external entities.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-XML"
npm run typecheck -w player
git add player/src/epg/xmltv-parser.ts player/test-ts/epg-xmltv-parser.test.ts
git commit -m "feat(epg): add XMLTV parsing primitives"
```

---

### Task 2: Parse programme records into the frozen source contract

**Files:**
- Modify: `player/src/epg/xmltv-parser.ts`
- Modify: `player/test-ts/epg-xmltv-parser.test.ts`

**Interfaces:**
- Consumes: `EpgSourceProgram`.
- Produces: `parseXmltvPrograms(xml)`.

- [ ] **Step 1: Write RED programme acceptance**

```ts
test('EPG-XML extracts programme channel, interval, title, and description', () => {
  const xml = `<?xml version="1.0"?>
    <tv>
      <programme start="20260910150000 +0300" stop="20260910153000 +0300" channel="trt1.tr">
        <title lang="tr">Haberler</title>
        <desc>Günün &amp; gündemin özeti</desc>
      </programme>
    </tv>`;

  assert.deepEqual(parseXmltvPrograms(xml), [{
    sourceChannel: { providerChannelId: null, tvgId: 'trt1.tr', name: null },
    startMs: Date.UTC(2026, 8, 10, 12, 0, 0),
    endMs: Date.UTC(2026, 8, 10, 12, 30, 0),
    title: 'Haberler',
    description: 'Günün & gündemin özeti',
  }]);
});
```

- [ ] **Step 2: Implement a bounded programme scanner**

Use a global programme matcher and a quoted-attribute parser; do not execute DTD/entities and do not evaluate markup. The supported extraction contract is:

```ts
export function parseXmltvPrograms(xml: string): readonly EpgSourceProgram[] {
  const programs: EpgSourceProgram[] = [];
  const programmePattern = /<programme\b([^>]*)>([\s\S]*?)<\/programme\s*>/gi;
  let match: RegExpExecArray | null;

  while ((match = programmePattern.exec(xml)) !== null) {
    const attrs = parseQuotedAttributes(match[1] ?? '');
    const startMs = attrs.start ? parseXmltvTimestamp(attrs.start) : null;
    const endMs = attrs.stop ? parseXmltvTimestamp(attrs.stop) : null;
    const channel = attrs.channel?.trim() ?? '';
    if (startMs === null || endMs === null || startMs >= endMs || !channel) continue;

    const body = match[2] ?? '';
    const title = extractElementText(body, 'title')?.trim() ?? '';
    if (!title) continue;
    const description = extractElementText(body, 'desc')?.trim() || null;

    programs.push({
      sourceChannel: { providerChannelId: null, tvgId: channel, name: null },
      startMs,
      endMs,
      title,
      description,
    });
  }

  return programs;
}
```

`parseQuotedAttributes` must accept single or double quoted values. `extractElementText` must ignore element attributes and decode text through `decodeXmlText`. This parser intentionally supports the V1 XMLTV subset only; do not expand into a general XML implementation.

- [ ] **Step 3: Lock malformed sibling behavior**

Add a test containing one invalid programme followed by a valid programme and assert only the valid record is returned. Add a test for single-quoted attributes and a timestamp with negative offset.

- [ ] **Step 4: Commit**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-XML"
npm run typecheck -w player
git add player/src/epg/xmltv-parser.ts player/test-ts/epg-xmltv-parser.test.ts
git commit -m "feat(epg): parse XMLTV programme records"
```

---

### Task 3: Add large-input evidence without a flaky microbenchmark

**Files:**
- Modify: `player/test-ts/epg-xmltv-parser.test.ts`

- [ ] **Step 1: Add deterministic large synthetic input test**

Generate 5,000 `<programme>` records in-memory, parse them once, assert 5,000 outputs and stable first/last titles. Record elapsed milliseconds with `performance.now()` only as diagnostic output when the test fails; use a generous 2,000 ms upper bound on Node 22 to catch accidental quadratic behavior without turning ordinary runner variance into noise.

- [ ] **Step 2: Run focused/full tests and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-XML"
npm run test:ts -w player
npm run typecheck -w player
git add player/test-ts/epg-xmltv-parser.test.ts
git commit -m "test(epg): cover large XMLTV inputs"
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

- [ ] **Step 2: Audit exact scope and fixture safety**

```bash
git diff --name-only aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff --check aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected: only the two owned files. No real XMLTV URL/dump or secrets.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, RED/GREEN, large-input evidence, full gates, and scope audit. State explicitly that fetch/network, channel mapping, normalization, persistence, query, and UI are deferred to their named lanes. Do not Ready/merge.
