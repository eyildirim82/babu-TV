# BabuşTV V1 Wave 1 PAIR-R Pairing Relay Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define and implement a sanitized, ciphertext-only pairing relay client contract that works against the same HTTPS protocol for BabuşTV public and self-hosted relay endpoints.

**Architecture:** `PAIR-R` defines relay request/response shapes and a client over an injected HTTP transport. Relay messages contain session metadata plus an opaque ciphertext string only; TV public keys travel in the QR flow, not through this relay contract. Crypto, session lifecycle internals, provider registration, and phone/TV UI remain separate lanes.

**Tech Stack:** TypeScript 5.9, Node `node:test`, `tsx`; injected transport, no HTTP/crypto dependency.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `PAIR-R`.
- Branch: `feature/pairing-relay-contract`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/pairing/relay-contracts.ts`, `player/src/pairing/relay-client.ts`, and `player/test-ts/pairing-relay-client.test.ts`.
- No import from unmerged `PAIR-C` or `PAIR-S`; ciphertext is an opaque string and session ID is a string.
- Forbidden hot zones: provider/CredentialStore integration, crypto implementation, pairing session implementation, UI/QR, `main.js`, storage/IndexedDB, playback, package/Tizen identity.
- Relay base endpoints are HTTPS only; do not place secrets in URL query/user-info.
- Client error messages are fixed/sanitized and never include endpoint URL, session data, response body, ciphertext, or underlying thrown text.
- No new dependency and no real relay/provider endpoint in tests.

---

### Task 1: Freeze ciphertext-only relay message shapes

**Files:**
- Create: `player/src/pairing/relay-contracts.ts`
- Create: `player/test-ts/pairing-relay-client.test.ts`

**Interfaces:**
- Produces: relay request/response contracts and `PairingRelayTransport`.

- [ ] **Step 1: Write compile RED acceptance**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  PairingRelayCreateSessionRequest,
  PairingRelayPutCiphertextRequest,
  PairingRelayPollResponse,
  PairingRelayTransport,
} from '../src/pairing/relay-contracts.js';

void (null as unknown as PairingRelayCreateSessionRequest);
void (null as unknown as PairingRelayPutCiphertextRequest);
void (null as unknown as PairingRelayPollResponse);
void (null as unknown as PairingRelayTransport);

test('PAIR-R contract suite loads without runtime side effects', () => {
  assert.equal(true, true);
});
```

- [ ] **Step 2: Prove RED with strict typecheck**

```bash
npm run typecheck -w player
```

Expected: FAIL because `pairing/relay-contracts.ts` does not exist.

- [ ] **Step 3: Add exact contracts**

```ts
export interface PairingRelayCreateSessionRequest {
  sessionId: string;
  expiresAtMs: number;
}

export interface PairingRelayPutCiphertextRequest {
  sessionId: string;
  ciphertext: string;
}

export type PairingRelayPollResponse =
  | { status: 'pending' }
  | { status: 'ready'; ciphertext: string }
  | { status: 'expired' }
  | { status: 'consumed' };

export interface PairingRelayRequest {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
  timeoutMs: number;
}

export interface PairingRelayTransport {
  request<T>(request: PairingRelayRequest): Promise<T>;
}
```

Do not add plaintext/provider credential fields, logging metadata, or generic arbitrary JSON payload fields.

- [ ] **Step 4: Prove GREEN and commit**

```bash
npm run typecheck -w player
npm run test:ts -w player -- --test-name-pattern="PAIR-R contract suite"
git add player/src/pairing/relay-contracts.ts player/test-ts/pairing-relay-client.test.ts
git commit -m "feat(pairing): freeze relay contracts"
```

---

### Task 2: Add public/self-host compatible relay client paths

**Files:**
- Create: `player/src/pairing/relay-client.ts`
- Modify: `player/test-ts/pairing-relay-client.test.ts`

**Interfaces:**
- Produces: `PairingRelayError`, `normalizePairingRelayBaseUrl`, `PairingRelayClient`.

- [ ] **Step 1: Write RED request-shape acceptance**

```ts
test('PAIR-R sends only session metadata and ciphertext through the relay protocol', async () => {
  const requests: PairingRelayRequest[] = [];
  const transport: PairingRelayTransport = {
    async request<T>(request: PairingRelayRequest): Promise<T> {
      requests.push(request);
      if (request.method === 'GET') return { status: 'pending' } as T;
      return { ok: true } as T;
    },
  };
  const client = new PairingRelayClient('https://relay.example.invalid/base/', transport, 5000);
  await client.createSession({ sessionId: 's1', expiresAtMs: 123 });
  await client.putCiphertext({ sessionId: 's1', ciphertext: 'opaque-ciphertext' });
  await client.poll('s1');

  assert.deepEqual(requests.map((request) => [request.method, new URL(request.url).pathname]), [
    ['POST', '/base/v1/pairing/sessions'],
    ['POST', '/base/v1/pairing/sessions/s1/ciphertext'],
    ['GET', '/base/v1/pairing/sessions/s1/ciphertext'],
  ]);
  assert.equal(JSON.stringify(requests).includes('password'), false);
  assert.equal(JSON.stringify(requests).includes('username'), false);
});
```

- [ ] **Step 2: Implement strict base URL normalization**

`normalizePairingRelayBaseUrl(raw)` must parse/trim the URL, require `https:`, reject username/password user-info, clear search/hash, and remove trailing slashes from pathname. Invalid input throws `PairingRelayError('UNAVAILABLE')` with message `Pairing relay is unavailable.`.

- [ ] **Step 3: Implement the client**

Use URL-encoded `sessionId` path segments and exact protocol paths:

```text
POST {base}/v1/pairing/sessions
POST {base}/v1/pairing/sessions/{sessionId}/ciphertext
GET  {base}/v1/pairing/sessions/{sessionId}/ciphertext
```

`createSession` body is exactly `{ sessionId, expiresAtMs }`. `putCiphertext` body is exactly `{ ciphertext }`; do not redundantly put sessionId or any provider metadata in the body. `poll` sends no body and validates the response as one of `pending`, `ready` with string ciphertext, `expired`, or `consumed`.

Default timeout is not hard-coded globally: constructor receives `timeoutMs`, validates it as finite positive, and applies it to each transport request.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-R"
npm run typecheck -w player
git add player/src/pairing/relay-contracts.ts player/src/pairing/relay-client.ts player/test-ts/pairing-relay-client.test.ts
git commit -m "feat(pairing): add ciphertext-only relay client"
```

---

### Task 3: Sanitize failures and reject malformed relay responses

**Files:**
- Modify: `player/src/pairing/relay-client.ts`
- Modify: `player/test-ts/pairing-relay-client.test.ts`

- [ ] **Step 1: Add sanitized failure tests**

A transport that throws `new Error('https://secret.invalid/?payload=plaintext')` must surface only a `PairingRelayError` with code `NETWORK` and fixed message `Pairing relay request failed.`. A poll response `{ status: 'ready' }`, unknown status, array, null, or plaintext-shaped object must produce `MALFORMED` with fixed message `Pairing relay response was malformed.`.

- [ ] **Step 2: Implement error type and validation**

```ts
export type PairingRelayErrorCode = 'NETWORK' | 'MALFORMED' | 'UNAVAILABLE';

export class PairingRelayError extends Error {
  constructor(public readonly code: PairingRelayErrorCode) {
    super(
      code === 'MALFORMED'
        ? 'Pairing relay response was malformed.'
        : code === 'UNAVAILABLE'
          ? 'Pairing relay is unavailable.'
          : 'Pairing relay request failed.',
    );
    this.name = 'PairingRelayError';
  }
}
```

Wrap unknown transport exceptions as `NETWORK`; preserve an already-sanitized `PairingRelayError`. Never concatenate caught error text.

- [ ] **Step 3: Add protocol-surface audit test**

Assert serialized create/put bodies contain only `sessionId`, `expiresAtMs`, or `ciphertext` as applicable. Explicitly assert absence of keys named `provider`, `credential`, `username`, `password`, `playlistUrl`, `serverUrl`, `token`, and `plaintext`.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-R"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/pairing/relay-client.ts player/test-ts/pairing-relay-client.test.ts
git commit -m "test(pairing): lock relay privacy and failure semantics"
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

- [ ] **Step 2: Audit exact scope/security**

```bash
git diff --name-only aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff --check aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
git diff aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected: exactly the three owned files. Confirm only `https://relay.example.invalid` synthetic endpoint appears in tests; no real provider/relay secrets, plaintext provider payload, logging, UI, storage, or provider integration.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, contract RED/GREEN, request-shape/privacy audit, sanitized failure/malformed response evidence, full gates, and scope audit. Note that relay server rate limiting/hosting behavior is not claimed by this client lane and must be verified in its later server/deployment package. Do not Ready/merge.
