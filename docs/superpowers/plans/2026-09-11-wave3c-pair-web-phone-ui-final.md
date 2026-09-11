# BabuşTV V1 Wave 3C PAIR-WEB Phone UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a browser-mountable phone pairing UI that validates provider input locally, serializes the frozen payload, encrypts through PAIR-C, and sends only serialized ciphertext through PAIR-R.

**Architecture:** Keep payload serialization, controller/state, and DOM presentation separate. The controller depends on narrow crypto/relay/time ports and reuses existing M3U validation plus PAIR-R relay-base normalization. Hosting, relay deployment, TV session/QR/decrypt, Provider Core and CredentialStore stay outside this lane.

**Tech Stack:** TypeScript 5.9, browser DOM/Web Crypto contracts, Node `node:test`/`tsx`, existing PAIR-C/PAIR-R errors and types.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-pair-web-phone-ui-design.md`

## Global Constraints

- ROLE `PAIR-WEB`; branch `feature/pairing-phone-ui`.
- Frozen exact base `860d9efa8efac7c9872bf31f7f592ae12a414889`.
- Read docs from `docs/wave3c-m5-pair-web-design`; do not cherry-pick docs commits into production.
- PAIR-C/S/R implementation files remain unchanged.
- Plaintext provider data never goes to relay, persistence, cookies, query/hash, analytics/logging, DOM dataset attributes, or public errors.
- Relay receives only `sessionId` + `JSON.stringify(PairingCiphertextV1)`.
- Phone never calls `createSession`/`poll` and never decrypts.
- Reuse `validateM3uEntry()` and `normalizePairingRelayBaseUrl()`.
- Xtream local validation only trims and requires its three existing fields.
- Synthetic `.invalid` endpoints only.
- No public host/fetch transport in this lane.
- End-to-end phone deployment + physical Samsung/Tizen pairing remains `NOT VERIFIED`.

Exact production files:

```text
player/src/pairing/phone-payload.ts
player/src/pairing/phone-controller.ts
player/src/pairing/phone-view.ts
player/src/ui/pairing-phone.css
player/test-ts/pairing-phone-payload.test.ts
player/test-ts/pairing-phone-ui.test.ts
```

---

### Task 1: Strict versioned provider payload

**Files:** create `phone-payload.ts`, `pairing-phone-payload.test.ts`.

- [ ] **Step 1: RED exact Xtream/M3U UTF-8 round trips**

```ts
const xtream: PairingProviderPayloadV1 = { version: 1, credential: { kind: 'xtream', serverUrl: 'https://iptv.example.invalid', username: 'kullanıcı', password: 'şifre' } };
assert.deepEqual(decodePairingProviderPayload(encodePairingProviderPayload(xtream)), xtream);
const m3u: PairingProviderPayloadV1 = { version: 1, credential: { kind: 'm3u', playlistUrl: 'https://playlist.example.invalid/a.m3u8' } };
assert.deepEqual(decodePairingProviderPayload(encodePairingProviderPayload(m3u)), m3u);
```

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
```

Expected RED: module missing.

- [ ] **Step 2: Implement DTO, encoder, exact-key decoder**

```ts
export type PairingProviderPayloadV1 =
  | { version: 1; credential: { kind: 'xtream'; serverUrl: string; username: string; password: string } }
  | { version: 1; credential: { kind: 'm3u'; playlistUrl: string } };

function invalidPayload(): never { throw new Error('Pairing provider payload is invalid.'); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
export function encodePairingProviderPayload(payload: PairingProviderPayloadV1): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}
export function decodePairingProviderPayload(bytes: Uint8Array): PairingProviderPayloadV1 {
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return invalidPayload(); }
  if (!isRecord(parsed) || !exactKeys(parsed, ['version', 'credential']) || parsed.version !== 1) return invalidPayload();
  const credential = parsed.credential;
  if (!isRecord(credential) || typeof credential.kind !== 'string') return invalidPayload();
  if (credential.kind === 'xtream') {
    if (!exactKeys(credential, ['kind', 'serverUrl', 'username', 'password']) || typeof credential.serverUrl !== 'string' || typeof credential.username !== 'string' || typeof credential.password !== 'string') return invalidPayload();
    return { version: 1, credential: { kind: 'xtream', serverUrl: credential.serverUrl, username: credential.username, password: credential.password } };
  }
  if (credential.kind === 'm3u') {
    if (!exactKeys(credential, ['kind', 'playlistUrl']) || typeof credential.playlistUrl !== 'string') return invalidPayload();
    return { version: 1, credential: { kind: 'm3u', playlistUrl: credential.playlistUrl } };
  }
  return invalidPayload();
}
```

- [ ] **Step 3: Rejection matrix + GREEN + commit**

Reject malformed/invalid UTF-8, version != 1, unknown kind, missing/non-string fields, and any extra top-level/credential keys.

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
git add player/src/pairing/phone-payload.ts player/test-ts/pairing-phone-payload.test.ts
git commit -m "feat(pairing): define strict phone payload contract"
```

---

### Task 2: Bootstrap + controller drafts + local validation

**Files:** create `phone-controller.ts`, start `pairing-phone-ui.test.ts`.

- [ ] **Step 1: Freeze public types**

```ts
export interface PairingPhoneBootstrapV1 { version: 1; sessionId: string; expiresAtMs: number; tvPublicKey: JsonWebKey; relayBaseUrl: string; }
export type PairingPhoneErrorCode = 'INVALID_BOOTSTRAP' | 'REQUIRED' | 'INVALID_URL' | 'UNSUPPORTED_PROTOCOL' | 'CRYPTO_UNAVAILABLE' | 'INVALID_TV_KEY' | 'RELAY_UNAVAILABLE' | 'NETWORK';
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
export interface PairingPhoneCryptoPort { encryptForTv(tvPublicKey: JsonWebKey, plaintext: Uint8Array): Promise<PairingCiphertextV1>; }
export interface PairingPhoneRelayPort { putCiphertext(request: { sessionId: string; ciphertext: string }): Promise<void>; }
```

- [ ] **Step 2: RED invalid/expired bootstrap tests**

Malformed bootstrap is cast through `unknown` in tests; after provider selection + submit assert `INVALID_BOOTSTRAP` and zero crypto/relay. With `expiresAtMs === nowMs()` assert `expired` and zero calls.

- [ ] **Step 3: Implement exact bootstrap and draft methods**

```ts
private validBootstrap(): boolean {
  if (this.bootstrap.version !== 1 || this.bootstrap.sessionId.trim().length === 0 || !Number.isFinite(this.bootstrap.expiresAtMs) || typeof this.bootstrap.relayBaseUrl !== 'string') return false;
  try { normalizePairingRelayBaseUrl(this.bootstrap.relayBaseUrl); return true; }
  catch { return false; }
}

state(): PairingPhoneState { return this.view; }
chooseProvider(kind: 'xtream' | 'm3u'): void {
  if (this.view.kind === 'sending') return;
  this.view = kind === 'xtream'
    ? { kind: 'xtream', input: { ...this.xtreamDraft }, error: null }
    : { kind: 'm3u', input: { ...this.m3uDraft }, error: null };
}
updateXtream(input: XtreamPhoneInput): void {
  if (this.view.kind !== 'xtream') return;
  this.xtreamDraft = { ...input };
  this.view = { kind: 'xtream', input: { ...input }, error: null };
}
updateM3u(input: M3uPhoneInput): void {
  if (this.view.kind !== 'm3u') return;
  this.m3uDraft = { ...input };
  this.view = { kind: 'm3u', input: { ...input }, error: null };
}
back(): void {
  if (this.view.kind === 'xtream' || this.view.kind === 'm3u' || this.view.kind === 'error') this.view = { kind: 'choose-provider' };
}
```

Private initial drafts are all empty strings.

- [ ] **Step 4: Implement exact local validation functions**

```ts
private normalizedXtream(): PairingProviderPayloadV1 | null {
  const serverUrl = this.xtreamDraft.serverUrl.trim();
  const username = this.xtreamDraft.username.trim();
  const password = this.xtreamDraft.password.trim();
  if (!serverUrl || !username || !password) {
    this.view = { kind: 'xtream', input: { ...this.xtreamDraft }, error: 'REQUIRED' };
    return null;
  }
  return { version: 1, credential: { kind: 'xtream', serverUrl, username, password } };
}
private normalizedM3u(): PairingProviderPayloadV1 | null {
  const result = validateM3uEntry({ playlistUrl: this.m3uDraft.playlistUrl });
  if (!result.ok) {
    this.view = { kind: 'm3u', input: { ...this.m3uDraft }, error: result.code };
    return null;
  }
  return { version: 1, credential: result.credential };
}
```

- [ ] **Step 5: GREEN + commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
git add player/src/pairing/phone-controller.ts player/test-ts/pairing-phone-ui.test.ts
git commit -m "feat(pairing): add phone pairing state and validation"
```

---

### Task 3: Encrypt locally and relay ciphertext only

**Files:** modify controller + test.

- [ ] **Step 1: RED ciphertext-only and duplicate-submit tests**

Instantiate controller directly with a valid synthetic bootstrap, fake crypto returning a synthetic `PairingCiphertextV1`, and fake relay recorder. Assert relay receives exactly `{sessionId:'session-1', ciphertext:JSON.stringify(envelope)}` and ciphertext string contains none of synthetic provider URL/username/password. Use a deferred crypto Promise, invoke `submit()` twice before resolving, and assert one crypto + one relay call.

- [ ] **Step 2: Implement separate sanitized crypto/relay mappings**

```ts
function cryptoErrorCode(error: unknown): PairingPhoneErrorCode {
  if (error instanceof PairingCryptoError && error.code === 'INVALID_KEY') return 'INVALID_TV_KEY';
  return 'CRYPTO_UNAVAILABLE';
}
function relayErrorCode(error: unknown): PairingPhoneErrorCode {
  if (error instanceof PairingRelayError && error.code === 'NETWORK') return 'NETWORK';
  if (error instanceof PairingRelayError) return 'RELAY_UNAVAILABLE';
  return 'NETWORK';
}
```

- [ ] **Step 3: Implement complete `submit()`**

```ts
async submit(): Promise<void> {
  if (this.view.kind === 'sending' || this.view.kind === 'success') return;
  const providerKind = this.view.kind === 'xtream' || this.view.kind === 'm3u' ? this.view.kind : this.view.kind === 'error' ? this.view.providerKind : null;
  if (!this.validBootstrap()) { this.view = { kind: 'error', providerKind, code: 'INVALID_BOOTSTRAP' }; return; }
  if (this.deps.nowMs() >= this.bootstrap.expiresAtMs) { this.view = { kind: 'expired' }; return; }
  if (providerKind === null) { this.view = { kind: 'error', providerKind: null, code: 'REQUIRED' }; return; }
  const payload = providerKind === 'xtream' ? this.normalizedXtream() : this.normalizedM3u();
  if (payload === null) return;
  this.view = { kind: 'sending', providerKind };
  let envelope: PairingCiphertextV1;
  try {
    envelope = await this.deps.crypto.encryptForTv(this.bootstrap.tvPublicKey, encodePairingProviderPayload(payload));
  } catch (error) {
    this.view = { kind: 'error', providerKind, code: cryptoErrorCode(error) };
    return;
  }
  try {
    await this.deps.relay.putCiphertext({ sessionId: this.bootstrap.sessionId, ciphertext: JSON.stringify(envelope) });
  } catch (error) {
    this.view = { kind: 'error', providerKind, code: relayErrorCode(error) };
    return;
  }
  this.xtreamDraft = { serverUrl: '', username: '', password: '' };
  this.m3uDraft = { playlistUrl: '' };
  this.view = { kind: 'success' };
}
```

- [ ] **Step 4: Retry-memory and success-clear tests**

Relay first throws `PairingRelayError('NETWORK')`; call `chooseProvider('xtream')` and assert draft values return. Next relay succeeds; after success call `chooseProvider('xtream')` and assert all fields empty. No persistence APIs.

- [ ] **Step 5: GREEN + commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
git add player/src/pairing/phone-controller.ts player/test-ts/pairing-phone-ui.test.ts
git commit -m "feat(pairing): encrypt and relay phone payload"
```

---

### Task 4: Accessible phone DOM surface

**Files:** create `phone-view.ts`, `pairing-phone.css`; extend UI test.

- [ ] **Step 1: RED DOM-state matrix**

Copy the minimal fake DOM class bodies from `first-run-view.test.ts` into this test file. Assert: chooser buttons; Xtream URL/text/password labels; M3U URL label; `aria-live`; validation focus; sending submit disabled; success removes credential inputs; expired/invalid-bootstrap reveal no raw provider/bootstrap values; form Back returns chooser.

- [ ] **Step 2: Implement safe rendering primitives**

Create all DOM via `createElement`; fixed IDs `pairing-phone-page`, `pairing-phone-status`, `pairing-phone-xtream`, `pairing-phone-m3u`, `pairing-phone-submit`, `pairing-phone-back`; assign user data only to input `.value`; status/labels use `textContent`; no `innerHTML`/dataset for user/bootstrap/provider values.

- [ ] **Step 3: Implement event flow and error preservation**

Input events submit complete draft values to controller. Submit awaits controller. On `error` with provider kind, keep current form DOM, set fixed status copy and re-enable submit; do not destroy input nodes. On success/expired/invalid-bootstrap remove form nodes before status render. Back from form calls `controller.back()` then full render.

- [ ] **Step 4: Fixed Turkish error copy**

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

Success copy: `Bilgiler TV'ye güvenli şekilde gönderildi.`

- [ ] **Step 5: Scoped CSS + privacy scan**

CSS scoped under `.pairing-phone-page`, mobile responsive, visible `:focus-visible`, reduced-motion media query, no external assets.

```ts
for (const source of [payloadSource, controllerSource, viewSource]) {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(source, /location\.(search|hash)|URLSearchParams/);
}
```

- [ ] **Step 6: GREEN + commit**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run typecheck
npm run build
git add player/src/pairing/phone-view.ts player/src/ui/pairing-phone.css player/test-ts/pairing-phone-ui.test.ts
git commit -m "feat(pairing): add secure phone pairing UI"
```

---

### Task 5: Exact-head gates and Draft PR

- [ ] **Step 1: Focused frozen-core regression**

```bash
npm run test:ts -w player -- --test-name-pattern="PAIR-WEB"
npm run test:ts -w player -- --test-name-pattern="PAIR-C|PAIR-S|PAIR-R"
npm run typecheck
```

- [ ] **Step 2: Canonical gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

- [ ] **Step 3: Exact six-file audit**

```bash
git diff --name-only 860d9efa8efac7c9872bf31f7f592ae12a414889...HEAD
```

Must equal the six Global Constraints files exactly. Confirm bootstrap/payload privacy, crypto-before-relay, duplicate-submit bound, invalid/expired zero calls, success clear, and frozen PAIR-C/S/R files unchanged.

- [ ] **Step 4: Draft PR only**

Record ROLE/branch/base/head/files, RED/GREEN, exact-head gates, no public host/relay deployment, no TV QR/decrypt/onboarding integration, and end-to-end pairing `NOT VERIFIED`. Do not mark Ready or merge.
