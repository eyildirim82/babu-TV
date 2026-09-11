# Wave 3C Pairing Core Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TV-side pairing orchestrator that creates a single-use session, exposes public bootstrap data, receives relay ciphertext, decrypts/strictly decodes it, and delegates to existing Xtream/M3U onboarding services without touching application hot zones.

**Architecture:** Add one focused pairing TV controller/orchestrator with injected crypto, session, relay, clock/config, and onboarding ports. The orchestrator owns no provider persistence: it delegates valid payloads to existing onboarding ports. It consumes a ready relay ciphertext at most once; malformed/crypto/onboarding failures require a new pairing session rather than replaying secrets through the same session.

**Tech Stack:** TypeScript 5.9, Web Crypto wrappers already in PAIR-C, `PairingSessionManager` from PAIR-S, `PairingRelayClient` contract from PAIR-R, strict PAIR-WEB payload decoder, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-closure-design.md`

## Global Constraints

- Frozen starting base: `92af4f5b9d445ced236a63f581716a55bf87ebeb`.
- Branch: `integration/pairing-core`.
- Forbidden: `player/src/app/app-composition.ts`, `player/src/app/browser-app-dependencies.ts`, `player/src/main.js`, provider-management composition, Live TV runtime/controller.
- No PAIR-C/PAIR-S/PAIR-R algorithm changes unless a compile defect proves impossible to avoid; stop and report before widening scope.
- Relay receives ciphertext only; plaintext provider credentials never enter relay request structures.
- TV private key stays in memory, non-extractable, and is never persisted/logged/serialized.
- Existing strict provider payload decoder remains authority for Xtream/M3U plaintext payload shape.
- Existing onboarding services remain authority for provider registration/credential persistence/activation.
- No implicit playback.
- Draft PR only until controller review.

---

### Task 1: Define the TV pairing orchestrator contract and RED lifecycle tests

**Files:**
- Create: `player/src/pairing/tv-controller.ts`
- Create: `player/test-ts/pairing-tv-controller.test.ts`

**Interfaces:**

Create these ports in `tv-controller.ts`:

```ts
import type { ProviderId } from '../domain/models.js';
import type { PairingCiphertextV1, PairingTvKeyPair } from './crypto.js';
import type { PairingProviderPayloadV1 } from './phone-payload.js';
import type { PairingSessionDescriptor } from './session.js';

export interface PairingTvCryptoPort {
  generateTvKeyPair(): Promise<PairingTvKeyPair>;
  decrypt(privateKey: CryptoKey, envelope: PairingCiphertextV1): Promise<Uint8Array>;
}

export interface PairingTvSessionPort<T> {
  create(value: T): PairingSessionDescriptor;
  consume(sessionId: string):
    | { status: 'ok'; value: T }
    | { status: 'missing' }
    | { status: 'expired' }
    | { status: 'consumed' };
}

export interface PairingTvRelayPort {
  createSession(request: { sessionId: string; expiresAtMs: number }): Promise<void>;
  poll(sessionId: string): Promise<
    | { status: 'pending' }
    | { status: 'ready'; ciphertext: string }
    | { status: 'expired' }
    | { status: 'consumed' }
  >;
}

export interface PairingTvOnboardingPort {
  connectXtream(input: { serverUrl: string; username: string; password: string }): Promise<{ providerId: ProviderId }>;
  connectM3u(input: { playlistUrl: string }): Promise<{ ok: true; providerId: ProviderId } | { ok: false }>;
}

export interface PairingTvBootstrapV1 {
  version: 1;
  sessionId: string;
  expiresAtMs: number;
  tvPublicKey: JsonWebKey;
  relayBaseUrl: string;
}

export type PairingTvPollResult =
  | { status: 'pending' }
  | { status: 'completed'; providerId: ProviderId }
  | { status: 'expired' }
  | { status: 'consumed' }
  | { status: 'error'; code: 'INVALID_PAYLOAD' | 'UNAVAILABLE' };
```

Session value is memory-only:

```ts
interface PairingTvSessionValue {
  privateKey: CryptoKey;
}
```

Controller constructor:

```ts
export class PairingTvController {
  constructor(deps: {
    crypto: PairingTvCryptoPort;
    sessions: PairingTvSessionPort<PairingTvSessionValue>;
    relay: PairingTvRelayPort;
    onboarding: PairingTvOnboardingPort;
    relayBaseUrl: string;
  });

  start(): Promise<PairingTvBootstrapV1>;
  poll(sessionId: string): Promise<PairingTvPollResult>;
}
```

- [ ] **Step 1: Write lifecycle RED tests**

Add tests proving:

```text
start -> generate key pair -> session.create(privateKey) -> relay.createSession -> exact public bootstrap
bootstrap exact keys = version/sessionId/expiresAtMs/tvPublicKey/relayBaseUrl
bootstrap never contains privateKey/provider credential fields
poll pending -> pending, no consume/decrypt/onboarding
poll relay expired -> expired, no decrypt/onboarding
poll relay consumed -> consumed, no decrypt/onboarding
ready -> session.consume exactly once before processing ciphertext
second ready for same session -> consumed and no second onboarding call
```

Use fake non-extractable `CryptoKey` objects only as opaque test values.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --import tsx --test player/test-ts/pairing-tv-controller.test.ts
```

Expected: FAIL because `tv-controller.ts` does not exist.

- [ ] **Step 3: Implement start/pending/terminal lifecycle only**

Start skeleton:

```ts
const keyPair = await deps.crypto.generateTvKeyPair();
const session = deps.sessions.create({ privateKey: keyPair.privateKey });
await deps.relay.createSession({
  sessionId: session.sessionId,
  expiresAtMs: session.expiresAtMs,
});
return {
  version: 1,
  sessionId: session.sessionId,
  expiresAtMs: session.expiresAtMs,
  tvPublicKey: keyPair.publicKey,
  relayBaseUrl: deps.relayBaseUrl,
};
```

Map unknown start failures to a fixed sanitized error class/message defined in this module; never append underlying exception text.

- [ ] **Step 4: Run lifecycle tests**

Expected: lifecycle cases pass; ready-processing tests may remain RED until Task 2.

- [ ] **Step 5: Commit**

```bash
git add player/src/pairing/tv-controller.ts player/test-ts/pairing-tv-controller.test.ts
git commit -m "feat(pairing): add TV pairing session orchestration"
```

---

### Task 2: Strictly decode the relay ciphertext envelope before decryption

**Files:**
- Modify: `player/src/pairing/tv-controller.ts`
- Modify: `player/test-ts/pairing-tv-controller.test.ts`

**Interfaces:**
- Consumes relay `ciphertext: string` containing JSON serialization of `PairingCiphertextV1`.
- Produces a private exact-envelope decoder inside `tv-controller.ts`; do not weaken PAIR-C validation.

- [ ] **Step 1: Add RED malformed-envelope tests**

Require `INVALID_PAYLOAD` and zero onboarding for:

```text
non-JSON ciphertext
JSON null/array/string
missing version/algorithm/senderPublicKey/iv/ciphertext
unknown top-level extra key
wrong version
wrong algorithm
non-object senderPublicKey
non-string iv/ciphertext
```

Also assert the surfaced error/state contains none of:

```text
relay ciphertext
sessionId
serverUrl
playlistUrl
username
password
raw thrown exception text
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
node --import tsx --test player/test-ts/pairing-tv-controller.test.ts
```

Expected: new malformed cases fail before strict decoding exists.

- [ ] **Step 3: Implement exact top-level envelope parsing**

Use an exact allowlist:

```ts
const ENVELOPE_KEYS = ['version', 'algorithm', 'senderPublicKey', 'iv', 'ciphertext'] as const;
```

Only after exact shape checks construct a `PairingCiphertextV1` value and call:

```ts
await deps.crypto.decrypt(session.value.privateKey, envelope);
```

PAIR-C remains final authority for JWK/base64/authentication validity.

- [ ] **Step 4: Run focused tests GREEN for envelope cases**

```bash
node --import tsx --test player/test-ts/pairing-tv-controller.test.ts
```

Expected: malformed cases PASS.

- [ ] **Step 5: Commit**

```bash
git add player/src/pairing/tv-controller.ts player/test-ts/pairing-tv-controller.test.ts
git commit -m "feat(pairing): strictly decode TV relay envelope"
```

---

### Task 3: Decode plaintext provider payload and delegate to existing onboarding ports

**Files:**
- Modify: `player/src/pairing/tv-controller.ts`
- Modify: `player/test-ts/pairing-tv-controller.test.ts`

**Interfaces:**
- Consumes `decodePairingProviderPayload(bytes)` from `phone-payload.ts`.
- Produces provider-kind dispatch only; no direct credential-store/repository writes.

- [ ] **Step 1: Write RED dispatch tests**

For decrypted Xtream bytes:

```ts
{
  version: 1,
  credential: {
    kind: 'xtream',
    serverUrl: 'https://example.invalid',
    username: 'synthetic-user',
    password: 'synthetic-pass',
  },
}
```

assert exactly one:

```ts
connectXtream({ serverUrl, username, password })
```

and result:

```ts
{ status: 'completed', providerId: 'xtream-created' }
```

For M3U assert exactly one:

```ts
connectM3u({ playlistUrl })
```

and `ok:true` maps to completed.

Add invalid plaintext cases proving the existing strict decoder rejects unknown/extra fields before onboarding.

- [ ] **Step 2: Add RED failure-sanitization tests**

Require:

```text
crypto throws -> {status:'error', code:'INVALID_PAYLOAD'} or sanitized UNAVAILABLE according to crypto code; never raw text
payload decode throws -> INVALID_PAYLOAD
Xtream onboarding throws -> UNAVAILABLE
M3U onboarding returns ok:false -> UNAVAILABLE
M3U onboarding throws -> UNAVAILABLE
```

No retry/onboarding occurs after the session has already been consumed.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --import tsx --test player/test-ts/pairing-tv-controller.test.ts
```

- [ ] **Step 4: Implement strict plaintext dispatch**

Dispatch shape:

```ts
const payload = decodePairingProviderPayload(plaintext);
if (payload.credential.kind === 'xtream') {
  const result = await deps.onboarding.connectXtream(payload.credential);
  return { status: 'completed', providerId: result.providerId };
}
const result = await deps.onboarding.connectM3u(payload.credential);
if (!result.ok) return { status: 'error', code: 'UNAVAILABLE' };
return { status: 'completed', providerId: result.providerId };
```

Catch at the orchestrator boundary and return fixed codes only. Never log payloads/errors.

- [ ] **Step 5: Run focused test GREEN**

```bash
node --import tsx --test player/test-ts/pairing-tv-controller.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add player/src/pairing/tv-controller.ts player/test-ts/pairing-tv-controller.test.ts
git commit -m "feat(pairing): hand TV pairing payload to onboarding"
```

---

### Task 4: Add production adapters for existing PAIR-C/S/R without app wiring

**Files:**
- Create: `player/src/pairing/create-tv-pairing-core.ts`
- Create: `player/test-ts/pairing-tv-core.test.ts`

**Interfaces:**
- Consumes:

```ts
generatePairingTvKeyPair()
decryptPairingOnTv()
new PairingSessionManager<PairingTvSessionValue>()
PairingRelayClient
```

- Produces:

```ts
export function createTvPairingCore(input: {
  relay: PairingRelayClient;
  relayBaseUrl: string;
  onboarding: PairingTvOnboardingPort;
  sessions?: PairingSessionManager<PairingTvSessionValue>;
}): PairingTvController;
```

This factory is intentionally app-agnostic. It must not import AppComposition, DOM views, ProviderCoreService, CredentialStore, or Live TV code.

- [ ] **Step 1: Write RED factory-boundary tests**

Use injected/fake relay and onboarding to prove the factory delegates crypto/session behavior through existing PAIR modules and does not require browser app composition.

Add a source-boundary assertion that `create-tv-pairing-core.ts` does not import:

```text
../app/
../credentials/
../repository/
../live-tv/
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --import tsx --test player/test-ts/pairing-tv-core.test.ts
```

Expected: FAIL because factory does not exist.

- [ ] **Step 3: Implement the thin factory**

Wire ports:

```ts
crypto: {
  generateTvKeyPair: generatePairingTvKeyPair,
  decrypt: decryptPairingOnTv,
}
```

Use supplied session manager for deterministic tests or a new default `PairingSessionManager` for production.

- [ ] **Step 4: Run Pairing core suites GREEN**

```bash
node --import tsx --test \
  player/test-ts/pairing-crypto.test.ts \
  player/test-ts/pairing-session.test.ts \
  player/test-ts/pairing-relay-client.test.ts \
  player/test-ts/pairing-phone-payload.test.ts \
  player/test-ts/pairing-phone-ui.test.ts \
  player/test-ts/pairing-tv-controller.test.ts \
  player/test-ts/pairing-tv-core.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add player/src/pairing/create-tv-pairing-core.ts player/test-ts/pairing-tv-core.test.ts
git commit -m "feat(pairing): compose TV pairing core"
```

---

### Task 5: Canonical verification and Draft PR evidence

**Files:**
- No app hot-zone expansion.

- [ ] **Step 1: Run full gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 92af4f5b9d445ced236a63f581716a55bf87ebeb...HEAD
```

All must exit 0.

- [ ] **Step 2: Assert exact scope**

Expected production ownership:

```text
player/src/pairing/tv-controller.ts
player/src/pairing/create-tv-pairing-core.ts
```

plus focused pairing tests. Existing PAIR-C/S/R/WEB production files should remain unchanged unless a compile defect required an explicitly controller-approved scope amendment.

- [ ] **Step 3: Capture exact-head canonical evidence**

Verification-only workflow checks out/asserts immutable production head, runs canonical gates and exact scope assertion, then is removed/reset from production branch.

- [ ] **Step 4: Open Draft PR**

PR title:

```text
PAIR-I-CORE: compose TV pairing onboarding core
```

Record exact base/head, strict envelope/payload behavior, session single-use behavior, ciphertext-only relay boundary, onboarding delegation, forbidden app hot-zone audit, and physical pairing/runtime `NOT VERIFIED`.

- [ ] **Step 5: Stop for controller audit/freeze**

PAIR-I-CORE is frozen input to PAIR-I-WIRE. Do not merge or widen into app wiring from this worker lane unless controller explicitly chooses that integration path after checking current main.
