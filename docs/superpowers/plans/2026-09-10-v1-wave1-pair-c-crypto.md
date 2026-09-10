# BabuşTV V1 Wave 1 PAIR-C Pairing Crypto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned ephemeral pairing cryptography primitives that let a phone encrypt opaque bytes for a TV and let the TV authenticate/decrypt them locally, without relay, session, provider-registration, or UI behavior.

**Architecture:** `PAIR-C` uses Web Crypto with ephemeral P-256 ECDH and AES-256-GCM. The TV creates an ephemeral key pair and exposes only the public JWK; the phone creates its own ephemeral sender key, derives an AES key, and returns a versioned authenticated ciphertext envelope. The module encrypts bytes only and knows nothing about Xtream/M3U payload schemas.

**Tech Stack:** TypeScript 5.9, Web Crypto API, Node 22 `node:test`/`tsx`; no crypto npm dependency.

**Spec:** `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`

## Global Constraints

- ROLE: `PAIR-C`.
- Branch: `feature/pairing-crypto`.
- Exact implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- Owns only `player/src/pairing/crypto.ts` and `player/test-ts/pairing-crypto.test.ts`.
- Read-only dependencies: platform capability patterns and credential contracts for security context only; do not import provider credential types into this crypto module.
- Forbidden hot zones: relay/network code, pairing session state, provider registration/CredentialStore implementation, UI/QR, `main.js`, storage, playback, package/Tizen identity.
- No logging of plaintext, ciphertext contents, private keys, derived keys, or decrypted payloads.
- No persistent private key storage in this lane; key material is ephemeral and in-memory.
- No new crypto dependency. If required Web Crypto primitives are unavailable, throw a sanitized capability error; physical Tizen compatibility remains a later platform/release gate.
- Public tests use opaque synthetic bytes only, never provider credentials.

---

### Task 1: Freeze the versioned ciphertext/key API

**Files:**
- Create: `player/src/pairing/crypto.ts`
- Create: `player/test-ts/pairing-crypto.test.ts`

**Interfaces:**
- Produces: `PairingCryptoError`, `PairingTvKeyPair`, `PairingCiphertextV1`, `generatePairingTvKeyPair`, `encryptForPairingTv`, `decryptPairingOnTv`.

- [ ] **Step 1: Write RED round-trip acceptance**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptPairingOnTv,
  encryptForPairingTv,
  generatePairingTvKeyPair,
} from '../src/pairing/crypto.js';

test('PAIR-C round trips opaque bytes with ephemeral authenticated encryption', async () => {
  const tv = await generatePairingTvKeyPair();
  const plaintext = new TextEncoder().encode('synthetic pairing payload');
  const envelope = await encryptForPairingTv(tv.publicKey, plaintext);
  const decrypted = await decryptPairingOnTv(tv.privateKey, envelope);
  assert.equal(new TextDecoder().decode(decrypted), 'synthetic pairing payload');
  assert.equal(envelope.version, 1);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-C round trips"
npm run typecheck -w player
```

Expected: FAIL because `pairing/crypto.ts` does not exist.

- [ ] **Step 3: Add exact public types and safe helpers**

Use:

```ts
export type PairingCryptoErrorCode = 'UNAVAILABLE' | 'INVALID_KEY' | 'INVALID_PAYLOAD';

export class PairingCryptoError extends Error {
  constructor(public readonly code: PairingCryptoErrorCode) {
    super(code === 'UNAVAILABLE' ? 'Pairing cryptography is unavailable.' : 'Pairing payload is invalid.');
    this.name = 'PairingCryptoError';
  }
}

export interface PairingTvKeyPair {
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
}

export interface PairingCiphertextV1 {
  version: 1;
  algorithm: 'ECDH-P256+A256GCM';
  senderPublicKey: JsonWebKey;
  iv: string;
  ciphertext: string;
}
```

Implement URL-safe Base64 encode/decode helpers for `Uint8Array` without Node-only `Buffer`, so the generated browser/Tizen bundle remains portable. Reject invalid Base64URL input with `PairingCryptoError('INVALID_PAYLOAD')`.

- [ ] **Step 4: Implement TV key generation**

Use `globalThis.crypto?.subtle`; if absent, throw `UNAVAILABLE`. Generate ECDH P-256 with `extractable: false`, export only `keyPair.publicKey` as JWK, assert `keyPair.privateKey.extractable === false`, and return the non-extractable private `CryptoKey` object without exporting/serializing it. Web Crypto keeps the generated public ECDH key exportable even when the private key is created non-extractable.

- [ ] **Step 5: Commit API/key generation**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-C"
npm run typecheck -w player
git add player/src/pairing/crypto.ts player/test-ts/pairing-crypto.test.ts
git commit -m "feat(pairing): add ephemeral crypto contract"
```

---

### Task 2: Implement authenticated ECDH/AES-GCM round trip

**Files:**
- Modify: `player/src/pairing/crypto.ts`
- Modify: `player/test-ts/pairing-crypto.test.ts`

- [ ] **Step 1: Implement sender encryption**

`encryptForPairingTv` must:

1. import the TV public JWK as ECDH P-256 public key;
2. generate a fresh ephemeral sender P-256 ECDH key pair with a non-extractable private key while keeping the public key exportable;
3. derive a non-extractable AES-GCM 256-bit key from sender private + TV public;
4. generate exactly 12 random IV bytes with `crypto.getRandomValues`;
5. encrypt with AES-GCM using `new TextEncoder().encode('babustv-pairing-v1')` as `additionalData`;
6. export only the sender public key;
7. return `PairingCiphertextV1` with Base64URL IV/ciphertext.

Do not return or expose the sender private key or derived AES key.

- [ ] **Step 2: Implement TV decryption**

`decryptPairingOnTv` must validate `version === 1`, the exact algorithm string, 12-byte IV, and a public-only sender JWK. Import sender public P-256 key, derive AES-GCM with the TV private key, and decrypt with the same fixed additional-data context. Map import/derive/decrypt failures to `PairingCryptoError('INVALID_PAYLOAD')` without embedding underlying exception text.

- [ ] **Step 3: Add tamper/wrong-key tests**

Prove one flipped ciphertext byte is rejected, a different TV key cannot decrypt, a modified IV is rejected/authentication-fails, and malformed version/algorithm/JWK are rejected with sanitized `INVALID_PAYLOAD`.

- [ ] **Step 4: Add no-secret-surface assertions**

Assert the JSON-serializable envelope has exactly `version`, `algorithm`, `senderPublicKey`, `iv`, and `ciphertext`; it must not contain a TV private key, sender private key, plaintext property, URL, provider type, username, password, or token field. Assert both generated private ECDH keys are non-extractable.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-C"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/pairing/crypto.ts player/test-ts/pairing-crypto.test.ts
git commit -m "feat(pairing): add authenticated pairing encryption"
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
git diff aac531b15bad85f6e7ae42c6ff1a6b71eed289d1...HEAD
```

Expected: only the two owned files. Confirm no provider credential schema/data, console logging, private-key export, relay URL, storage, UI, or provider integration appears.

- [ ] **Step 3: Open Draft PR**

Record exact base/head, round-trip RED/GREEN, tamper/wrong-key rejection, non-extractable private-key assertions, envelope surface audit, Web Crypto availability classification, full gates, and scope audit. Do not claim physical-Tizen crypto support from Node/browser tests; that remains later evidence. Do not Ready/merge.
