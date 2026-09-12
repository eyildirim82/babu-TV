# BabuşTV RC-BROWSER Parallel Qualification Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` for the parallel scenario lanes, `superpowers:systematic-debugging` for every observed deterministic defect, and `superpowers:verification-before-completion` before claiming any lane GREEN. RC-BROWSER workers do not own production fixes.

**ROLE:** `RC-BROWSER-CONTROLLER`  
**Canonical qualification branch:** `verification/v1-rc-browser`  
**Exact frozen production base:** `409e416c88f0bd12666302fdaab533a626421a29`  
**Post-M7 exact-main verify:** `34707993412` SUCCESS  
**Approved design:** `docs/superpowers/specs/2026-09-12-rc-browser-qualification-design.md`  
**Goal:** Qualify the exact integrated application in a deterministic 1920×1080 Chromium environment by building one shared harness, then running five non-overlapping browser workers in parallel from one immutable harness head, without changing production behavior.

## Global constraints

1. Production `main` is read-only to RC-BROWSER. No worker may modify `player/src/**`.
2. No worker may patch a deterministic browser defect. It must preserve RED evidence and return it to the controller.
3. Shared/global defects requiring composition, storage schema, provider transaction, or playback/session ownership are reported as `RC INTEGRATION FIX REQUIRED`.
4. Test/provider data is synthetic only. Use `.invalid` provider/relay/stream domains and canary secrets that are safe to publish.
5. No real provider credential, credential-bearing real URL, stream token, decrypted pairing payload, or customer data may appear in commits, screenshots, traces, PR text, logs, or artifacts.
6. Browser qualification is not physical Samsung/Tizen qualification.
7. `npm run tizen:package` remains RC-PACKAGE scope and must not be pulled into this lane.
8. Any controller-approved RC production fix invalidates affected browser evidence. Require new exact-main push GREEN and requalification against the new exact production SHA.

## Parallel execution shape

```text
main@409e416c... GREEN
        |
        v
H0 — serial browser harness foundation
verification/v1-rc-browser
        |
        | freeze RC_BROWSER_H0=<exact H0 SHA>
        |
        +----------------+----------------+----------------+----------------+----------------+
        |                |                |                |                |
        v                v                v                v                v
BROW-PROV          BROW-LIVE       BROW-PLAYNAV      BROW-STATE       BROW-SECPAIR
provider           Home/Live TV    playback/nav      persistence      security/pairing
lifecycle          features         regressions       isolation        leakage
        |                |                |                |                |
        +----------------+----------------+----------------+----------------+
                                         |
                                         v
                          controller integration / triage
                                         |
                                         v
                          final full exact-head qualification
```

The five scenario workers start from the **same exact H0 SHA**. They do not rebase onto each other. Each owns exactly one spec file and one fixture file. Shared harness files are read-only after H0 freezes.

Recommended simultaneous active workers after H0: **5**.

---

# Task 0 — Controller preflight and exact-base lock

Before creating the qualification branch, live-verify:

```bash
git fetch origin main
git rev-parse origin/main
```

Required result:

```text
409e416c88f0bd12666302fdaab533a626421a29
```

Also verify GitHub run `34707993412` remains `SUCCESS` on that exact SHA, PR #96 remains merged/closed, and PR #91 remains unmerged historical RED evidence.

Create the canonical qualification branch directly from the exact SHA:

```bash
git switch --detach 409e416c88f0bd12666302fdaab533a626421a29
git switch -c verification/v1-rc-browser
git rev-parse HEAD
```

Do not branch from the docs PR head.

Record:

```text
RC_BROWSER_PRODUCTION_BASE=409e416c88f0bd12666302fdaab533a626421a29
```

No qualification work starts if live `main` no longer matches this base unless the controller explicitly freezes the newer legitimate GREEN main.

---

# Task 1 — H0: serial browser harness foundation

**Branch:** `verification/v1-rc-browser`  
**Owner:** controller / H0 worker only  
**Depends on:** Task 0  
**Must finish before:** any parallel scenario worker starts

## H0 owned files

```text
package.json
package-lock.json
.gitignore
.github/workflows/rc-browser.yml
tools/rc-browser/playwright.config.mjs
tools/rc-browser/lib/harness.mjs
tools/rc-browser/lib/widgetdata-stub.mjs
tools/rc-browser/lib/provider-mocks.mjs
tools/rc-browser/lib/evidence.mjs
tools/rc-browser/fixtures/common.mjs
tools/rc-browser/specs/harness-smoke.spec.mjs
```

No `player/src/**` file may change.

## Step 1.1 — Add one exact browser dependency

Install exactly:

```bash
npm install --save-dev --save-exact @playwright/test@1.63.0
```

Do not run a dependency upgrade and do not alter existing dependency ranges except for the new Playwright dev dependency and lockfile entries it requires.

Add root scripts:

```json
{
  "rc:browser": "playwright test -c tools/rc-browser/playwright.config.mjs",
  "rc:browser:list": "playwright test -c tools/rc-browser/playwright.config.mjs --list"
}
```

## Step 1.2 — Ignore generated browser evidence

Append only:

```text
/test-results/
/playwright-report/
/rc-browser-artifacts/
```

to `.gitignore`.

Screenshots/traces are workflow artifacts, not committed binaries.

## Step 1.3 — Create deterministic Playwright config

`tools/rc-browser/playwright.config.mjs` must:

- test only `tools/rc-browser/specs`;
- use Chromium only;
- force viewport `{ width: 1920, height: 1080 }`;
- base URL `http://127.0.0.1:4173/babustv/`;
- use reduced flake defaults: one worker per spec file unless CI explicitly shards by file;
- disable retries locally and allow at most one CI retry only for infrastructure failure classification, never to hide deterministic product failure;
- capture screenshot/trace on failure;
- run the production build through Vite preview.

Use this structure:

```js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173/babustv/',
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm run preview -w player -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/babustv/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

The workflow must run `npm run build` before Playwright so preview serves exact built output.

## Step 1.4 — Implement a browser-only WidgetData stub without browser secret persistence

Production credentials require the Samsung WidgetData seam and have no localStorage/IndexedDB fallback. The browser harness therefore supplies `window.webapis.widgetdata` before application code runs.

`tools/rc-browser/lib/widgetdata-stub.mjs` must keep the serialized credential document in **Node-side test memory**, not browser localStorage or IndexedDB. Use Playwright bindings or an equivalent Node-owned closure so reloads within one test preserve WidgetData state while browser storage never contains credential canaries.

Required behavior:

```text
read(success,error)   -> null or current serialized credential document
write(data,success,error) -> replace current Node-side value
remove(success,error) -> clear Node-side value
```

Expose harness helpers to:

- initialize WidgetData before navigation;
- read current raw Node-side value for assertions;
- clear it between tests;
- intentionally mark the stub unavailable for failure cases.

Never print the stored value.

## Step 1.5 — Implement deterministic provider and relay mocks

`tools/rc-browser/lib/provider-mocks.mjs` must register Playwright routes for synthetic `.invalid` hosts only.

Support:

- Xtream `player_api.php` profile/categories/streams/EPG responses;
- M3U playlist responses;
- synthetic stream-resolution URLs;
- HTTP 401/403/404/500;
- transport abort/failure;
- malformed JSON/M3U;
- empty provider/catalog;
- pairing relay create/put/poll endpoints.

The mock may inspect request URLs internally to decide the response, but evidence output must never emit username/password/query or stream credential paths.

Use stable fixture identities such as:

```text
provider A host: https://provider-a.invalid
provider B host: https://provider-b.invalid
Xtream username: rc-user-a
Xtream password: rc-password-a-DO-NOT-LOG
M3U URL: https://m3u-a.invalid/list.m3u?token=rc-m3u-token-DO-NOT-LOG
stream canary: rc-stream-token-DO-NOT-LOG
relay: https://relay.invalid
phone: https://phone.invalid/pair
```

## Step 1.6 — Implement shared evidence capture

`tools/rc-browser/lib/evidence.mjs` must collect per scenario:

```text
scenario id
exact expected production SHA
starting state label
user actions
expected state
observed state
console errors/warnings
page errors
request failures
reload/persistence result
leakage result
artifact attachment paths
PASS / RED / NOT-AVAILABLE
```

Before writing any evidence JSON/text, sanitize captured URLs/errors with fixed redaction rules. The helper must reject evidence containing any of the synthetic secret canaries.

`tools/rc-browser/lib/harness.mjs` must provide common helpers for:

- `installBrowserHarness(context, options)`;
- fresh app navigation;
- key simulation for ArrowUp/Down/Left/Right, Enter and Back/Escape mapping used by the application;
- viewport assertion;
- `assertNoUnexplainedConsoleErrors()`;
- localStorage snapshot;
- IndexedDB store snapshot for **non-secret structural assertions only**;
- screenshot attachment;
- evidence record creation.

## Step 1.7 — H0 smoke

Create `tools/rc-browser/specs/harness-smoke.spec.mjs`.

It must prove:

1. production build opens at `/babustv/` with a 1920×1080 CSS viewport;
2. clean browser storage + empty WidgetData reaches First Run;
3. `#first-run-page` is visible;
4. no page error occurs;
5. no synthetic secret is present in DOM/localStorage/IndexedDB/evidence output;
6. reload preserves harness availability without persisting WidgetData data into ordinary browser storage.

Run:

```bash
npm ci
npx playwright install chromium
npm run build
npm run rc:browser -- tools/rc-browser/specs/harness-smoke.spec.mjs
npm run typecheck
```

Then verify H0 scope:

```bash
git diff --check 409e416c88f0bd12666302fdaab533a626421a29...HEAD
git diff --name-only 409e416c88f0bd12666302fdaab533a626421a29...HEAD
```

No `player/src/**` path is permitted.

Commit H0 and record:

```bash
export RC_BROWSER_H0="$(git rev-parse HEAD)"
```

Push `verification/v1-rc-browser` and require its browser workflow to be GREEN before spawning workers.

---

# Task 2 — Freeze worker branches from the exact H0 SHA

Only after H0 GREEN, create all five branches from the exact same `$RC_BROWSER_H0`:

```text
verification/rc-browser-provider
verification/rc-browser-live
verification/rc-browser-play-nav
verification/rc-browser-state
verification/rc-browser-security-pairing
```

For every branch:

```bash
git switch --detach "$RC_BROWSER_H0"
git switch -c <branch>
test "$(git rev-parse HEAD)" = "$RC_BROWSER_H0"
```

Every worker reads the approved design and this plan READ-ONLY.

## Shared read-only files for all five workers

```text
package.json
package-lock.json
.gitignore
.github/workflows/rc-browser.yml
tools/rc-browser/playwright.config.mjs
tools/rc-browser/lib/**
tools/rc-browser/fixtures/common.mjs
tools/rc-browser/specs/harness-smoke.spec.mjs
player/src/**
```

A worker that needs a shared harness change reports `HARNESS INTEGRATION REQUIRED` to the controller. It does not edit a shared file itself.

---

# Task 3 — Parallel worker BROW-PROV: boot / onboarding / provider lifecycle

**ROLE:** `BROW-PROV`  
**Branch:** `verification/rc-browser-provider`  
**Base:** exact `$RC_BROWSER_H0`

## Owns exactly

```text
tools/rc-browser/specs/pack-a-provider.spec.mjs
tools/rc-browser/fixtures/pack-a-provider.mjs
```

## Required scenarios

Use IDs `A01`–`A12`:

- `A01` cold boot → First Run, default focus and no console error;
- `A02` Xtream required validation, password field remains masked;
- `A03` Xtream 401/timeout/malformed failures show sanitized fixed UI and preserve safe form input;
- `A04` Xtream synthetic success → provider registered, activated, Home reached, reload returns Home;
- `A05` M3U invalid URL and malformed playlist failure presentation;
- `A06` M3U synthetic success → provider registered/activated, reload persists provider/catalog;
- `A07` Provider Management opens with deterministic focus and configured providers;
- `A08` provider switch changes active provider but performs no implicit playback request;
- `A09` provider re-entry/edit never prefills stored secret values and success preserves providerId;
- `A10` provider delete confirmation: Back/cancel preserves state, confirm removes only target provider state;
- `A11` empty provider/catalog and failed refresh degrade safely;
- `A12` after provider lifecycle reload, browser console remains clean and no credential/source canary is visible in DOM/URL/browser storage.

Provider IDs should be discovered from structured state/DOM after onboarding; do not hardcode a production-generated ID unless the deterministic contract guarantees it.

Run:

```bash
npm run rc:browser -- tools/rc-browser/specs/pack-a-provider.spec.mjs
```

If a scenario fails because production behavior violates the approved requirement, preserve the failing spec and evidence and stop that scenario. Do not modify production.

Open a Draft PR targeting `verification/v1-rc-browser`. Do not mark Ready and do not merge.

---

# Task 4 — Parallel worker BROW-LIVE: Home / Live TV feature qualification

**ROLE:** `BROW-LIVE`  
**Branch:** `verification/rc-browser-live`  
**Base:** exact `$RC_BROWSER_H0`

## Owns exactly

```text
tools/rc-browser/specs/pack-b-live.spec.mjs
tools/rc-browser/fixtures/pack-b-live.mjs
```

## Required scenarios

Use IDs `B01`–`B11`:

- `B01` Home default focus: Last Watched when valid, otherwise `home-live-tv`;
- `B02` Live TV opens with category/channel overlay and stable focused channel;
- `B03` category/scope movement changes highlight/scope without playback;
- `B04` Favorite add/remove through actions and virtual Favorites scope;
- `B05` Favorites remain provider scoped when provider B has the same `channelId`;
- `B06` Turkish-safe Search for `İ/I/ı/i`, `Ş/ş`, `Ğ/ğ`, `Ü/ü`, `Ö/ö`, `Ç/ç` using synthetic channel names;
- `B07` search result highlight does not play; activation follows existing explicit intent contract;
- `B08` EPG current/next/program-info present path;
- `B09` missing/broken EPG leaves Live TV usable;
- `B10` channel actions layer exposes Play/Favorite/Program Info as applicable and Back closes only that layer;
- `B11` deleted/reordered channel/category fixture rerender keeps focus on a valid stable identity or deterministic fallback.

Mechanical DOM assertions must prefer existing stable attributes:

```text
.channel-item[data-channel-id]
.group-item[data-scope-key]
[data-feature-section="selected-epg"]
[data-feature-section="favorites"]
.live-tv-search-result[data-result-key]
.live-tv-action[data-action-id]
[data-feature-section="program-info"]
```

Run:

```bash
npm run rc:browser -- tools/rc-browser/specs/pack-b-live.spec.mjs
```

Open a Draft PR targeting the canonical qualification branch only.

---

# Task 5 — Parallel worker BROW-PLAYNAV: playback intent / Back / focus / reduced motion

**ROLE:** `BROW-PLAYNAV`  
**Branch:** `verification/rc-browser-play-nav`  
**Base:** exact `$RC_BROWSER_H0`

## Owns exactly

```text
tools/rc-browser/specs/pack-b-play-nav.spec.mjs
tools/rc-browser/fixtures/pack-b-play-nav.mjs
```

## Required scenarios

Use IDs `N01`–`N11`:

- `N01` channel/category highlight alone emits no stream-resolution/playback request;
- `N02` explicit Select triggers a single target playback intent and visible `RESOLVING`/`PREPARING` transition;
- `N03` failed target stream resolution produces sanitized failure and preserves required prior playback state when a prior successful browser-testable session exists;
- `N04` provider switch/navigation alone does not start/stop playback;
- `N05` Back closes feature layer before Live TV overlay;
- `N06` Back closes Live TV overlay before platform exit ownership;
- `N07` repeated actions/Back do not act on stale layer ownership;
- `N08` closing Search/Actions/Program Info restores focus to the correct stable owner;
- `N09` repeated overlay open/close leaves exactly one active overlay and no duplicate focus owner;
- `N10` empty list and single-item list keep valid bounded navigation;
- `N11` `prefers-reduced-motion: reduce` preserves reachability/focus/Back and removes or reduces presentation motion without changing semantics.

Do **not** claim successful media decoding if the synthetic stream cannot actually be decoded in Chromium. Browser-verifiable acceptance is intent/session transition and deterministic failure/rollback behavior; physical playback remains deferred.

If a true successful browser media session is required to prove `N03` and the existing player can consume a tiny synthetic local fixture without changing production, use a test-only route fixture. Otherwise classify only the successful-media-dependent sub-row `NOT-AVAILABLE` and keep the required failed-resolution path deterministic. Do not fake `PLAYING` by patching application internals.

Run:

```bash
npm run rc:browser -- tools/rc-browser/specs/pack-b-play-nav.spec.mjs
```

Open a Draft PR targeting the canonical qualification branch only.

---

# Task 6 — Parallel worker BROW-STATE: persistence / reload / provider isolation

**ROLE:** `BROW-STATE`  
**Branch:** `verification/rc-browser-state`  
**Base:** exact `$RC_BROWSER_H0`

## Owns exactly

```text
tools/rc-browser/specs/pack-c-state.spec.mjs
tools/rc-browser/fixtures/pack-c-state.mjs
```

## Required scenarios

Use IDs `C01`–`C11`:

- `C01` provider + active provider persist across page reload using IndexedDB + WidgetData stub;
- `C02` Favorite mutation persists across reload;
- `C03` provider A Favorite does not appear for provider B with the same `channelId`;
- `C04` Last Watched persists after a browser-testable successful watch start when the runtime can establish it; otherwise record that sub-row `NOT-AVAILABLE` without manufacturing state;
- `C05` provider-scoped watch state does not leak across colliding `channelId` values;
- `C06` provider switch survives reload;
- `C07` provider deletion removes target provider/catalog/Favorites/watch partition and preserves unrelated provider partition;
- `C08` stale/empty/error re-entry preserves usable cached state where current product semantics require it;
- `C09` inject synthetic legacy `en_settings` keys (`playlistUrl`, `playlists`, `activePlaylistIndex`, `channels`, `channelsFetched`) and reload; verify they are scrubbed while unrelated ordinary preferences survive;
- `C10` after modern M3U onboarding, ordinary localStorage contains no M3U source URL/token;
- `C11` corrupt structured record injection is limited to non-secret synthetic IndexedDB records and verifies graceful ignore/recovery through existing production readers.

For direct IndexedDB inspection/injection, use the existing database name `babustv`, version 2, and stores `providers`, `categories`, `channels`, `app_state`, `epg_programs`. Never inject a credential into IndexedDB.

Run:

```bash
npm run rc:browser -- tools/rc-browser/specs/pack-c-state.spec.mjs
```

Open a Draft PR targeting the canonical qualification branch only.

---

# Task 7 — Parallel worker BROW-SECPAIR: console/privacy/pairing browser qualification

**ROLE:** `BROW-SECPAIR`  
**Branch:** `verification/rc-browser-security-pairing`  
**Base:** exact `$RC_BROWSER_H0`

## Owns exactly

```text
tools/rc-browser/specs/pack-c-security-pairing.spec.mjs
tools/rc-browser/fixtures/pack-c-security-pairing.mjs
```

## Required scenarios

Use IDs `S01`–`S13`:

- `S01` normal boot/onboarding/Home/Live flows produce no unexplained `pageerror`, unhandled rejection, or raw provider/native error;
- `S02` DOM/text/data attributes contain none of the Xtream/M3U password/token canaries;
- `S03` localStorage/IndexedDB contain no credential or M3U source canary;
- `S04` application-visible URL and captured sanitized evidence contain no credential query/path or stream token;
- `S05` failed provider/stream requests present fixed/sanitized UI without exposing raw URL/error;
- `S06` TV pairing UI appears when synthetic `window.BABUSTV_PAIRING_CONFIG` is installed;
- `S07` QR/deep-link destination contains public bootstrap only in the URL fragment: `version`, `sessionId`, `expiresAtMs`, `tvPublicKey`, `relayBaseUrl`; query/user-info contain no bootstrap or credential fields;
- `S08` pairing phone route boots from the fragment and rejects missing/extra bootstrap keys before relay use;
- `S09` phone Xtream submit sends only `sessionId` + encrypted ciphertext envelope to relay; plaintext server URL/username/password are absent from relay body;
- `S10` phone M3U submit sends ciphertext only; plaintext playlist URL/token is absent from relay body;
- `S11` relay pending/completed/expired/consumed/unavailable UI remains sanitized where browser-testable;
- `S12` TV Back hides pairing and stops subsequent polling requests;
- `S13` WidgetData stub is the only credential persistence path; credential canary survives reload through stub memory but remains absent from ordinary browser storage.

Pairing relay routes must use HTTPS `.invalid` endpoints and deterministic synthetic session data. Do not log ciphertext if evidence does not need it; record only envelope shape/field names and byte/string length.

Run:

```bash
npm run rc:browser -- tools/rc-browser/specs/pack-c-security-pairing.spec.mjs
node tools/check-m7-security-privacy.mjs
```

Open a Draft PR targeting the canonical qualification branch only.

---

# Task 8 — Worker completion contract

Every parallel worker must, before handing off, run:

```bash
npm run rc:browser -- <owned spec path>
git diff --check "$RC_BROWSER_H0"...HEAD
git diff --name-only "$RC_BROWSER_H0"...HEAD
git status --short
```

Required changed-file set is exactly the worker's two owned files.

Each worker handoff/PR body must contain:

```text
ROLE
exact H0 base SHA
exact worker head SHA
owned files
scenario IDs
PASS / RED / NOT-AVAILABLE per row
console/pageerror summary
network/failure summary
reload/persistence summary where applicable
leakage result
artifact names
any deterministic production defect report
confirmation: zero player/src changes
confirmation: no real credentials/provider data
```

Workers do not mark Ready and do not merge themselves.

---

# Task 9 — Controller integration of the five worker lanes

After all five workers finish:

1. Re-verify each worker base is exactly `$RC_BROWSER_H0`.
2. Verify each diff contains exactly its two owned files.
3. Review every RED before integrating. A RED that proves a production defect keeps RC-BROWSER unaccepted, but the reproducer may still be integrated as evidence.
4. Merge/cherry-pick accepted verification commits into `verification/v1-rc-browser` in this order only to simplify audit:

```text
BROW-PROV
BROW-LIVE
BROW-PLAYNAV
BROW-STATE
BROW-SECPAIR
```

The order has no semantic dependency because files are non-overlapping.

5. Run the complete browser suite on the integrated qualification head:

```bash
npm run build
npm run rc:browser
```

6. If the suite exposes an interaction defect that individual packs missed, preserve it as a new controller-owned deterministic RED. Do not patch product code in the qualification branch.

---

# Task 10 — Deterministic defect routing

For every production defect, create a controller report with:

```text
exact production SHA
scenario ID
starting state
user action
expected state
observed state
exact failing command/spec
evidence artifact
console/network classification
root cause or narrowest proven boundary
implicated production files
minimum proposed fix scope
regression risk
recommended owner/lane
```

## Domain-local defect

Controller may create:

```text
rc-fix/<domain>
```

from the latest exact GREEN production main. The fix lane receives explicit production/test ownership and follows:

```text
reproduce -> RED -> root cause -> minimum fix -> GREEN -> affected browser smoke
```

## Shared/global defect

If implicated scope includes any of the following, report exactly `RC INTEGRATION FIX REQUIRED`:

```text
player/src/main.js
player/src/app/app-composition.ts
player/src/app/browser-app-dependencies.ts
player/src/live-tv/create-live-tv-runtime.ts
player/src/live-tv/live-tv-controller.ts
player/src/providers/create-browser-provider-runtime.ts
player/src/storage/contracts.ts
player/src/storage/indexeddb-structured-store.ts
cross-domain provider/playback/storage/navigation composition
```

Do not modify those paths in RC-BROWSER.

After any production fix merges:

1. require fresh push verification on the new exact `main` SHA;
2. record that pre-fix browser evidence is historical for affected scenarios;
3. retarget/rebuild the qualification branch from the new exact GREEN main as controller decides;
4. rerun the affected scenario pack;
5. rerun the full critical browser suite before final acceptance.

---

# Task 11 — Final RC-BROWSER evidence board

On the integrated qualification branch create:

```text
docs/verification/rc-browser-execution.md
```

This is the only scenario-output document owned by the final controller integration task.

It must include:

- exact production SHA under qualification;
- exact H0 SHA;
- exact integrated qualification head SHA;
- five worker branch/head SHAs;
- scenario matrix `A01–A12`, `B01–B11`, `N01–N11`, `C01–C11`, `S01–S13`;
- starting state/action/expected/observed/result summary per row;
- console/pageerror classification;
- network/failure classification;
- reload/persistence result where relevant;
- leakage result;
- artifact references;
- all deterministic defects and their resolution/requalification state;
- explicit physical Samsung/Tizen `NOT VERIFIED / DEFERRED` section.

No secret-bearing raw request URL or payload may be copied into this document.

---

# Task 12 — Final exact-head repository qualification

Run on the final integrated qualification branch while production remains the exact qualified `main` SHA:

```bash
npm ci
npx playwright install --with-deps chromium
npm run build
npm run rc:browser
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
node tools/check-m7-security-privacy.mjs
git diff --check 409e416c88f0bd12666302fdaab533a626421a29...HEAD
git diff --name-only 409e416c88f0bd12666302fdaab533a626421a29...HEAD
git status --porcelain
```

If production main changed through an approved RC fix, replace the comparison base above with the new exact qualified production SHA and record it explicitly; do not reuse `409e416c...` mechanically.

## Final allowed qualification diff

Only these paths are permitted:

```text
package.json
package-lock.json
.gitignore
.github/workflows/rc-browser.yml
tools/rc-browser/**
docs/verification/rc-browser-execution.md
```

This assertion must return no result:

```bash
git diff --name-only "$RC_BROWSER_PRODUCTION_BASE"...HEAD | grep '^player/src/'
```

A match is a controller blocker.

Working tree must be clean after all commands.

Open/update the RC-BROWSER Draft PR with exact base/head and exact-head CI evidence. Keep Draft until controller final audit.

---

# Task 13 — Controller acceptance rule

RC-BROWSER may be called `ACCEPTED` only if:

- every required browser-testable critical row is PASS, or an approved row is honestly `NOT-AVAILABLE` because the browser environment truly cannot exercise it;
- no deterministic production defect remains unresolved;
- no unexplained console/page error remains;
- no credential/source/stream/pairing plaintext leak is observed;
- reload/persistence checks are GREEN;
- five worker scopes are clean;
- integrated browser suite is GREEN;
- repository command gate is GREEN;
- static M7 security audit is GREEN;
- final qualification diff has zero `player/src/**` changes;
- working tree is clean;
- exact-head CI is GREEN.

If qualification-only work finds no production defect, the final production SHA must remain:

```text
409e416c88f0bd12666302fdaab533a626421a29
```

Then controller may move:

```text
RC-BROWSER — IN PROGRESS
→ RC-BROWSER — ACCEPTED
→ RC-BROWSER — CLOSED / GREEN
```

and only then advance to RC-PACKAGE.

Physical Samsung/Tizen, WidgetData-on-device, device keystore, physical remote, installed WGT runtime and physical TV+phone pairing remain `NOT VERIFIED / DEFERRED` until the later hardware stage.

---

# Agent dispatch table

After H0 is GREEN and `$RC_BROWSER_H0` is frozen, dispatch these five prompts concurrently:

```text
ROLE=BROW-PROV
Repo eyildirim82/babu-TV.
Branch verification/rc-browser-provider from exact RC_BROWSER_H0.
Read docs/superpowers/specs/2026-09-12-rc-browser-qualification-design.md and docs/superpowers/plans/2026-09-12-rc-browser-parallel-execution.md READ-ONLY.
Execute Task 3 only. Own only pack-a-provider spec/fixture. Production is read-only. Draft PR to verification/v1-rc-browser. No self-merge.
```

```text
ROLE=BROW-LIVE
Repo eyildirim82/babu-TV.
Branch verification/rc-browser-live from exact RC_BROWSER_H0.
Read the approved RC-BROWSER design/plan READ-ONLY.
Execute Task 4 only. Own only pack-b-live spec/fixture. Production is read-only. Draft PR to verification/v1-rc-browser. No self-merge.
```

```text
ROLE=BROW-PLAYNAV
Repo eyildirim82/babu-TV.
Branch verification/rc-browser-play-nav from exact RC_BROWSER_H0.
Read the approved RC-BROWSER design/plan READ-ONLY.
Execute Task 5 only. Own only pack-b-play-nav spec/fixture. Production is read-only. Draft PR to verification/v1-rc-browser. No self-merge.
```

```text
ROLE=BROW-STATE
Repo eyildirim82/babu-TV.
Branch verification/rc-browser-state from exact RC_BROWSER_H0.
Read the approved RC-BROWSER design/plan READ-ONLY.
Execute Task 6 only. Own only pack-c-state spec/fixture. Production is read-only. Draft PR to verification/v1-rc-browser. No self-merge.
```

```text
ROLE=BROW-SECPAIR
Repo eyildirim82/babu-TV.
Branch verification/rc-browser-security-pairing from exact RC_BROWSER_H0.
Read the approved RC-BROWSER design/plan READ-ONLY.
Execute Task 7 only. Own only pack-c-security-pairing spec/fixture. Production is read-only. Draft PR to verification/v1-rc-browser. No self-merge.
```

Controller remains the sole owner of H0 shared harness files, worker integration, defect routing, final evidence board and acceptance verdict.