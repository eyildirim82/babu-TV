# BabuşTV V1 Wave 3C PAIR-WEB Phone UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a browser-mountable phone-side pairing UI that validates provider input locally, serializes one frozen provider payload, encrypts it through PAIR-C, and writes only serialized ciphertext through PAIR-R.

**Architecture:** Keep payload serialization, flow/state, and DOM presentation in separate modules. The controller depends on narrow injected crypto/relay/time ports and reuses PAIR-R bootstrap URL normalization plus existing M3U validation. No hosting, relay deployment, TV QR/session creation, TV decryption, Provider Core, or CredentialStore behavior is added in this lane.

**Tech Stack:** TypeScript 5.9, browser DOM/Web Crypto contracts, Node `node:test` via `tsx`, existing PAIR-C/PAIR-R types/errors, existing M3U entry validation.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-pair-web-phone-ui-design.md`

## Global Constraints

- ROLE: `PAIR-WEB`.
- Production branch: `feature/pairing-phone-ui`.
- Frozen exact implementation base: `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- The worker reads this plan/spec from `docs/wave3c-m5-pair-web-design` read-only; do not cherry-pick documentation commits into the production branch.
- PAIR-C/S/R are frozen dependencies. Do not modify `pairing/crypto.ts`, `pairing/session.ts`, `pairing/relay-contracts.ts`, or `pairing/relay-client.ts` in this lane.
- Provider plaintext must never be sent to relay, written to browser persistence, included in URL/query/hash, logged, or placed in public sanitized errors.
- Provider plaintext may exist only in active DOM input values and controller memory until success/cancel/navigation discards it.
- Relay receives only opaque `sessionId` plus a string containing `JSON.stringify(PairingCiphertextV1)`.
- Phone never calls relay `createSession()` or `poll()`.
- Phone never decrypts.
- Reuse existing `validateM3uEntry()` and `normalizePairingRelayBaseUrl()`; do not fork their protocol rules.
- Xtream phone validation matches existing onboarding semantics: trim server URL/username/password and require all three, but do not add a stricter URL/network-auth rule.
- No real provider endpoints/credentials or real relay endpoints/credentials in tests or source. Use `.invalid` origins.
- No hosted phone-site or relay availability claim in this lane.
- Physical/browser-deployment + Samsung/Tizen end-to-end pairing remains `NOT VERIFIED` until separately executed.

### Exact production file scope

```text
player/src/pairing/phone-payload.ts
player/src/pairing/phone-controller.ts
player/src/pairing/phone-view.ts
player/src/ui/pairing-phone.css
player/test-ts/pairing-phone-payload.test.ts
player/test-ts/pairing-phone-ui.test.ts
```

Do not add a production fetch transport or public host entry point here. PAIR-I/deployment composition owns the actual host/transport binding after this contract is merged/frozen.

---

### Task 1: Freeze strict provider payload encoding/decoding

**Files:**
- Create: `player/src/pairing/phone-payload.ts`
- Create: `player/test-ts/pairing-phone-payload.test.ts`

**Interfaces:**
- Produces: `PairingProviderPayloadV1`, `encodePairingProviderPayload`, `decodePairingProviderPayload`.
- Consumes no storage/network/UI dependencies.

- [ ] **Step 1: Write RED exact-key and UTF-8 tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePairingProviderPayload,
  encodePairingProviderPayload,
  type PairingProviderPayloadV1,
} from '../src/pairing/phone-payload.js';

test('PAIR-WEB encodes exact versioned Xtream payload as UTF-8 JSON', () => {
  const payload: PairingProviderPayloadV1 = {
    version: 1,
    credential: {
      kind: 'xtream',
      serverUrl: 'https://iptv.example.invalid',
      username: 'kullanıcı',
      password: 'şifre',
    },
  };

  const bytes = encodePairingProviderPayload(payload);
  const json = new TextDecoder().decode(bytes);
  assert.deepEqual(Object.keys(JSON.parse(json)), ['version', 'credential']);
  assert.deepEqual(decodePairingProviderPayload(bytes), payload);
});
```

Add the equivalent M3U test with `playlistUrl: 'https://playlist.example.invalid/list.m3u8'`.

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB encodes exact"
npm run typecheck
```

Expected: FAIL because `phone-payload.ts` does not exist.

- [ ] **Step 3: Implement the exact DTO and encoder**

```ts
export type PairingProviderPayloadV1 =
  | {
      version: 1;
      credential: {
        kind: 'xtream';
        serverUrl: string;
        username: string;
        password: string;
      };
    }
  | {
      version: 1;
      credential: {
        kind: 'm3u';
        playlistUrl: string;
      };
    };

export function encodePairingProviderPayload(payload: PairingProviderPayloadV1): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}
```

Do not add session ID, relay URL, provider ID, provider name, active-provider state, or app settings.

- [ ] **Step 4: Implement a strict decoder with exact key sets**

Use private helpers `isRecord` and `hasExactKeys`. Decode with UTF-8 and JSON parse inside a single sanitized boundary.

```ts
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function decodePairingProviderPayload(bytes: Uint8Array): PairingProviderPayloadV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('Pairing provider payload is invalid.');
  }
  // validate exact top-level keys, version===1, exact credential keys/kind,
  // and string field types; otherwise throw the same fixed error.
  return validated;
}
```

The final implementation must not use a variable named `validated` before assigning it; construct and return the exact union object after validation. Every invalid form throws exactly `new Error('Pairing provider payload is invalid.')` with no input echo.

- [ ] **Step 5: Add rejection matrix**

Tests must reject:

```text
malformed JSON
invalid UTF-8
version != 1
missing credential
unknown top-level key
unknown credential key
unknown provider kind
missing Xtream field
non-string Xtream/M3U field
M3U credential containing Xtream fields
Xtream credential containing playlistUrl
```

The decoder validates shape only; it does not perform phone form validation or Provider Core validation.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
git add player/src/pairing/phone-payload.ts player/test-ts/pairing-phone-payload.test.ts
git commit -m "feat(pairing): define strict phone payload contract"
```

---

### Task 2: Implement fail-closed bootstrap and controller state/validation

**Files:**
- Create: `player/src/pairing/phone-controller.ts`
- Create: `player/test-ts/pairing-phone-ui.test.ts`

**Interfaces:**
- Consumes: `validateM3uEntry`, `normalizePairingRelayBaseUrl`, PAIR-C `PairingCiphertextV1` type.
- Produces: `PairingPhoneBootstrapV1`, `PairingPhoneErrorCode`, `PairingPhoneState`, `PairingPhoneCryptoPort`, `PairingPhoneRelayPort`, `PairingPhoneController`.

- [ ] **Step 1: Write RED bootstrap failure tests**

```ts
test('PAIR-WEB rejects malformed bootstrap before crypto or relay', async () => {
  let cryptoCalls = 0;
  let relayCalls = 0;
  const controller = new PairingPhoneController(
    {
      version: 2 as 1,
      sessionId: '',
      expiresAtMs: Number.NaN,
      tvPublicKey: {},
      relayBaseUrl: 'http://relay.example.invalid?secret=nope',
    },
    {
      crypto: { async encryptForTv() { cryptoCalls += 1; throw new Error('unexpected'); } },
      relay: { async putCiphertext() { relayCalls += 1; } },
      nowMs: () => 100,
    },
  );

  controller.chooseProvider('m3u');
  controller.updateM3u({ playlistUrl: 'https://playlist.example.invalid/a.m3u8' });
  await controller.submit();

  assert.deepEqual(controller.state(), {
    kind: 'error',
    providerKind: 'm3u',
    code: 'INVALID_BOOTSTRAP',
  });
  assert.equal(cryptoCalls, 0);
  assert.equal(relayCalls, 0);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB rejects malformed bootstrap"
npm run typecheck
```

Expected: FAIL because controller module does not exist.

- [ ] **Step 3: Define the fixed public contracts**

```ts
export interface PairingPhoneBootstrapV1 {
  version: 1;
  sessionId: string;
  expiresAtMs: number;
  tvPublicKey: JsonWebKey;
  relayBaseUrl: string;
}

export type PairingPhoneErrorCode =
  | 'INVALID_BOOTSTRAP'
  | 'REQUIRED'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'CRYPTO_UNAVAILABLE'
  | 'INVALID_TV_KEY'
  | 'RELAY_UNAVAILABLE'
  | 'NETWORK';

export interface PairingPhoneCryptoPort {
  encryptForTv(tvPublicKey: JsonWebKey, plaintext: Uint8Array): Promise<PairingCiphertextV1>;
}

export interface PairingPhoneRelayPort {
  putCiphertext(request: { sessionId: string; ciphertext: string }): Promise<void>;
}
```

Use the approved state union exactly, including `providerKind: null` for pre-selection bootstrap errors.

- [ ] **Step 4: Implement fail-closed bootstrap validation**

A private validator must require:

```text
bootstrap is object supplied through constructor type boundary
version === 1
sessionId.trim().length > 0
Number.isFinite(expiresAtMs)
normalizePairingRelayBaseUrl(relayBaseUrl) succeeds
```

Do not duplicate HTTPS/user-info parsing. Call existing `normalizePairingRelayBaseUrl()` and ignore the normalized value after validation because the injected relay port owns actual transport.

Do not attempt to fully validate JWK shape here; PAIR-C is the canonical key validator and maps it through the crypto error path.

- [ ] **Step 5: Implement provider choice/draft/local validation**

The controller holds private drafts:

```ts
private xtreamDraft = { serverUrl: '', username: '', password: '' };
private m3uDraft = { playlistUrl: '' };
```

Public methods:

```ts
chooseProvider(kind: 'xtream' | 'm3u'): void;
updateXtream(input: XtreamPhoneInput): void;
updateM3u(input: M3uPhoneInput): void;
back(): void;
state(): PairingPhoneState;
submit(): Promise<void>;
```

Xtream submit validation:

```ts
const serverUrl = draft.serverUrl.trim();
const username = draft.username.trim();
const password = draft.password.trim();
if (!serverUrl || !username || !password) {
  state = { kind: 'xtream', input: draft, error: 'REQUIRED' };
  return;
}
```

M3U submit validation must call `validateM3uEntry({ playlistUrl: draft.playlistUrl })` and map its exact codes `REQUIRED | INVALID_URL | UNSUPPORTED_PROTOCOL` without changing the draft value.

- [ ] **Step 6: Add expiration/no-side-effect tests**

Require `nowMs() >= expiresAtMs` to produce `{ kind: 'expired' }` with zero crypto/relay calls. Expiration is checked on every submit, not only construction.

- [ ] **Step 7: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
git add player/src/pairing/phone-controller.ts player/test-ts/pairing-phone-ui.test.ts
git commit -m "feat(pairing): add phone pairing state and validation"
```

---

### Task 3: Encrypt locally and send ciphertext only with sanitized retries

**Files:**
- Modify: `player/src/pairing/phone-controller.ts`
- Modify: `player/test-ts/pairing-phone-ui.test.ts`

**Interfaces:**
- Consumes: `encodePairingProviderPayload`, `PairingCryptoError`, `PairingRelayError`.
- Produces the complete `submit()` encryption/relay path.

- [ ] **Step 1: Write RED ciphertext-only transport test**

```ts
test('PAIR-WEB sends only serialized PAIR-C ciphertext to relay', async () => {
  const relayRequests: Array<{ sessionId: string; ciphertext: string }> = [];
  let capturedPlaintext: Uint8Array | null = null;

  const envelope = {
    version: 1,
    algorithm: 'ECDH-P256+A256GCM',
    senderPublicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
    iv: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'BBBB',
  } as const;

  const controller = validXtreamController({
    crypto: {
      async encryptForTv(_key, plaintext) {
        capturedPlaintext = plaintext.slice();
        return envelope;
      },
    },
    relay: {
      async putCiphertext(request) { relayRequests.push(request); },
    },
  });

  await controller.submit();
  assert.equal(controller.state().kind, 'success');
  assert.deepEqual(relayRequests, [{
    sessionId: 'session-1',
    ciphertext: JSON.stringify(envelope),
  }]);
  assert.equal(relayRequests[0].ciphertext.includes('username'), false);
  assert.equal(relayRequests[0].ciphertext.includes('password'), false);
  assert.match(new TextDecoder().decode(capturedPlaintext!), /"kind":"xtream"/);
});
```

The fake envelope uses synthetic values only; it is not expected to pass PAIR-C decryption in this controller unit test.

- [ ] **Step 2: Implement exact payload construction and encryption**

For Xtream, construct:

```ts
const payload: PairingProviderPayloadV1 = {
  version: 1,
  credential: { kind: 'xtream', serverUrl, username, password },
};
```

For M3U use the `validation.credential.playlistUrl` returned by `validateM3uEntry()` so phone normalization exactly matches M3U-V.

Then:

```ts
this.view = { kind: 'sending', providerKind };
const envelope = await this.deps.crypto.encryptForTv(
  this.bootstrap.tvPublicKey,
  encodePairingProviderPayload(payload),
);
await this.deps.relay.putCiphertext({
  sessionId: this.bootstrap.sessionId,
  ciphertext: JSON.stringify(envelope),
});
this.clearSensitiveDrafts();
this.view = { kind: 'success' };
```

Never include the payload object in relay request data.

- [ ] **Step 3: Guard duplicate submit**

At the first line of `submit()`:

```ts
if (this.view.kind === 'sending' || this.view.kind === 'success') return;
```

Use a deferred fake crypto Promise in the test. Call `submit()` twice before resolving it and assert exactly one crypto call + one relay call.

- [ ] **Step 4: Map PAIR-C errors exactly**

```text
PairingCryptoError('INVALID_KEY')      -> INVALID_TV_KEY
PairingCryptoError('UNAVAILABLE')      -> CRYPTO_UNAVAILABLE
PairingCryptoError('INVALID_PAYLOAD')  -> CRYPTO_UNAVAILABLE
unknown crypto exception               -> CRYPTO_UNAVAILABLE
```

The phone is encrypt-only; an `INVALID_PAYLOAD` from that dependency is not displayed as native detail.

- [ ] **Step 5: Map PAIR-R errors exactly**

```text
PairingRelayError('NETWORK')     -> NETWORK
PairingRelayError('UNAVAILABLE') -> RELAY_UNAVAILABLE
PairingRelayError('MALFORMED')   -> RELAY_UNAVAILABLE
unknown relay exception          -> NETWORK
```

Do not include relay URL or native error message in public state.

- [ ] **Step 6: Prove retry preserves only in-memory drafts and success clears them**

Tests:

1. first relay attempt throws `PairingRelayError('NETWORK')`;
2. controller state becomes sanitized error;
3. choose/return to the same provider form and verify entered values are still available from the controller's form state, with no storage API used;
4. second submit succeeds;
5. state becomes `success`;
6. return/choose provider after success must not resurrect previous secrets.

Do not expose a debug getter that returns plaintext solely for testing; use the approved form state transitions.

- [ ] **Step 7: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
git add player/src/pairing/phone-controller.ts player/test-ts/pairing-phone-ui.test.ts
git commit -m "feat(pairing): encrypt and relay phone payload"
```

---

### Task 4: Build the accessible phone DOM surface and privacy regression matrix

**Files:**
- Create: `player/src/pairing/phone-view.ts`
- Create: `player/src/ui/pairing-phone.css`
- Modify: `player/test-ts/pairing-phone-ui.test.ts`

**Interfaces:**
- Consumes: one `PairingPhoneController` instance.
- Produces: `PairingPhoneView` with `mount`, `render`, and `destroy` behavior.

- [ ] **Step 1: Write RED DOM-flow tests**

Use the existing fake-DOM style from other presentation tests. Require:

```text
choose-provider -> two buttons (Xtream/M3U)
Xtream form -> URL/text/password inputs with explicit labels
M3U form -> URL input with explicit label
validation failure -> aria-live status + first invalid field focus
sending -> submit disabled and provider switch unavailable
success -> credential inputs removed from DOM
expired -> no credential values echoed
INVALID_BOOTSTRAP -> no raw bootstrap/session/relay/key values rendered
Back from form -> choose-provider
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB phone view"
npm run typecheck
```

Expected: FAIL because `phone-view.ts` does not exist.

- [ ] **Step 3: Implement safe DOM creation**

Create all nodes with `document.createElement`, assign labels/error copy with `textContent`, and assign user input only to `<input>.value`. Never use `innerHTML` for user/bootstrap/provider data.

Use fixed root ID:

```text
pairing-phone-page
```

Use fixed status ID with `aria-live="polite"`:

```text
pairing-phone-status
```

Provider forms must use `autocomplete="off"`; password uses `type="password"`.

- [ ] **Step 4: Implement controller-driven events**

View event handlers call only controller public methods. After every sync action and awaited submit, call `render()`.

On input events, update the complete corresponding draft shape, preserving sibling field values already visible in the form.

On validation errors, focus:

```text
Xtream REQUIRED -> first empty field in serverUrl, username, password order
M3U REQUIRED/INVALID_URL/UNSUPPORTED_PROTOCOL -> playlist URL input
```

- [ ] **Step 5: Freeze sanitized Turkish UI messages**

Map only error codes to fixed copy. Do not render native errors.

Use concise fixed strings such as:

```text
INVALID_BOOTSTRAP  -> "Eşleştirme bağlantısı geçersiz. TV'den yeniden başlatın."
REQUIRED           -> "Gerekli alanları doldurun."
INVALID_URL        -> "Geçerli bir bağlantı adresi girin."
UNSUPPORTED_PROTOCOL -> "Yalnızca HTTP veya HTTPS adresleri desteklenir."
CRYPTO_UNAVAILABLE -> "Bu tarayıcıda güvenli eşleştirme kullanılamıyor."
INVALID_TV_KEY     -> "TV eşleştirme anahtarı geçersiz. TV'den yeniden başlatın."
RELAY_UNAVAILABLE  -> "Eşleştirme servisine ulaşılamıyor."
NETWORK            -> "Ağ bağlantısı kurulamadı. Yeniden deneyin."
```

Success copy must confirm send only, for example `"Bilgiler TV'ye güvenli şekilde gönderildi."`; do not claim provider registration succeeded because TV-side PAIR-I has not run yet.

- [ ] **Step 6: Add scoped mobile/reduced-motion CSS**

CSS must:

- scope selectors under `.pairing-phone-page`;
- provide visible `:focus-visible` treatment;
- use responsive width without TV-specific fixed 1920x1080 layout assumptions;
- include `@media (prefers-reduced-motion: reduce)` to disable non-essential transitions/animations;
- avoid loading external fonts/assets or analytics.

- [ ] **Step 7: Add privacy source/regression tests**

Read the three PAIR-WEB source files and assert absence of forbidden persistent/logging APIs:

```ts
for (const source of sources) {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(source, /location\.(search|hash)|URLSearchParams/);
}
```

This is defense-in-depth; also keep behavioral assertions that relay request ciphertext does not contain the synthetic plaintext server URL, username, password, or playlist URL.

- [ ] **Step 8: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
npm run build
git add player/src/pairing/phone-view.ts player/src/ui/pairing-phone.css player/test-ts/pairing-phone-ui.test.ts
git commit -m "feat(pairing): add secure phone pairing UI"
```

---

### Task 5: Exact-head verification and Draft PR evidence

**Files:**
- No production changes expected after gate fixes unless a reproduced bug is inside the six-file PAIR-WEB scope.

- [ ] **Step 1: Run focused pairing regression first**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run test:ts -w player -- --test-name-pattern="PAIR-C|PAIR-S|PAIR-R"
npm run typecheck
```

Do not modify frozen core implementation merely to make a PAIR-WEB test easier; fix the injected boundary/test instead unless a real frozen-core defect is reproduced and escalated.

- [ ] **Step 2: Run complete canonical exact-head gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

All must exit 0. `tizen:build` is packaging/staging compatibility evidence, not phone-host or physical-TV acceptance.

- [ ] **Step 3: Audit exact changed-file scope**

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Expected exactly:

```text
player/src/pairing/phone-payload.ts
player/src/pairing/phone-controller.ts
player/src/pairing/phone-view.ts
player/src/ui/pairing-phone.css
player/test-ts/pairing-phone-payload.test.ts
player/test-ts/pairing-phone-ui.test.ts
```

If PAIR-C/S/R, Provider Core, CredentialStore, `main.js`, Home, Live TV, storage, relay hosting, or deployment files appear, stop and report scope expansion.

- [ ] **Step 4: Audit security invariants manually**

Confirm final diff/tests prove:

```text
QR/bootstrap contract has no provider plaintext/private TV key
plaintext payload exact version/key sets
phone encrypts before relay
relay request contains only sessionId + serialized PairingCiphertextV1
no local/session/IndexedDB/cookie persistence
no console logging of provider/bootstrap/ciphertext data
no provider data in query/hash parsing
expired/invalid bootstrap -> zero crypto/relay calls
duplicate submit -> one crypto + one relay call
success clears plaintext controller/view state
PAIR-C/S/R files unchanged
```

- [ ] **Step 5: Open a Draft PR only**

PR body must include:

- `ROLE=PAIR-WEB`;
- branch `feature/pairing-phone-ui`;
- frozen base `860d9efa8efac7c9872bf31f7f592ae12a414889`;
- final production head SHA;
- exact six-file changed set;
- RED evidence per task;
- focused GREEN evidence;
- canonical exact-head gate evidence;
- explicit statement: no relay/public phone host deployed; no TV QR/decrypt/onboarding integration in this PR;
- browser deployment + physical Samsung/Tizen end-to-end pairing: `NOT VERIFIED`.

Do not mark Ready and do not merge. Controller owns those transitions.
