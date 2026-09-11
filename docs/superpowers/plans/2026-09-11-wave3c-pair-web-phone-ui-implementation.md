# BabuşTV V1 Wave 3C PAIR-WEB Phone UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a browser-mountable phone-side pairing UI that validates provider input locally, serializes the frozen provider payload, encrypts it through PAIR-C, and sends only serialized ciphertext through PAIR-R.

**Architecture:** Separate strict payload serialization, controller/state, and DOM presentation. The controller depends on narrow crypto/relay/time ports and reuses existing M3U validation plus PAIR-R relay-base validation. No phone hosting, relay deployment, TV QR/session/decrypt logic, Provider Core, or CredentialStore behavior is added.

**Tech Stack:** TypeScript 5.9, browser DOM/Web Crypto contracts, Node `node:test` via `tsx`, existing PAIR-C/PAIR-R contracts and errors.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-pair-web-phone-ui-design.md`

## Global Constraints

- ROLE: `PAIR-WEB`.
- Production branch: `feature/pairing-phone-ui`.
- Frozen exact base: `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- Read the spec/plan from `docs/wave3c-m5-pair-web-design`; do not cherry-pick docs commits into the production branch.
- PAIR-C/S/R are frozen dependencies. Do not modify `pairing/crypto.ts`, `pairing/session.ts`, `pairing/relay-contracts.ts`, or `pairing/relay-client.ts`.
- Provider plaintext never goes to relay, persistent browser storage, cookies, URL query/hash, analytics, logs, DOM dataset attributes, or public error text.
- Relay receives only opaque `sessionId` and `JSON.stringify(PairingCiphertextV1)`.
- Phone never calls relay `createSession()` or `poll()` and never decrypts.
- Reuse `validateM3uEntry()` and `normalizePairingRelayBaseUrl()` exactly.
- Xtream local validation trims server URL/username/password and requires all three; it adds no stricter network/protocol rule than existing Xtream onboarding.
- Tests use only synthetic `.invalid` origins and synthetic credentials.
- No fetch transport/public host is added in this lane.
- End-to-end phone deployment + physical Samsung/Tizen pairing remains `NOT VERIFIED` until separately executed.

### Exact production scope

```text
player/src/pairing/phone-payload.ts
player/src/pairing/phone-controller.ts
player/src/pairing/phone-view.ts
player/src/ui/pairing-phone.css
player/test-ts/pairing-phone-payload.test.ts
player/test-ts/pairing-phone-ui.test.ts
```

---

### Task 1: Freeze strict payload encoding/decoding

**Files:**
- Create: `player/src/pairing/phone-payload.ts`
- Create: `player/test-ts/pairing-phone-payload.test.ts`

**Interfaces:**
- Produces: `PairingProviderPayloadV1`, `encodePairingProviderPayload`, `decodePairingProviderPayload`.

- [ ] **Step 1: Write RED exact-key UTF-8 tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePairingProviderPayload,
  encodePairingProviderPayload,
  type PairingProviderPayloadV1,
} from '../src/pairing/phone-payload.js';

test('PAIR-WEB encodes exact Xtream payload as UTF-8 JSON', () => {
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

test('PAIR-WEB encodes exact M3U payload as UTF-8 JSON', () => {
  const payload: PairingProviderPayloadV1 = {
    version: 1,
    credential: { kind: 'm3u', playlistUrl: 'https://playlist.example.invalid/list.m3u8' },
  };
  assert.deepEqual(decodePairingProviderPayload(encodePairingProviderPayload(payload)), payload);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB encodes exact"
npm run typecheck
```

- [ ] **Step 3: Implement exact DTO/encoder/strict decoder**

```ts
export type PairingProviderPayloadV1 =
  | {
      version: 1;
      credential: { kind: 'xtream'; serverUrl: string; username: string; password: string };
    }
  | {
      version: 1;
      credential: { kind: 'm3u'; playlistUrl: string };
    };

const INVALID_PAYLOAD_MESSAGE = 'Pairing provider payload is invalid.';

function invalidPayload(): never {
  throw new Error(INVALID_PAYLOAD_MESSAGE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function encodePairingProviderPayload(payload: PairingProviderPayloadV1): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodePairingProviderPayload(bytes: Uint8Array): PairingProviderPayloadV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return invalidPayload();
  }
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['version', 'credential']) || parsed.version !== 1) {
    return invalidPayload();
  }
  const credential = parsed.credential;
  if (!isRecord(credential) || typeof credential.kind !== 'string') return invalidPayload();

  if (credential.kind === 'xtream') {
    if (
      !hasExactKeys(credential, ['kind', 'serverUrl', 'username', 'password'])
      || typeof credential.serverUrl !== 'string'
      || typeof credential.username !== 'string'
      || typeof credential.password !== 'string'
    ) return invalidPayload();
    return {
      version: 1,
      credential: {
        kind: 'xtream',
        serverUrl: credential.serverUrl,
        username: credential.username,
        password: credential.password,
      },
    };
  }

  if (credential.kind === 'm3u') {
    if (!hasExactKeys(credential, ['kind', 'playlistUrl']) || typeof credential.playlistUrl !== 'string') {
      return invalidPayload();
    }
    return { version: 1, credential: { kind: 'm3u', playlistUrl: credential.playlistUrl } };
  }

  return invalidPayload();
}
```

- [ ] **Step 4: Add strict rejection matrix**

```ts
const invalidJsonObjects = [
  { version: 2, credential: { kind: 'm3u', playlistUrl: 'https://x.invalid/a.m3u8' } },
  { version: 1, credential: { kind: 'unknown' } },
  { version: 1, credential: { kind: 'm3u', playlistUrl: 'x', extra: true } },
  { version: 1, credential: { kind: 'xtream', serverUrl: 'x', username: 'u' } },
  { version: 1, credential: { kind: 'xtream', serverUrl: 'x', username: 'u', password: 'p', playlistUrl: 'x' } },
  { version: 1, credential: { kind: 'm3u', playlistUrl: 7 } },
  { version: 1, credential: { kind: 'm3u', playlistUrl: 'x' }, extra: true },
];
for (const value of invalidJsonObjects) {
  assert.throws(
    () => decodePairingProviderPayload(new TextEncoder().encode(JSON.stringify(value))),
    /Pairing provider payload is invalid/,
  );
}
assert.throws(() => decodePairingProviderPayload(new TextEncoder().encode('{')), /invalid/);
assert.throws(() => decodePairingProviderPayload(new Uint8Array([0xff])), /invalid/);
```

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
git add player/src/pairing/phone-payload.ts player/test-ts/pairing-phone-payload.test.ts
git commit -m "feat(pairing): define strict phone payload contract"
```

---

### Task 2: Implement fail-closed bootstrap and local form state

**Files:**
- Create: `player/src/pairing/phone-controller.ts`
- Create: `player/test-ts/pairing-phone-ui.test.ts`

**Interfaces:**
- Consumes: `validateM3uEntry`, `normalizePairingRelayBaseUrl`, `PairingCiphertextV1` type.
- Produces: bootstrap/state/error/input types, crypto/relay ports, `PairingPhoneController`.

- [ ] **Step 1: Define public types and write RED invalid-bootstrap test**

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

export type XtreamPhoneInput = { serverUrl: string; username: string; password: string };
export type M3uPhoneInput = { playlistUrl: string };

export type PairingPhoneState =
  | { kind: 'choose-provider' }
  | { kind: 'xtream'; input: XtreamPhoneInput; error: PairingPhoneErrorCode | null }
  | { kind: 'm3u'; input: M3uPhoneInput; error: PairingPhoneErrorCode | null }
  | { kind: 'sending'; providerKind: 'xtream' | 'm3u' }
  | { kind: 'success' }
  | { kind: 'expired' }
  | { kind: 'error'; providerKind: 'xtream' | 'm3u' | null; code: PairingPhoneErrorCode };
```

Test:

```ts
test('PAIR-WEB rejects malformed bootstrap before crypto or relay', async () => {
  let cryptoCalls = 0;
  let relayCalls = 0;
  const bootstrap = {
    version: 2,
    sessionId: '',
    expiresAtMs: Number.NaN,
    tvPublicKey: {},
    relayBaseUrl: 'http://relay.example.invalid',
  } as unknown as PairingPhoneBootstrapV1;
  const controller = new PairingPhoneController(bootstrap, {
    crypto: { async encryptForTv() { cryptoCalls += 1; throw new Error('unexpected'); } },
    relay: { async putCiphertext() { relayCalls += 1; } },
    nowMs: () => 100,
  });
  controller.chooseProvider('m3u');
  controller.updateM3u({ playlistUrl: 'https://playlist.example.invalid/a.m3u8' });
  await controller.submit();
  assert.deepEqual(controller.state(), { kind: 'error', providerKind: 'm3u', code: 'INVALID_BOOTSTRAP' });
  assert.equal(cryptoCalls, 0);
  assert.equal(relayCalls, 0);
});
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB rejects malformed bootstrap"
npm run typecheck
```

- [ ] **Step 3: Implement bootstrap validation and form methods**

```ts
private validBootstrap(): boolean {
  if (
    this.bootstrap.version !== 1
    || typeof this.bootstrap.sessionId !== 'string'
    || this.bootstrap.sessionId.trim().length === 0
    || !Number.isFinite(this.bootstrap.expiresAtMs)
    || typeof this.bootstrap.relayBaseUrl !== 'string'
  ) return false;
  try {
    normalizePairingRelayBaseUrl(this.bootstrap.relayBaseUrl);
    return true;
  } catch {
    return false;
  }
}
```

Controller stores:

```ts
private xtreamDraft: XtreamPhoneInput = { serverUrl: '', username: '', password: '' };
private m3uDraft: M3uPhoneInput = { playlistUrl: '' };
private view: PairingPhoneState = { kind: 'choose-provider' };
```

Methods:

```ts
state(): PairingPhoneState { return this.view; }
chooseProvider(kind: 'xtream' | 'm3u'): void { /* project existing draft into form state */ }
updateXtream(input: XtreamPhoneInput): void { /* replace private draft + form state */ }
updateM3u(input: M3uPhoneInput): void { /* replace private draft + form state */ }
back(): void { /* form -> choose-provider; sending/success do not resurrect secrets */ }
```

- [ ] **Step 4: Implement exact local validation**

Xtream:

```ts
const normalized = {
  serverUrl: this.xtreamDraft.serverUrl.trim(),
  username: this.xtreamDraft.username.trim(),
  password: this.xtreamDraft.password.trim(),
};
if (!normalized.serverUrl || !normalized.username || !normalized.password) {
  this.view = { kind: 'xtream', input: { ...this.xtreamDraft }, error: 'REQUIRED' };
  return null;
}
```

M3U:

```ts
const validation = validateM3uEntry({ playlistUrl: this.m3uDraft.playlistUrl });
if (!validation.ok) {
  this.view = { kind: 'm3u', input: { ...this.m3uDraft }, error: validation.code };
  return null;
}
```

- [ ] **Step 5: Add expiration tests**

Set `expiresAtMs: 100` and `nowMs: () => 100`; assert `{ kind: 'expired' }` and zero crypto/relay calls. Repeat with a clock that advances from 99 at construction to 100 at submit; expiration must be rechecked at submit time.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
git add player/src/pairing/phone-controller.ts player/test-ts/pairing-phone-ui.test.ts
git commit -m "feat(pairing): add phone pairing state and validation"
```

---

### Task 3: Encrypt locally and relay ciphertext only

**Files:**
- Modify: `player/src/pairing/phone-controller.ts`
- Modify: `player/test-ts/pairing-phone-ui.test.ts`

**Interfaces:**
- Consumes: `encodePairingProviderPayload`, `PairingCryptoError`, `PairingRelayError`.
- Completes: `submit()`.

- [ ] **Step 1: Write RED ciphertext-only test without helper fixtures**

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
  const controller = new PairingPhoneController({
    version: 1,
    sessionId: 'session-1',
    expiresAtMs: 1_000,
    tvPublicKey: { kty: 'EC', crv: 'P-256', x: 'tvx', y: 'tvy' },
    relayBaseUrl: 'https://relay.example.invalid',
  }, {
    crypto: {
      async encryptForTv(_key, plaintext) {
        capturedPlaintext = plaintext.slice();
        return envelope;
      },
    },
    relay: { async putCiphertext(request) { relayRequests.push(request); } },
    nowMs: () => 100,
  });
  controller.chooseProvider('xtream');
  controller.updateXtream({
    serverUrl: 'https://iptv.example.invalid',
    username: 'alice',
    password: 'secret',
  });
  await controller.submit();
  assert.deepEqual(relayRequests, [{ sessionId: 'session-1', ciphertext: JSON.stringify(envelope) }]);
  assert.equal(relayRequests[0].ciphertext.includes('alice'), false);
  assert.equal(relayRequests[0].ciphertext.includes('secret'), false);
  assert.match(new TextDecoder().decode(capturedPlaintext!), /"kind":"xtream"/);
  assert.deepEqual(controller.state(), { kind: 'success' });
});
```

- [ ] **Step 2: Implement the submit path**

After bootstrap/expiry/local validation:

```ts
this.view = { kind: 'sending', providerKind };
try {
  const envelope = await this.deps.crypto.encryptForTv(
    this.bootstrap.tvPublicKey,
    encodePairingProviderPayload(payload),
  );
  await this.deps.relay.putCiphertext({
    sessionId: this.bootstrap.sessionId,
    ciphertext: JSON.stringify(envelope),
  });
  this.xtreamDraft = { serverUrl: '', username: '', password: '' };
  this.m3uDraft = { playlistUrl: '' };
  this.view = { kind: 'success' };
} catch (error) {
  this.view = { kind: 'error', providerKind, code: this.errorCode(error) };
}
```

For Xtream build exact normalized payload. For M3U use `validation.credential.playlistUrl` from `validateM3uEntry`.

- [ ] **Step 3: Guard duplicate submit synchronously**

```ts
if (this.view.kind === 'sending' || this.view.kind === 'success') return;
```

Use a deferred crypto Promise in the test, call `submit()` twice before resolving it, then assert one crypto invocation and one relay invocation.

- [ ] **Step 4: Implement fixed error mapping**

```ts
private errorCode(error: unknown): PairingPhoneErrorCode {
  if (error instanceof PairingCryptoError) {
    return error.code === 'INVALID_KEY' ? 'INVALID_TV_KEY' : 'CRYPTO_UNAVAILABLE';
  }
  if (error instanceof PairingRelayError) {
    return error.code === 'NETWORK' ? 'NETWORK' : 'RELAY_UNAVAILABLE';
  }
  return 'NETWORK';
}
```

Because crypto runs before relay, unknown exceptions thrown by the crypto test double must be tested separately and expected as `CRYPTO_UNAVAILABLE`. Implement two narrow catch boundaries instead of one combined catch so unknown crypto errors map to `CRYPTO_UNAVAILABLE` and unknown relay errors map to `NETWORK`:

```ts
let envelope: PairingCiphertextV1;
try { envelope = await this.deps.crypto.encryptForTv(...); }
catch (error) { this.view = { kind: 'error', providerKind, code: cryptoErrorCode(error) }; return; }
try { await this.deps.relay.putCiphertext(...); }
catch (error) { this.view = { kind: 'error', providerKind, code: relayErrorCode(error) }; return; }
```

- [ ] **Step 5: Prove retry-memory and success-clear behavior**

Test relay `NETWORK` failure, then call `controller.chooseProvider('xtream')` and assert the returned form state still contains the draft values. Submit again with a succeeding relay, assert success, then call `chooseProvider('xtream')` and assert all three fields are empty.

No storage API may be introduced to satisfy this test.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
git add player/src/pairing/phone-controller.ts player/test-ts/pairing-phone-ui.test.ts
git commit -m "feat(pairing): encrypt and relay phone payload"
```

---

### Task 4: Add the accessible phone DOM surface

**Files:**
- Create: `player/src/pairing/phone-view.ts`
- Create: `player/src/ui/pairing-phone.css`
- Modify: `player/test-ts/pairing-phone-ui.test.ts`

**Interfaces:**
- Consumes one `PairingPhoneController`.
- Produces `PairingPhoneView` with `mount()`, `render()`, `destroy()`.

- [ ] **Step 1: Write RED DOM-flow tests**

Copy the minimal fake DOM classes used by `player/test-ts/first-run-view.test.ts` into this test file so no new dependency is added. Test these exact states:

```text
choose-provider -> Xtream + M3U buttons
xtream -> URL/text/password inputs with labels
m3u -> URL input with label
validation -> aria-live fixed message + invalid field focus
sending -> submit disabled
success -> credential inputs absent
expired -> restart-on-TV message; no credential echo
INVALID_BOOTSTRAP -> sanitized message; no raw session/relay/key values
Back from a provider form -> choose-provider
```

- [ ] **Step 2: Prove RED**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB phone view"
npm run typecheck
```

- [ ] **Step 3: Implement safe DOM rendering**

Use only `document.createElement`, `textContent`, attributes, and input `.value`. Never place user/bootstrap/provider data into `innerHTML` or `dataset`.

Fixed IDs:

```text
pairing-phone-page
pairing-phone-status
pairing-phone-xtream
pairing-phone-m3u
pairing-phone-submit
pairing-phone-back
```

`pairing-phone-status` has `aria-live="polite"`; inputs have explicit `<label for>`, `autocomplete="off"`; password uses `type="password"`.

- [ ] **Step 4: Implement view/controller interaction**

Input listeners update complete controller drafts. Submit awaits `controller.submit()`.

When submit ends in `{ kind: 'error', providerKind, code }`, do not destroy/recreate the form; retain the current form DOM values, update only `pairing-phone-status`, re-enable submit, and keep controller drafts in memory. A later explicit provider-choice render may reconstruct the form from controller state via `chooseProvider(providerKind)`.

When success/expired/invalid-bootstrap is rendered, remove all form nodes before rendering status.

- [ ] **Step 5: Freeze sanitized Turkish copy**

```ts
const ERROR_COPY: Record<PairingPhoneErrorCode, string> = {
  INVALID_BOOTSTRAP: "Eşleştirme bağlantısı geçersiz. TV'den yeniden başlatın.",
  REQUIRED: 'Gerekli alanları doldurun.',
  INVALID_URL: 'Geçerli bir bağlantı adresi girin.',
  UNSUPPORTED_PROTOCOL: 'Yalnızca HTTP veya HTTPS adresleri desteklenir.',
  CRYPTO_UNAVAILABLE: 'Bu tarayıcıda güvenli eşleştirme kullanılamıyor.',
  INVALID_TV_KEY: "TV eşleştirme anahtarı geçersiz. TV'den yeniden başlatın.",
  RELAY_UNAVAILABLE: 'Eşleştirme servisine ulaşılamıyor.',
  NETWORK: 'Ağ bağlantısı kurulamadı. Yeniden deneyin.',
};
```

Success: `Bilgiler TV'ye güvenli şekilde gönderildi.` Do not claim TV provider registration succeeded.

- [ ] **Step 6: Add scoped CSS**

Scope all rules under `.pairing-phone-page`; use visible `:focus-visible`; mobile responsive width; no TV 1920x1080 assumptions; include `@media (prefers-reduced-motion: reduce)`; no external font/analytics imports.

- [ ] **Step 7: Add privacy regression scan**

```ts
for (const source of [payloadSource, controllerSource, viewSource]) {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(source, /location\.(search|hash)|URLSearchParams/);
}
```

Also assert relay ciphertext string contains none of the synthetic server URL, username, password, or M3U URL.

- [ ] **Step 8: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
npm run build
git add player/src/pairing/phone-view.ts player/src/ui/pairing-phone.css player/test-ts/pairing-phone-ui.test.ts
git commit -m "feat(pairing): add secure phone pairing UI"
```

---

### Task 5: Verify exact head and open Draft PR

- [ ] **Step 1: Run focused core regressions**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run test:ts -w player -- --test-name-pattern="PAIR-C|PAIR-S|PAIR-R"
npm run typecheck
```

PAIR-C/S/R implementation files remain unchanged.

- [ ] **Step 2: Run canonical gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

All commands must exit 0. `tizen:build` is repository staging compatibility evidence only.

- [ ] **Step 3: Audit exact six-file scope**

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

- [ ] **Step 4: Audit security invariants**

Confirm:

```text
bootstrap has no provider plaintext/private TV key
strict payload exact key/version contract
crypto happens before relay
relay gets only sessionId + serialized PairingCiphertextV1
no browser persistence/cookies/query/hash/logging
invalid/expired bootstrap -> zero crypto/relay
one in-flight submit -> one crypto + one relay
success clears controller drafts and form DOM
PAIR-C/S/R files unchanged
```

- [ ] **Step 5: Open Draft PR only**

PR evidence records ROLE, branch, frozen base, final head, exact six-file scope, RED/GREEN evidence, canonical exact-head evidence, no public host/relay deployment, no TV QR/decrypt/onboarding integration, and end-to-end browser/physical pairing `NOT VERIFIED`. Do not mark Ready and do not merge.
