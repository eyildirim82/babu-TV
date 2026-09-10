# BabuşTV V1 Wave 1 EPG-X Xtream EPG Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode Xtream EPG responses into frozen `EpgSourceProgram` values with sanitized failure behavior, without owning Provider Core integration, common normalization, persistence, mapping, or UI.

**Architecture:** `EPG-X` provides a pure Xtream decoder plus a narrow channel-level HTTP loader. The loader receives the already-built request URL and an explicit provider channel ID from its caller; it never stores or logs the URL. Provider-wide refresh/orchestration and credential-bearing URL construction remain owned by later `EPG-PI` integration.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`, existing `ProviderHttpClient`, `ProviderError`, RC-F0 EPG contracts.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `EPG-X`.
- Branch: `feature/epg-xtream-adapter`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/epg/xtream-source.ts` and `player/test-ts/epg-xtream-source.test.ts`.
- Read-only dependencies: `player/src/epg/contracts.ts`, `player/src/providers/errors.ts`, `player/src/providers/http/contracts.ts`.
- Forbidden hot zones: `player/src/providers/xtream/xtream-provider.ts`, provider runtime/factory files, `main.js`, Live TV, storage, playback/session, package/Tizen identity.
- Do not modify RC-F0 contracts or existing Xtream provider behavior.
- Common EPG normalization belongs to `EPG-N`; mapping belongs to `EPG-MAP`; persistence/query belong to later lanes.
- No new npm dependency.
- Synthetic Xtream fixtures only. Never commit or log a credential-bearing Xtream URL, username, password, token, stream URL, or real EPG dump.

---

### Task 1: Decode the Xtream EPG container

**Files:**
- Create: `player/src/epg/xtream-source.ts`
- Create: `player/test-ts/epg-xtream-source.test.ts`

**Interfaces:**
- Consumes: `EpgSourceProgram`, `ProviderHttpClient`, `ProviderError`.
- Produces: `decodeXtreamEpgResponse(raw, providerChannelId)`.

- [ ] **Step 1: Write RED acceptance with a synthetic encoded response**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeXtreamEpgResponse } from '../src/epg/xtream-source.js';

test('EPG-X decodes Xtream listings into source programs', () => {
  const rows = decodeXtreamEpgResponse({
    epg_listings: [{
      stream_id: '42',
      channel_id: 'trt1.tr',
      title: 'SGFiZXJsZXI=',
      description: 'R8O8bsO8biDDtnpldGk=',
      start_timestamp: '100',
      stop_timestamp: 200,
    }],
  }, '42');

  assert.deepEqual(rows, [{
    sourceChannel: { providerChannelId: '42', tvgId: 'trt1.tr', name: null },
    startMs: 100000,
    endMs: 200000,
    title: 'Haberler',
    description: 'Günün özeti',
  }]);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-X decodes Xtream listings"
npm run typecheck -w player
```

Expected: FAIL because `../src/epg/xtream-source.js` does not exist.

- [ ] **Step 3: Implement exact structural decoding**

Create a decoder with these rules:

```ts
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function epochSecondsToMs(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(numberValue) ? numberValue * 1000 : null;
}

function decodeBase64Utf8(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
```

`decodeXtreamEpgResponse` must require an object containing `epg_listings: unknown[]`; otherwise throw `new ProviderError('MALFORMED', null, 'Provider EPG response was malformed.')`. For each listing, use `stream_id` when present and otherwise the caller-provided `providerChannelId`; use `channel_id` then `epg_id` as `tvgId`; use Unix `start_timestamp`/`stop_timestamp`; Base64-decode `title` and optional `description`. Skip an individual listing when its required fields cannot be decoded; do not throw away other valid rows.

- [ ] **Step 4: Prove focused GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-X"
npm run typecheck -w player
git add player/src/epg/xtream-source.ts player/test-ts/epg-xtream-source.test.ts
git commit -m "feat(epg): decode Xtream EPG responses"
```

---

### Task 2: Add sanitized channel-level loading and malformed-row coverage

**Files:**
- Modify: `player/src/epg/xtream-source.ts`
- Modify: `player/test-ts/epg-xtream-source.test.ts`

**Interfaces:**
- Produces: `loadXtreamChannelEpg(http, requestUrl, providerChannelId)`.

- [ ] **Step 1: Write RED loader/error tests**

Add a fake `ProviderHttpClient` and prove:

```ts
test('EPG-X preserves ProviderError classification and sanitizes unknown failures', async () => {
  const authHttp = {
    getJson: async () => { throw new ProviderError('AUTH', 401, 'Provider authentication failed.'); },
    getText: async () => '',
  };
  await assert.rejects(
    () => loadXtreamChannelEpg(authHttp, 'https://synthetic.invalid/redacted', '42'),
    (error: unknown) => error instanceof ProviderError && error.code === 'AUTH',
  );

  const unknownHttp = {
    getJson: async () => { throw new Error('https://secret.invalid/?username=u&password=p'); },
    getText: async () => '',
  };
  await assert.rejects(
    () => loadXtreamChannelEpg(unknownHttp, 'https://synthetic.invalid/redacted', '42'),
    (error: unknown) => error instanceof ProviderError
      && error.code === 'NETWORK'
      && !error.message.includes('secret.invalid'),
  );
});
```

Use only the synthetic URL shown above; it carries no real credential.

- [ ] **Step 2: Implement the narrow loader**

```ts
export async function loadXtreamChannelEpg(
  http: ProviderHttpClient,
  requestUrl: string,
  providerChannelId: string,
): Promise<readonly EpgSourceProgram[]> {
  try {
    const raw = await http.getJson<unknown>(requestUrl);
    return decodeXtreamEpgResponse(raw, providerChannelId);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('NETWORK', null, 'Provider EPG request failed.');
  }
}
```

Do not add console logging and do not retain `requestUrl` in returned values or error messages.

- [ ] **Step 3: Add malformed-row tests**

Prove invalid timestamps, invalid Base64 title, and blank/missing listings are rejected or skipped deterministically while valid sibling rows survive.

- [ ] **Step 4: Run focused GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="EPG-X"
npm run typecheck -w player
git add player/src/epg/xtream-source.ts player/test-ts/epg-xtream-source.test.ts
git commit -m "test(epg): lock Xtream EPG failure handling"
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

- [ ] **Step 2: Audit scope/secrets**

```bash
git diff --name-only aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff --check aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected: exactly the two owned files. Search the diff for `username=`, `password=`, real hosts, tokens, and stream URLs; none may be present except explicitly synthetic test literals without secrets.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, RED/GREEN evidence, full gate results, changed files, sanitizer audit, and explicitly defer URL construction/provider refresh integration to `EPG-PI`. Do not Ready/merge.
