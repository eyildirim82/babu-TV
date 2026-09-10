# BabuşTV V1 Wave 1 PAIR-S Pairing Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-memory, deterministic pairing session state machine with cryptographically random session IDs, the approved five-minute default TTL, single-use consumption, and replay rejection.

**Architecture:** `PAIR-S` is generic over the opaque session value it protects and has no crypto/relay/provider knowledge. It uses injected clock and ID-generator seams for deterministic tests; the default ID generator uses 128 random bits from Web Crypto. Consumed sessions remain tombstoned until expiry so a replay is distinguishable from an unknown ID.

**Tech Stack:** TypeScript 5.9, Web Crypto random values, Node `node:test`/`tsx`; no dependency.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `PAIR-S`.
- Branch: `feature/pairing-session`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/pairing/session.ts` and `player/test-ts/pairing-session.test.ts`.
- No import from `PAIR-C` or `PAIR-R`; session values are opaque generic data.
- Forbidden hot zones: relay/network, crypto implementation, CredentialStore/provider registration, UI/QR, storage/IndexedDB, `main.js`, playback, package/Tizen identity.
- Approved V1 default TTL is exactly `5 * 60 * 1000` ms unless a later approved spec supersedes it.
- Session payload/value must never be logged or serialized by this module.
- No new dependency or real secrets in tests.

---

### Task 1: Add random session ID and creation contract

**Files:**
- Create: `player/src/pairing/session.ts`
- Create: `player/test-ts/pairing-session.test.ts`

**Interfaces:**
- Produces: `DEFAULT_PAIRING_TTL_MS`, `PairingSessionDescriptor`, `PairingSessionManager<T>`.

- [ ] **Step 1: Write RED deterministic creation acceptance**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAIRING_TTL_MS,
  PairingSessionManager,
} from '../src/pairing/session.js';

test('PAIR-S creates a five-minute session through injected clock and id', () => {
  const manager = new PairingSessionManager<string>({
    nowMs: () => 1000,
    makeSessionId: () => 'session-1',
  });
  assert.deepEqual(manager.create('opaque-handle'), {
    sessionId: 'session-1',
    createdAtMs: 1000,
    expiresAtMs: 1000 + DEFAULT_PAIRING_TTL_MS,
  });
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-S creates a five-minute"
npm run typecheck -w player
```

Expected: FAIL because `pairing/session.ts` does not exist.

- [ ] **Step 3: Implement creation types and defaults**

```ts
export const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;

export interface PairingSessionDescriptor {
  sessionId: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface PairingSessionDependencies {
  nowMs?: () => number;
  makeSessionId?: () => string;
}
```

Implement default session IDs as Base64URL without padding from 16 bytes filled with `globalThis.crypto.getRandomValues`. If secure random is unavailable, throw a sanitized `Error('Pairing session randomness is unavailable.')`; do not fall back to `Math.random()`.

Store internal entries as `{ descriptor, value, consumed: boolean }`. `create(value, ttlMs = DEFAULT_PAIRING_TTL_MS)` validates finite positive TTL and finite current time, rejects an ID collision instead of overwriting an existing session, and returns only the descriptor.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-S"
npm run typecheck -w player
git add player/src/pairing/session.ts player/test-ts/pairing-session.test.ts
git commit -m "feat(pairing): add expiring session creation"
```

---

### Task 2: Add expiry, single-use consumption, and replay rejection

**Files:**
- Modify: `player/src/pairing/session.ts`
- Modify: `player/test-ts/pairing-session.test.ts`

**Interfaces:**
- Produces: `PairingConsumeResult<T>`, `consume(sessionId)`, `purgeExpired()`.

- [ ] **Step 1: Write RED state-machine acceptance**

```ts
test('PAIR-S consumes once, rejects replay, and expires at the boundary', () => {
  let now = 1000;
  let id = 0;
  const manager = new PairingSessionManager<string>({
    nowMs: () => now,
    makeSessionId: () => `s-${++id}`,
  });

  const first = manager.create('secret-handle', 100);
  assert.deepEqual(manager.consume(first.sessionId), { status: 'ok', value: 'secret-handle' });
  assert.deepEqual(manager.consume(first.sessionId), { status: 'consumed' });

  const second = manager.create('other', 100);
  now = second.expiresAtMs;
  assert.deepEqual(manager.consume(second.sessionId), { status: 'expired' });
  assert.deepEqual(manager.consume('missing'), { status: 'missing' });
});
```

- [ ] **Step 2: Implement exact consume result**

```ts
export type PairingConsumeResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'missing' }
  | { status: 'expired' }
  | { status: 'consumed' };
```

`consume` rules in order:

1. no entry → `missing`;
2. `nowMs() >= expiresAtMs` → `expired`;
3. already consumed → `consumed`;
4. mark consumed and return `{ status: 'ok', value }`.

Do not delete on successful consume; retain the consumed tombstone until expiry. `purgeExpired()` removes entries whose expiry is `<= nowMs()` and returns the number removed. It must never return session values.

- [ ] **Step 3: Add collision/isolation/custom-TTL tests**

Prove duplicate generated ID cannot overwrite the first session, two sessions consume independently, custom positive TTL works, zero/negative/NaN TTL is rejected, and `purgeExpired` removes only expired entries.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-S"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/pairing/session.ts player/test-ts/pairing-session.test.ts
git commit -m "feat(pairing): enforce single-use session lifecycle"
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

- [ ] **Step 2: Audit exact scope/security**

```bash
git diff --name-only aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff --check aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected: only the two owned files. Confirm no `Math.random`, logging, persistence, relay URL, crypto envelope, provider credential, UI, or hot-zone change.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, creation RED/GREEN, five-minute TTL, exact expiry boundary, single-use/replay/collision/purge evidence, full gates, and scope audit. Do not claim relay-side rate limiting or crypto behavior; those are separate packages. Do not Ready/merge.
