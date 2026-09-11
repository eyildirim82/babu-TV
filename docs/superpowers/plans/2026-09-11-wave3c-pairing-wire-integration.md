# Wave 3C Pairing Application Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the frozen PAIR-I-CORE into the latest GREEN application composition, expose an optional TV QR pairing surface, and hand successful pairing payloads to the existing Xtream/M3U onboarding services.

**Architecture:** Keep app composition thin. A new TV pairing surface owns start/render/poll/cancel behavior over `PairingTvController`; browser dependencies build the real relay transport/client, pairing core, QR encoder, and onboarding adapter. Pairing availability is driven by explicit public runtime configuration; no real relay or phone-host origin is committed. The existing provider chooser gains an optional `Telefonla Ekle` action only when pairing config is available.

**Tech Stack:** TypeScript 5.9, DOM APIs, `fetch`, existing PAIR-C/S/R/I-CORE, `qrcode@1.5.4` + `@types/qrcode@1.5.6` for local QR rendering, Vite, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-11-wave3c-closure-design.md`

## Start Gate

Do not branch until:

- PAIR-I-CORE exact production head is controller-ready/frozen;
- PROV-REENTRY-I and any other app-composition-changing integration chosen ahead of this lane has merged or been explicitly ordered by controller;
- resulting exact `main` push verify is SUCCESS.

At execution start, after the controller identifies the exact GREEN `main`, run:

```bash
git fetch origin main
PAIR_WIRE_BASE="$(git rev-parse origin/main)"
printf '%s\n' "$PAIR_WIRE_BASE"
git switch -c integration/pairing-onboarding "$PAIR_WIRE_BASE"
test "$(git rev-parse HEAD)" = "$PAIR_WIRE_BASE"
```

Record the printed immutable SHA in the Draft PR body before implementation. All later diff checks in this plan use `$PAIR_WIRE_BASE`.

## Global Constraints

- Branch: `integration/pairing-onboarding`.
- Consume the controller-frozen PAIR-I-CORE head; do not rewrite PAIR-C/S/R algorithms.
- No real provider credentials/endpoints, relay origin, or phone-host origin in source/tests.
- Pairing is optional convenience; TV keyboard Xtream/M3U entry remains available when pairing config is absent.
- QR/deep-link contains only public bootstrap data: `version`, `sessionId`, `expiresAtMs`, `tvPublicKey`, `relayBaseUrl`.
- Provider plaintext never enters QR/deep-link, DOM dataset, logs, or persistent storage.
- Successful decrypted payload delegates to existing onboarding services.
- No implicit playback.
- Draft PR only until controller review.

---

### Task 1: Add browser relay transport and bootstrap deep-link encoding

**Files:**
- Create: `player/src/pairing/fetch-relay-transport.ts`
- Create: `player/src/pairing/bootstrap-link.ts`
- Create: `player/test-ts/pairing-browser-transport.test.ts`
- Create: `player/test-ts/pairing-bootstrap-link.test.ts`

**Interfaces:**

Browser relay transport:

```ts
export class FetchPairingRelayTransport implements PairingRelayTransport {
  constructor(private readonly fetchImpl: typeof fetch) {}
  request<T>(request: PairingRelayRequest): Promise<T>;
}
```

Rules:

```text
GET/POST only from PairingRelayRequest
Content-Type application/json for POST
body = JSON.stringify(request.body) only when body exists
AbortController timeout uses request.timeoutMs
non-2xx -> sanitized PairingRelayError('NETWORK')
invalid non-empty JSON -> PairingRelayError('MALFORMED')
empty response -> null as unknown
never log URL/body/response
```

Bootstrap link:

```ts
export function createPairingPhoneUrl(
  phoneBaseUrl: string,
  bootstrap: PairingTvBootstrapV1,
): string;
```

Encode bootstrap into the URL fragment, not query/user-info, so ordinary HTTP requests to the host do not carry the bootstrap:

```text
<normalized https phoneBaseUrl>#pairing=<base64url(UTF-8 JSON bootstrap)>
```

The JSON object contains exactly the five bootstrap keys and no provider data/private key.

- [ ] **Step 1: Write RED transport tests**

Cover POST JSON shape, GET no body, timeout abort, non-2xx sanitized network error, invalid JSON -> MALFORMED, no console output, and no secret-shaped test data in error strings.

- [ ] **Step 2: Write RED bootstrap-link tests**

Require HTTPS phone base URL, reject user-info/non-HTTPS, strip existing query/hash, exact fragment prefix `#pairing=`, deterministic base64url payload, and decoded exact key set.

- [ ] **Step 3: Run tests and verify RED**

```bash
node --import tsx --test player/test-ts/pairing-browser-transport.test.ts player/test-ts/pairing-bootstrap-link.test.ts
```

- [ ] **Step 4: Implement minimal transport/link modules**

Use `TextEncoder`/`btoa` base64url encoding; do not add provider fields.

- [ ] **Step 5: Run tests GREEN and commit**

```bash
node --import tsx --test player/test-ts/pairing-browser-transport.test.ts player/test-ts/pairing-bootstrap-link.test.ts
git add player/src/pairing/fetch-relay-transport.ts player/src/pairing/bootstrap-link.ts \
  player/test-ts/pairing-browser-transport.test.ts player/test-ts/pairing-bootstrap-link.test.ts
git commit -m "feat(pairing): add browser relay and bootstrap link"
```

---

### Task 2: Add local QR rendering dependency and TV pairing surface

**Files:**
- Modify: `player/package.json`
- Modify: `package-lock.json`
- Create: `player/src/pairing/tv-view.ts`
- Create: `player/src/ui/pairing-tv.css`
- Create: `player/test-ts/pairing-tv-view.test.ts`

**Interfaces:**

Install exact versions:

```bash
npm install qrcode@1.5.4 -w player
npm install -D @types/qrcode@1.5.6 -w player
```

Create view dependencies:

```ts
export interface PairingTvViewCore {
  start(): Promise<PairingTvBootstrapV1>;
  poll(sessionId: string): Promise<PairingTvPollResult>;
}

export interface PairingTvViewCallbacks {
  onBack(): void;
  onCompleted(providerId: ProviderId): void;
}

export interface PairingTvViewConfig {
  phoneBaseUrl: string;
  pollIntervalMs: number;
}

export interface PairingQrPort {
  toDataUrl(value: string): Promise<string>;
}
```

`PairingTvView` owns a single timer while visible and cancels it on hide/back/completion.

- [ ] **Step 1: Write RED TV view tests**

Using an injected scheduler seam, prove:

```text
show -> core.start once
bootstrap -> createPairingPhoneUrl -> QR image rendered
QR/link copy does not render session private key or provider data
pending -> reschedules one poll
completed -> stops timer, renders success, invokes onCompleted once
expired/consumed/error -> stops timer and renders sanitized state
Back -> cancels timer and invokes onBack once
hide -> removes DOM + cancels timer
repeated show cannot create overlapping poll loops
```

- [ ] **Step 2: Run view test and verify RED**

```bash
node --import tsx --test player/test-ts/pairing-tv-view.test.ts
```

- [ ] **Step 3: Implement view/CSS and production QR adapter binding contract**

Use safe DOM creation, `textContent`, `<img src=data-url>` for QR, visible TV-distance focus, and reduced-motion handling. Never put bootstrap or credentials in `data-*` attributes.

The browser composition in Task 5 binds the QR port exactly as:

```ts
{
  toDataUrl: (value) => QRCode.toDataURL(value, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
  }),
}
```

- [ ] **Step 4: Run view tests GREEN**

```bash
node --import tsx --test player/test-ts/pairing-tv-view.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add player/package.json package-lock.json player/src/pairing/tv-view.ts \
  player/src/ui/pairing-tv.css player/test-ts/pairing-tv-view.test.ts
git commit -m "feat(pairing): add TV QR pairing surface"
```

---

### Task 3: Add optional pairing entry to the existing provider chooser

**Files:**
- Modify: `player/src/first-run/first-run-view.ts`
- Modify: `player/test-ts/first-run-view.test.ts`

**Interfaces:**

Extend callbacks:

```ts
export interface FirstRunCallbacks {
  onXtreamSelected(): void;
  onM3uSelected(): void;
  onPairingSelected?(): void;
  onBack(): void;
}
```

Rules:

- render `Telefonla Ekle` only when `onPairingSelected` is supplied;
- preserve existing Xtream/M3U order and behavior;
- focus navigation includes pairing only when available;
- highlight movement emits no callback;
- Select on pairing invokes exactly one callback.

- [ ] **Step 1: Write RED first-run tests**

Prove absent callback leaves existing two-choice surface unchanged and supplied callback adds one stable focus target with explicit-select-only activation.

- [ ] **Step 2: Run focused test and verify RED**

```bash
node --import tsx --test player/test-ts/first-run-view.test.ts
```

- [ ] **Step 3: Implement optional third action and run GREEN**

```bash
node --import tsx --test player/test-ts/first-run-view.test.ts
```

Do not add endpoint/config text to the view.

- [ ] **Step 4: Commit**

```bash
git add player/src/first-run/first-run-view.ts player/test-ts/first-run-view.test.ts
git commit -m "feat(first-run): expose optional phone pairing action"
```

---

### Task 4: Add pairing route to AppComposition

**Files:**
- Modify: `player/src/app/app-composition.ts`
- Modify: `player/test-ts/m5-app-composition.test.ts`

**Interfaces:**

Add route:

```ts
| { kind: 'pairing'; returnTo: 'first-run' | 'provider-management' }
```

Add app pairing port:

```ts
export interface AppPairingViewPort {
  show(): Promise<void>;
  hide(): void;
  handleBack(): void;
}
```

Extend dependencies:

```ts
pairing?: {
  view(callbacks: {
    onBack(): void;
    onCompleted(providerId: ProviderId): void;
  }): AppPairingViewPort;
};
```

- [ ] **Step 1: Write RED composition tests**

Cover:

```text
pairing unavailable -> provider chooser has no pairing callback
first-run pairing select -> route pairing{returnTo:'first-run'}
provider-management add -> chooser -> pairing select -> route pairing{returnTo:'provider-management'}
Back pairing -> original chooser/provider-management with zero provider writes
completed pairing -> Home refresh; no explicit playback call
pairing route hides other modern views
remote Back delegates cleanly and closes only pairing layer
```

- [ ] **Step 2: Run composition tests RED**

```bash
node --import tsx --test player/test-ts/m5-app-composition.test.ts
```

- [ ] **Step 3: Implement route/view ownership**

`hideModernViews()` includes pairing view hide when configured. Pairing completion calls `showHome()` only; onboarding has already selected/activated the provider according to existing services.

- [ ] **Step 4: Run composition tests GREEN and commit**

```bash
node --import tsx --test player/test-ts/m5-app-composition.test.ts
git add player/src/app/app-composition.ts player/test-ts/m5-app-composition.test.ts
git commit -m "feat(app): add TV pairing route"
```

---

### Task 5: Construct real pairing dependencies in browser composition

**Files:**
- Modify: `player/src/app/browser-app-dependencies.ts`
- Create: `player/test-ts/pairing-browser-app-dependencies.test.ts`

**Interfaces:**

Extend input with public optional config:

```ts
pairing?: {
  relayBaseUrl: string;
  phoneBaseUrl: string;
  relayTimeoutMs: number;
  pollIntervalMs: number;
};
```

Construction when present:

```ts
const transport = new FetchPairingRelayTransport(input.fetchImpl);
const relay = new PairingRelayClient(
  input.pairing.relayBaseUrl,
  transport,
  input.pairing.relayTimeoutMs,
);

const pairingCore = createTvPairingCore({
  relay,
  relayBaseUrl: input.pairing.relayBaseUrl,
  onboarding: {
    connectXtream: (entry) => xtreamOnboarding.connect(entry),
    connectM3u: (entry) => m3uOnboarding.connect(entry),
  },
});
```

Bind `PairingQrPort` locally with the exact `QRCode.toDataURL` options from Task 2; no external QR service.

- [ ] **Step 1: Write RED browser-wiring tests**

Assert:

```text
no pairing config -> deps.pairing undefined, keyboard entry still available
pairing config -> PairingRelayClient + core + TV view construct through injected fetch/document
Xtream/M3U completion uses same onboarding service instances as keyboard entry
no CredentialStore direct write from pairing view/controller
no provider payload in relay create/poll requests
```

- [ ] **Step 2: Run focused tests RED**

```bash
node --import tsx --test player/test-ts/pairing-browser-app-dependencies.test.ts
```

- [ ] **Step 3: Implement conditional construction**

Import `../ui/pairing-tv.css` with the browser app bundle; static import is acceptable when feature config is absent.

- [ ] **Step 4: Run focused pairing + M5 tests GREEN**

```bash
node --import tsx --test \
  player/test-ts/pairing-tv-controller.test.ts \
  player/test-ts/pairing-tv-core.test.ts \
  player/test-ts/pairing-browser-transport.test.ts \
  player/test-ts/pairing-bootstrap-link.test.ts \
  player/test-ts/pairing-tv-view.test.ts \
  player/test-ts/pairing-browser-app-dependencies.test.ts \
  player/test-ts/m5-app-composition.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add player/src/app/browser-app-dependencies.ts player/test-ts/pairing-browser-app-dependencies.test.ts
git commit -m "feat(app): wire secure TV pairing dependencies"
```

---

### Task 6: Add explicit runtime configuration boundary in `main.js`

**Files:**
- Modify: `player/src/main.js`
- Modify: `player/test/m3-live-tv-wiring.test.js`

**Interfaces:**

Read only an optional public runtime object:

```js
const pairingConfig = window.__BABUSTV_PAIRING_CONFIG__ ?? null;
```

Accepted keys are copied explicitly into `createBrowserAppDependencies()` input:

```js
pairing: pairingConfig && typeof pairingConfig === 'object'
  ? {
      relayBaseUrl: pairingConfig.relayBaseUrl,
      phoneBaseUrl: pairingConfig.phoneBaseUrl,
      relayTimeoutMs: pairingConfig.relayTimeoutMs,
      pollIntervalMs: pairingConfig.pollIntervalMs,
    }
  : undefined,
```

`__BABUSTV_PAIRING_CONFIG__` contains public endpoints/timing only; never credentials/tokens/private keys.

- [ ] **Step 1: Write RED wiring test**

Assert no hard-coded real relay/phone host is present, absent config preserves boot, and present synthetic `.invalid` config is forwarded once.

- [ ] **Step 2: Run JS wiring test RED**

```bash
node --test player/test/m3-live-tv-wiring.test.js
```

- [ ] **Step 3: Implement minimal config forwarding**

Do not create a second fetch/runtime/provider stack.

- [ ] **Step 4: Run JS wiring test GREEN and commit**

```bash
node --test player/test/m3-live-tv-wiring.test.js
git add player/src/main.js player/test/m3-live-tv-wiring.test.js
git commit -m "feat(pairing): expose optional runtime pairing config"
```

---

### Task 7: Canonical verification, controller audit, and Wave 3C closeout

**Files:**
- Production scope remains bounded to pairing UI/wiring plus package dependency changes.
- After production merge, controller/docs lane updates:
  - `docs/verification/v1-parallel-execution.md`
  - `docs/verification/parallel-development-control.md`

- [ ] **Step 1: Run full gates against the recorded `$PAIR_WIRE_BASE`**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check "$PAIR_WIRE_BASE"...HEAD
```

- [ ] **Step 2: Run source/privacy audit**

Reject final diff if it contains:

```text
real relay/phone/provider endpoint
provider password/username/playlist URL in pairing bootstrap/QR/log/dataset
TV private key serialization/export
new localStorage/sessionStorage/IndexedDB credential path
PAIR-C/S/R algorithm changes
implicit playback from pairing navigation/completion
```

- [ ] **Step 3: Capture exact-head canonical evidence**

Verification-only workflow explicitly checks out/asserts production head, runs all gates and exact scope assertion, then is absent from final production diff.

- [ ] **Step 4: Open Draft PR**

PR title:

```text
PAIR-I-WIRE: integrate secure TV phone pairing
```

Document the recorded exact base/head, PAIR-I-CORE consumed SHA, public runtime config boundary, QR/deep-link shape, relay transport, onboarding delegation, Back/focus/playback invariants, and physical phone/Samsung pairing `NOT VERIFIED`.

- [ ] **Step 5: Controller merge and exact-main push verify**

Only controller marks Ready/merges. After merge require push-triggered verify SUCCESS on exact resulting `main` SHA.

- [ ] **Step 6: Close Wave 3C docs**

On a docs/controller lane, record PROV-REENTRY-I, PROV-DEL-I, PAIR-I-CORE/PAIR-I-WIRE final PRs/SHAs/evidence, mark Wave 3C CLOSED, and unblock the next hardening lanes. Do not claim physical runtime acceptance.
