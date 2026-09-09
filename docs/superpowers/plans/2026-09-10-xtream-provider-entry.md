# Xtream Provider Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a remote-first Xtream Codes entry flow that safely registers, initially syncs, activates, and boots an Xtream provider before M4 EPG work.

**Architecture:** XT-A builds a UI-independent onboarding transaction service. XT-B builds a dedicated remote-first entry surface that depends only on a submit callback. After both are independently GREEN, XT-C factors shared browser Provider Core construction and wires the surface into the existing Settings/first-launch path; success reloads the app so the existing M3 startup path owns runtime initialization exactly once.

**Tech Stack:** TypeScript/JavaScript, Vite, Node test runner + `tsx`, existing Provider Core/IndexedDB/WidgetData boundaries, existing BabuşTV CSS tokens/primitives.

**Spec:** `docs/superpowers/specs/2026-09-10-xtream-provider-entry-design.md`

## Global Constraints

- Base every implementation branch on the exact GREEN controller checkpoint created after this plan lands.
- TDD is mandatory: focused acceptance RED → minimum implementation → focused GREEN → full regression.
- Never persist Xtream username/password/server credential URLs to localStorage or ordinary structured catalog/provider storage.
- Never put credentials in provider IDs, DOM `data-*` attributes, logs, errors, screenshots, or test artifacts.
- Existing M3U/legacy, playback, recovery, remote, EPG, Home, favorites, search, pairing, and Tizen packaging semantics stay unchanged unless a task explicitly assigns a narrow integration touch.
- XT-A and XT-B must not edit the same production files and may run in parallel.
- XT-C starts only after XT-A and XT-B are reviewed and merged/available on a common GREEN integration base.
- Physical-Tizen credential persistence is not claimed PASS without real Tizen evidence.

---

### Task 1 / XT-A: Xtream onboarding transaction service

**Files:**
- Create: `player/src/providers/xtream-onboarding-service.ts`
- Create: `player/test-ts/xtream-onboarding-service.test.ts`

**Interfaces:**
- Consumes existing `ProviderCoreService`-compatible operations: `registerProvider`, `switchActiveProvider`, `deleteProvider`, `loadCached`.
- Consumes existing `ProviderSyncService.refresh(providerId): Promise<ProviderSyncReport>` shape.
- Produces:

```ts
export interface XtreamConnectInput {
  serverUrl: string;
  username: string;
  password: string;
}

export interface XtreamConnectSuccess {
  providerId: ProviderId;
  profile: ProviderProfile;
  snapshot: ProviderSnapshot;
}

export interface XtreamOnboardingDependencies {
  core: Pick<ProviderCoreService,
    'registerProvider' | 'switchActiveProvider' | 'deleteProvider' | 'loadCached'>;
  sync: Pick<ProviderSyncService, 'refresh'>;
  createProviderId: () => ProviderId;
  now: () => number;
}

export class XtreamOnboardingService {
  constructor(deps: XtreamOnboardingDependencies);
  connect(input: XtreamConnectInput): Promise<XtreamConnectSuccess>;
}
```

- [ ] **Step 1: Write focused RED transaction tests**

Cover these exact cases with synthetic credential values:

```ts
it('registers, syncs channels, activates, and returns the cached snapshot in order', async () => {});
it('trims inputs and rejects empty fields before Provider Core work', async () => {});
it('preserves ProviderError from registration without post-registration cleanup', async () => {});
it('rolls back the new provider when initial sync throws', async () => {});
it('rolls back and preserves the channel-stage error code when channel sync fails', async () => {});
it('allows category failure when channel sync succeeds', async () => {});
it('rolls back when active-provider selection fails', async () => {});
it('rolls back when post-sync cache loading fails', async () => {});
it('never derives provider id from credential material', async () => {});
```

Assert event order explicitly:

```ts
assert.deepEqual(events, [
  'register',
  'sync',
  'activate',
  'loadCached',
]);
```

For failure paths, assert `deleteProvider(providerId)` occurs after registration and before rejection, and that the rejected error contains no synthetic username/password/server URL.

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node --import tsx --test player/test-ts/xtream-onboarding-service.test.ts
```

Expected: FAIL because `xtream-onboarding-service.ts` / `XtreamOnboardingService` does not yet exist.

- [ ] **Step 3: Implement the minimum service**

Create a service with this control flow:

```ts
const serverUrl = input.serverUrl.trim();
const username = input.username.trim();
const password = input.password.trim();
if (!serverUrl || !username || !password) {
  throw new ProviderError('MALFORMED', null, 'Xtream credentials are required.');
}

const providerId = deps.createProviderId();
const provider: ProviderRecord = {
  id: providerId,
  kind: 'xtream',
  name: safeServerLabel(serverUrl),
  createdAtMs: deps.now(),
  lastSuccessfulSyncAtMs: null,
};
const credential: XtreamCredential = { kind: 'xtream', serverUrl, username, password };

const profile = await deps.core.registerProvider(provider, credential);
try {
  const report = await deps.sync.refresh(providerId);
  if (report.channels.status === 'failed') {
    throw new ProviderError(
      report.channels.code,
      null,
      'Initial provider channel sync failed.',
    );
  }
  await deps.core.switchActiveProvider(providerId);
  const snapshot = await deps.core.loadCached(providerId);
  return { providerId, profile, snapshot };
} catch (error) {
  try { await deps.core.deleteProvider(providerId); } catch {}
  if (error instanceof ProviderError) throw error;
  throw new ProviderError('UNAVAILABLE', null, 'Provider connection could not be completed.');
}
```

`safeServerLabel()` may use `new URL(serverUrl).host` but must fall back to `Xtream`; it must never include URL username/password/query/hash.

- [ ] **Step 4: Run focused GREEN**

```bash
node --import tsx --test player/test-ts/xtream-onboarding-service.test.ts
```

Expected: all XT-A cases PASS.

- [ ] **Step 5: Run regression for XT-A**

```bash
npm test
npm run typecheck
npm run build

git diff --exit-code
```

Expected: PASS. Do not modify UI/runtime integration files to make XT-A pass.

- [ ] **Step 6: Commit XT-A**

```bash
git add player/src/providers/xtream-onboarding-service.ts player/test-ts/xtream-onboarding-service.test.ts
git commit -m "feat(provider): add Xtream onboarding transaction"
```

Open a Draft PR with RED/GREEN exact-head evidence. Do not Ready/merge from the worker role.

---

### Task 2 / XT-B: Remote-first Xtream entry presentation

**Files:**
- Create: `player/src/xtream-entry.ts`
- Create: `player/src/ui/xtream-entry.css`
- Modify: `player/src/ui/copy.js`
- Modify: `player/src/ui/copy.d.ts`
- Create: `player/test-ts/xtream-entry.test.ts`
- Create or extend a static presentation acceptance test under `player/test/` if needed for stylesheet/copy ownership.

**Interfaces:**
- Does not import Provider Core repositories, CredentialStore, sync service, localStorage, playback, or Tizen APIs.
- Produces:

```ts
export interface XtreamEntrySubmission {
  serverUrl: string;
  username: string;
  password: string;
}

export interface XtreamEntryCallbacks {
  onSubmit(input: XtreamEntrySubmission): Promise<void>;
  onBack(): void;
}

export class XtreamEntryView {
  constructor(document: Document, callbacks: XtreamEntryCallbacks);
  show(): void;
  hide(): void;
  isVisible(): boolean;
  handleAction(action: 'up' | 'down' | 'select' | 'back'): void;
}
```

- [ ] **Step 1: Write focused RED UI-state tests**

Test pure/exported helpers and the view contract without adding a DOM dependency package. Use minimal fake Document/Element fixtures or keep navigation/error-copy helpers pure enough to test directly.

Required cases:

```ts
it('uses the fixed five-item focus order', () => {});
it('maps ProviderError codes to approved Turkish copy', () => {});
it('rejects a second submit while one is pending', async () => {});
it('keeps server username and password values after a failed submit', async () => {});
it('returns focus to Bağlan after failure', async () => {});
it('masks the password field and does not place credential material in data attributes', () => {});
it('Back calls onBack without submitting', () => {});
```

The rendered controls must use ids that XT-C can treat as stable integration seams:

```text
xtream-server-url
xtream-username
xtream-password
xtream-connect
xtream-back
xtream-status
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
node --import tsx --test player/test-ts/xtream-entry.test.ts
```

Expected: FAIL because the Xtream entry module does not exist.

- [ ] **Step 3: Add exact shared Turkish copy**

Extend `UI_COPY` / declaration with one grouped surface:

```js
xtreamEntry: {
  title: 'Xtream Codes ile Bağlan',
  serverUrl: "Sunucu URL'si",
  username: 'Kullanıcı adı',
  password: 'Şifre',
  connect: 'Bağlan',
  back: 'Geri',
  connecting: 'Bağlanıyor…',
  required: 'Sunucu, kullanıcı adı ve şifre gerekli.',
  auth: 'Kullanıcı adı veya şifre hatalı.',
  network: 'Sunucuya ulaşılamadı.',
  timeout: 'Bağlantı zaman aşımına uğradı.',
  notFound: 'Sunucu kaynağı bulunamadı.',
  server: 'Sunucu geçici bir hata döndürdü.',
  malformed: 'Sunucu yanıtı desteklenmiyor.',
  unavailable: 'Bağlantı kurulamadı.',
}
```

- [ ] **Step 4: Implement the minimum view**

Render one full-screen overlay into `document.body` only while shown. Store credential values only in live input `.value` properties.

Use:

```html
<input id="xtream-server-url" autocomplete="off">
<input id="xtream-username" autocomplete="off">
<input id="xtream-password" type="password" autocomplete="off">
<button id="xtream-connect">Bağlan</button>
<button id="xtream-back">Geri</button>
<div id="xtream-status" aria-live="polite"></div>
```

No `data-*` field may contain form values.

`handleAction()` owns the five-item focus index. On failed submit it leaves input values unchanged, renders safe copy from `ProviderError.code` (unknown → unavailable), clears pending state, and focuses `xtream-connect`.

- [ ] **Step 5: Add BabuşTV presentation CSS**

`player/src/ui/xtream-entry.css` must consume semantic tokens from the existing design system. Strong focus uses the BabuşTV violet focus variables; no inherited orange/red focus color is permitted. Include reduced-motion handling.

- [ ] **Step 6: Run focused and copy/presentation GREEN**

```bash
node --import tsx --test player/test-ts/xtream-entry.test.ts
node --test player/test/babustv-copy.test.js
```

Also run any new static presentation test added for the CSS contract.

- [ ] **Step 7: Run regression for XT-B**

```bash
npm test
npm run brand:check
npm run typecheck
npm run build

git diff --exit-code
```

Expected: PASS. Do not modify `main.js`, `settings.js`, Provider Core, repository, credential, playback, or remote implementation.

- [ ] **Step 8: Commit XT-B**

```bash
git add player/src/xtream-entry.ts player/src/ui/xtream-entry.css player/src/ui/copy.js player/src/ui/copy.d.ts player/test-ts/xtream-entry.test.ts player/test
git commit -m "feat(ui): add Xtream provider entry surface"
```

Open a Draft PR with RED/GREEN exact-head evidence. Do not Ready/merge from the worker role.

---

### Task 3 / XT-C: Browser runtime and Settings integration

**Dependency:** Start only from a common GREEN base containing reviewed XT-A and XT-B contracts.

**Files:**
- Create: `player/src/providers/create-browser-provider-runtime.ts`
- Modify: `player/src/live-tv/create-live-tv-runtime.ts`
- Modify: `player/src/main.js`
- Modify: `player/src/settings.js`
- Modify: `player/index.html` only if needed for stylesheet loading; prefer importing `./ui/xtream-entry.css` from the integration module/main path through Vite.
- Create: `player/test-ts/xtream-entry-integration.test.ts`
- Extend focused legacy/source-contract tests only where required to lock no-regression behavior.

**Interfaces:**
- Consumes `XtreamOnboardingService`, `XtreamEntryView`, existing Provider Core repositories/credentials/adapters/sync.
- Produces one shared factory:

```ts
export interface BrowserProviderRuntimeDependencies {
  indexedDb: IDBFactory | null;
  widgetData: WidgetDataLike | null;
  fetchImpl: typeof fetch;
}

export function createBrowserProviderRuntime(deps: BrowserProviderRuntimeDependencies) {
  return { providers, catalog, credentials, adapters, sync, core };
}
```

- [ ] **Step 1: Write RED integration tests**

Required cases:

```ts
it('shared browser provider runtime wires the same repository and credential boundaries used by M3 startup', () => {});
it('Xtream settings action opens the dedicated entry view without changing M3U settings data', () => {});
it('successful submit calls onboarding once and reloads only after success', async () => {});
it('failed submit does not reload and leaves the entry view open', async () => {});
it('remote actions are routed to Xtream entry before Settings while the entry view is visible', () => {});
it('back from Xtream entry restores the existing Settings surface', () => {});
```

- [ ] **Step 2: Run focused integration test and verify RED**

```bash
node --import tsx --test player/test-ts/xtream-entry-integration.test.ts
```

Expected: FAIL because shared runtime construction and Settings/main wiring do not yet exist.

- [ ] **Step 3: Factor shared browser Provider Core construction**

Move only this repeated construction into `create-browser-provider-runtime.ts`:

```ts
const store = new IndexedDbStructuredStore(deps.indexedDb);
const providers = new StructuredProviderRepository(store);
const catalog = new StructuredCatalogRepository(store);
const credentials = new SamsungWidgetDataCredentialStore(deps.widgetData);
const http = new FetchProviderHttpClient(deps.fetchImpl);
const adapters = new ProviderAdapterFactoryImpl(http);
const sync = new ProviderSyncService(providers, catalog, credentials, adapters);
const core = new ProviderCoreService(providers, catalog, credentials, sync, adapters);
return { providers, catalog, credentials, adapters, sync, core };
```

Refactor `createBrowserLiveTvRuntime()` to consume this factory. Do not change its startup/fallback semantics.

- [ ] **Step 4: Add Settings entry action**

Extend `settings.init(...callbacks)` with an optional callback such as:

```js
onXtreamRequested: callbacks.onXtreamRequested || null
```

Add one source-section button labeled from `UI_COPY.xtreamEntry.title`. Selecting it invokes the callback only; `settings.js` must not see or store credentials.

Existing playlist add/edit/fetch behavior must remain unchanged.

- [ ] **Step 5: Wire main orchestration**

In the legacy/first-launch Settings path, create one `XtreamEntryView` and route remote actions to it before normal Settings handling while visible.

Construct onboarding dependencies using `createBrowserProviderRuntime()` and an opaque production ID generator that contains no credential material, for example:

```js
function createXtreamProviderId() {
  return `xtream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
```

IDs are non-secret identifiers only; collision is still guarded by `registerProvider()` duplicate rejection.

The submit callback is:

```ts
await onboarding.connect(input);
window.location.reload();
```

Reload occurs only after the onboarding transaction fully succeeds.

- [ ] **Step 6: Run focused integration GREEN**

```bash
node --import tsx --test player/test-ts/xtream-entry-integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run full regression and security audit**

```bash
npm test
npm run brand:check
npm run typecheck
npm run build
npm run tizen:build
rg -n "xtream.*(password|username)|password.*xtream|username.*xtream" player/src player/index.html

git diff --exit-code
```

Review every `rg` hit manually. Expected: declarations/form field names/tests may mention credential field names, but no credential values, URL assembly, logs, localStorage persistence, provider IDs, or DOM `data-*` storage are introduced outside the established secure Provider Core boundary.

- [ ] **Step 8: Browser smoke with synthetic data only**

At 1920×1080 verify:

```text
Settings/source → Xtream Codes ile Bağlan
focus: server → username → password → Bağlan → Geri
password visibly masked
empty submit shows required message
synthetic rejected AUTH preserves all fields and focuses Bağlan
Back returns to Settings
```

Do not capture real provider credentials in screenshots/artifacts.

- [ ] **Step 9: Commit and open Draft PR**

```bash
git add player/src/providers/create-browser-provider-runtime.ts player/src/live-tv/create-live-tv-runtime.ts player/src/main.js player/src/settings.js player/index.html player/test-ts/xtream-entry-integration.test.ts player/test
git commit -m "feat(provider): wire Xtream entry onboarding"
```

Draft PR only. Controller reviews exact-head CI and browser evidence before Ready/merge.

---

### Task 4: Final controller gate before EPG

**Files:**
- Update controller/evidence docs only after XT-C merge and post-merge GREEN, if the canonical board requires a new checkpoint entry.

- [ ] **Step 1: Verify final integration head**

```bash
npm test
npm run brand:check
npm run typecheck
npm run build
npm run tizen:build

git diff --exit-code
```

- [ ] **Step 2: Record environment-limited evidence honestly**

Browser/package staging may be PASS when observed. Emulator/physical-TV credential persistence remains `NOT-AVAILABLE` or `DEFERRED` unless it was actually run on Tizen hardware/runtime.

- [ ] **Step 3: Confirm M4 gate**

Only after the final exact `main` head is GREEN should M4 EPG work start. M3G hardware evidence remains an independent runtime gate and must not be silently converted to PASS.
