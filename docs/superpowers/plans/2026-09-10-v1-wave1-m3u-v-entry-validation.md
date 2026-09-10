# BabuşTV V1 Wave 1 M3U-V Entry Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add modern M3U playlist-entry normalization and validation primitives that preserve failed user input and keep credential-bearing playlist URLs out of logs/errors and ordinary provider metadata.

**Architecture:** `M3U-V` is a pure validation boundary in the existing M3U provider area. It accepts raw playlist URL input, validates only supported HTTP(S) URLs, returns a `M3uCredential` on success, and returns a fixed error code plus the original input on failure. It does not register/sync/activate providers and does not own UI.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`, existing `M3uCredential` contract.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `M3U-V`.
- Branch: `feature/m3u-entry-validation`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/providers/m3u/m3u-entry-validation.ts` and `player/test-ts/m3u-entry-validation.test.ts`.
- Read-only dependencies: `player/src/credentials/contracts.ts`, existing `player/src/providers/m3u/*`, Provider Core contracts/services for understanding only.
- Forbidden hot zones: `provider-core-service.ts`, provider runtime/factory/composition, CredentialStore implementations, storage, `main.js`, UI, playback/session, package/Tizen identity.
- Do not alter legacy M3U parser/provider behavior in this lane.
- No console logging, no serialized credential URL in errors, no ordinary provider-record field containing the playlist URL.
- No new dependency and no real provider URL fixture.

---

### Task 1: Add explicit M3U entry validation result contracts

**Files:**
- Create: `player/src/providers/m3u/m3u-entry-validation.ts`
- Create: `player/test-ts/m3u-entry-validation.test.ts`

**Interfaces:**
- Consumes: `M3uCredential`.
- Produces: `M3uEntryInput`, `M3uEntryValidationErrorCode`, `M3uEntryValidationResult`, `validateM3uEntry`.

- [ ] **Step 1: Write RED success/failure acceptance**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateM3uEntry } from '../src/providers/m3u/m3u-entry-validation.js';

test('M3U-V validates HTTP(S) playlist input and preserves failed input', () => {
  assert.deepEqual(validateM3uEntry({ playlistUrl: '  https://example.invalid/list.m3u  ' }), {
    ok: true,
    credential: { kind: 'm3u', playlistUrl: 'https://example.invalid/list.m3u' },
  });

  assert.deepEqual(validateM3uEntry({ playlistUrl: '  ftp://example.invalid/list.m3u  ' }), {
    ok: false,
    code: 'UNSUPPORTED_PROTOCOL',
    input: { playlistUrl: '  ftp://example.invalid/list.m3u  ' },
  });
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="M3U-V validates HTTP"
npm run typecheck -w player
```

Expected: FAIL because the validation module does not exist.

- [ ] **Step 3: Implement exact result types and validation**

Create:

```ts
import type { M3uCredential } from '../../credentials/contracts.js';

export interface M3uEntryInput {
  playlistUrl: string;
}

export type M3uEntryValidationErrorCode =
  | 'REQUIRED'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL';

export type M3uEntryValidationResult =
  | { ok: true; credential: M3uCredential }
  | { ok: false; code: M3uEntryValidationErrorCode; input: M3uEntryInput };

export function validateM3uEntry(input: M3uEntryInput): M3uEntryValidationResult {
  const raw = input.playlistUrl;
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, code: 'REQUIRED', input: { ...input } };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, code: 'INVALID_URL', input: { ...input } };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, code: 'UNSUPPORTED_PROTOCOL', input: { ...input } };
  }

  parsed.hash = '';
  return {
    ok: true,
    credential: { kind: 'm3u', playlistUrl: parsed.toString() },
  };
}
```

Do not strip query parameters or URL user-info on success because those may be required provider credentials; the success value is intentionally a `CredentialStore`-bound credential, not ordinary metadata. Do strip the fragment because it is not transmitted in HTTP requests.

- [ ] **Step 4: Prove GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M3U-V"
npm run typecheck -w player
git add player/src/providers/m3u/m3u-entry-validation.ts player/test-ts/m3u-entry-validation.test.ts
git commit -m "feat(m3u): add modern entry validation"
```

---

### Task 2: Lock secret-safe failure and normalization behavior

**Files:**
- Modify: `player/test-ts/m3u-entry-validation.test.ts`

- [ ] **Step 1: Add credential-bearing synthetic input tests**

Use only synthetic data:

```ts
test('M3U-V never echoes a credential URL through an error message', () => {
  const raw = 'not-a-url?opaque=test-value';
  const result = validateM3uEntry({ playlistUrl: raw });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'INVALID_URL');
  assert.deepEqual(result.input, { playlistUrl: raw });
  assert.equal('message' in result, false);
});

test('M3U-V preserves credential-bearing query data only inside the success credential', () => {
  const result = validateM3uEntry({ playlistUrl: 'https://example.invalid/list.m3u?opaque=test-value#ignored' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.credential.playlistUrl, 'https://example.invalid/list.m3u?opaque=test-value');
});
```

- [ ] **Step 2: Add URL edge cases**

Cover uppercase/trailing whitespace, plain HTTP, relative URLs, whitespace-only input, `javascript:`, and malformed percent encodings. Expected result is deterministic and uses only the three error codes above.

- [ ] **Step 3: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="M3U-V"
npm run test:ts -w player
npm run typecheck -w player
git add player/test-ts/m3u-entry-validation.test.ts
git commit -m "test(m3u): lock entry validation safety"
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

- [ ] **Step 2: Audit scope and secret leakage**

```bash
git diff --name-only aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff --check aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected: only the two owned files. Confirm all URL literals use reserved synthetic/example domains and no real provider credential appears.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, RED/GREEN, failure-preserves-input and URL safety evidence, full gates, and scope audit. Explicitly defer `validate → register → sync → cache validate → activate` composition to `M3U-C` and UI to `M3U-UI`. Do not Ready/merge.
