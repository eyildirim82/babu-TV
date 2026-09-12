# BabuşTV RC-BROWSER Qualification Design

**Date:** 2026-09-12  
**Status:** Draft written design for controller review  
**Repository:** `eyildirim82/babu-TV`  
**Frozen RC-BROWSER production base:** `409e416c88f0bd12666302fdaab533a626421a29`  
**Post-M7 main verification:** `34707993412` SUCCESS  
**Production changes in this docs lane:** none

## 1. Purpose

RC-BROWSER is the repository-complete browser qualification phase after M7 hardening and before RC-PACKAGE.

Its job is to qualify the exact integrated production application in a deterministic browser environment across end-to-end user-visible flows, reload/persistence boundaries, browser console/network safety, and release-critical error states.

RC-BROWSER is a qualification/controller phase. It is not a general refactor wave and does not own production fixes by default.

The frozen production base is:

```text
409e416c88f0bd12666302fdaab533a626421a29
```

If `main` legitimately advances through a controller-approved RC fix, all affected RC-BROWSER evidence becomes historical and qualification resumes against the new exact GREEN `main` SHA.

## 2. Upstream truth

The controller must verify before qualification begins and before every merge decision:

- `main` exact SHA;
- exact-head push verification status;
- no stale production/evidence branch has become the current base;
- historical M7 RED PR #91 remains unmerged evidence only;
- physical Samsung/Tizen evidence remains explicitly `NOT VERIFIED`, `PENDING`, or `DEFERRED` until the later hardware stage.

At this design freeze:

- `main` = `409e416c88f0bd12666302fdaab533a626421a29`;
- post-M7 push run `34707993412` = SUCCESS on that exact SHA;
- PR #96 is merged/closed;
- PR #91 remains unmerged historical RED evidence;
- M7 production sequence is closed GREEN.

## 3. Release sequence

RC-BROWSER preserves the approved sequence:

```text
M7 CLOSED / GREEN
      ↓
RC-BROWSER
      ↓
RC-PACKAGE
      ↓
RC version decision
      ↓
Stage A 1.0.0-rc.1
      ↓
physical Samsung/Tizen qualification
      ↓
Stage B final 1.0.0
```

RC-BROWSER must not skip or absorb RC-PACKAGE.

Browser evidence must never be relabeled as physical-device evidence.

## 4. Branch and lane model

### 4.1 Docs/controller freeze lane

Branch:

```text
docs/rc-browser-execution
```

Base:

```text
409e416c88f0bd12666302fdaab533a626421a29
```

Ownership:

- this RC-BROWSER design;
- bounded execution plan;
- qualification/evidence board;
- controller-only current-state overlays where explicitly required.

This lane is docs-only. It must not modify production, tests, fixtures, workflows, package files, or generated artifacts.

### 4.2 Qualification lane

Canonical branch:

```text
verification/v1-rc-browser
```

The qualification branch starts from the exact current GREEN production base after the docs/controller freeze is approved.

Default ownership is limited to browser qualification assets such as:

- deterministic browser test harness files;
- browser-only synthetic fixtures/canaries;
- release-matrix assertions;
- screenshot/evidence generation;
- console/network/request capture helpers;
- qualification documentation/evidence.

Production `player/src/**` files are not owned by RC-BROWSER.

A passing scenario that requires no production change is recorded as evidence. RC-BROWSER must not manufacture RED or production churn merely to create a change.

## 5. Production ownership and forbidden surfaces

RC-BROWSER is read-only with respect to all production behavior unless a deterministic defect is routed to a separately approved fix lane.

The following shared/global surfaces are explicitly forbidden in the qualification lane:

```text
player/src/main.js
player/src/app/app-composition.ts
player/src/app/browser-app-dependencies.ts
player/src/live-tv/create-live-tv-runtime.ts
player/src/live-tv/live-tv-controller.ts
player/src/providers/create-browser-provider-runtime.ts
player/src/storage/contracts.ts
player/src/storage/indexeddb-structured-store.ts
application-wide navigation/composition surfaces
shared provider transaction semantics
shared playback/session semantics
shared storage schema/migration semantics
```

RC-BROWSER also does not own ordinary domain fixes merely because it reproduces them.

If a deterministic browser RED requires a production change, the controller classifies it before any patch is attempted.

## 6. Defect routing

Every deterministic browser defect follows:

```text
reproduce
→ deterministic RED evidence
→ root cause
→ exact implicated production files / ownership
→ minimum proposed scope
→ controller routing
```

### 6.1 Domain-local defect

If the root cause is clearly confined to a stable domain-owned surface and does not cross a shared/global composition boundary, controller may open a bounded RC fix lane such as:

```text
rc-fix/<domain>
```

The fix lane must receive:

- exact GREEN base;
- exact owned production/test paths;
- forbidden hot zones;
- deterministic RED command/evidence;
- minimum GREEN acceptance;
- full regression gates;
- Draft PR discipline.

RC-BROWSER does not patch the production defect itself.

### 6.2 Shared/global integration defect

If the fix requires a shared/global composition surface, cross-domain contract change, or another forbidden hot zone, RC-BROWSER stops the affected acceptance path and reports exactly:

```text
RC INTEGRATION FIX REQUIRED
```

The report must include:

- exact production SHA;
- starting state;
- user action;
- expected state;
- observed state;
- deterministic browser/test evidence;
- console/network evidence where relevant;
- root cause or minimum proven implicated boundary;
- exact implicated files;
- minimum proposed scope;
- regression risk;
- recommended owner/lane.

Only the controller may open the corresponding RC-I fix lane.

## 7. Qualification environment

Primary deterministic browser qualification target:

```text
1920 × 1080 CSS viewport
```

Required environment principles:

- production-equivalent browser build/served application;
- deterministic synthetic provider/catalog/EPG inputs;
- no real provider credentials;
- `.invalid` endpoints/canaries for synthetic network/error paths unless real connectivity is genuinely required;
- browser console capture;
- request/failure capture where relevant;
- deterministic focus/state assertions paired with screenshots where visual evidence is useful;
- reduced-motion qualification with `prefers-reduced-motion: reduce`;
- explicit reload/re-entry boundaries.

Screenshots, logs, URLs, fixture payloads, CI artifacts, and PR text must never contain real provider credentials, credential-bearing provider URLs, transient stream tokens, or decrypted pairing payloads.

If a scenario cannot be qualified without an actual provider credential, stop that scenario and request controller-approved credential handling. Do not invent or embed credentials.

## 8. Scenario packs

The matrix is organized into three logical packs. They may execute independently where state isolation permits, but acceptance applies to one exact integrated production SHA.

### Pack A — boot / onboarding / provider lifecycle

Required browser-testable coverage:

- cold application boot;
- First Run;
- Xtream onboarding success/failure presentation;
- M3U onboarding success/failure presentation;
- Provider Management open/close/focus;
- provider switching;
- provider re-entry/edit;
- provider deletion and confirmation;
- empty provider/catalog state;
- malformed/provider failure presentation where browser-testable;
- pairing TV UI;
- pairing phone route where browser-testable;
- provider re-entry after reload;
- no credential/source leakage through UI, URL, console, storage, or artifacts.

### Pack B — Home / Live TV / user interaction

Required browser-testable coverage:

- Home and default focus;
- Live TV entry;
- category/scope navigation;
- Favorites scope;
- Search;
- EPG current/next/program information presentation;
- explicit playback intent transition;
- failed stream resolution preserving required prior state;
- provider switching with playback/navigation invariants;
- Back handling;
- focus restoration after closing layers;
- repeated overlay open/close;
- repeated Back;
- empty list;
- single item;
- deleted/reordered item behavior where synthesizable;
- same `channelId` in two providers;
- reduced-motion behavior.

Highlight/navigation must remain distinct from playback intent.

### Pack C — persistence / isolation / safety

Required browser-testable coverage:

- reload/restart boundary after onboarding;
- durable Favorites state;
- durable watch/Last Watched state;
- provider-scoped state isolation;
- same `channelId` across two providers remains isolated;
- stale/empty/error state re-entry;
- cache/failure presentation where browser-testable;
- corrupt or malformed browser-held structured state only where existing testable browser seams safely support injection;
- no legacy M3U source persistence regression;
- browser console safety;
- credential/URL leakage checks;
- transient stream URL/token leakage checks;
- pairing public-bootstrap-only exposure checks;
- reload after state mutation and verification of the persisted result.

No browser harness may bypass security boundaries by injecting secrets into ordinary storage merely to simplify a test.

## 9. Per-scenario evidence record

Every critical scenario records at minimum:

```text
scenario id/name
exact production SHA
starting state
user action(s)
expected state
observed state
PASS / deterministic RED / NOT-AVAILABLE
console errors/warnings relevant to the scenario
network/request failure evidence where relevant
persistence/reload result where relevant
screenshot/artifact reference where useful
sanitization/leakage result where relevant
```

An unexplained browser console error is a qualification failure until classified.

Expected synthetic network failures used by a scenario are not console failures merely because the network request intentionally failed; the application must present the failure safely and without uncontrolled exception leakage.

## 10. Reload and state-isolation discipline

The release matrix must not be one uninterrupted happy-path session.

At minimum it must include controlled reload/re-entry boundaries after:

- initial provider onboarding;
- Favorite mutation;
- meaningful watch-state mutation;
- provider switch;
- provider re-entry/edit where applicable;
- provider delete;
- relevant stale/error/cache state.

State checks must use provider-scoped identities, not list positions.

The same `channelId` in provider A and provider B must be exercised as distinct state identities.

## 11. Browser console / request safety

The harness must capture and classify browser errors during each scenario.

Release-blocking examples include:

- unhandled promise rejection;
- uncaught exception;
- production invariant violation;
- raw provider/native error leakage;
- credential-bearing URL leakage;
- transient stream URL/token leakage;
- decrypted pairing payload leakage;
- unexpected storage/security exception surfaced to the user or console.

Expected, sanitized application-level failure results are acceptable when the scenario explicitly exercises them and no secret/raw-provider detail leaks.

## 12. Browser qualification acceptance

RC-BROWSER cannot be accepted until all required browser-testable critical scenarios are either:

- PASS on one exact final production SHA; or
- honestly classified `NOT-AVAILABLE` only when the required environment is genuinely unavailable and the approved RC scope permits that classification.

A deterministic production defect is never `NOT-AVAILABLE`.

Any deterministic unresolved defect keeps RC-BROWSER unaccepted.

## 13. Repository command gate

On the final exact production SHA accepted by RC-BROWSER, require:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
node tools/check-m7-security-privacy.mjs   # where present/applicable
git diff --check
```

Also require:

- exact changed-file assertion for the qualification branch;
- no unauthorized production files in the qualification diff;
- clean working tree after verification;
- exact-head CI evidence.

`npm run tizen:package` belongs to RC-PACKAGE and is not silently absorbed into RC-BROWSER.

## 14. Qualification-only success path

If every required browser scenario is GREEN without a production defect:

- final production SHA remains exactly the frozen base;
- qualification branch contains only approved verification/evidence scope;
- no production commit is created;
- RC-BROWSER may advance from `IN PROGRESS` to `ACCEPTED` and then `CLOSED / GREEN` only after controller audit of the final matrix and exact-head evidence.

For the initial frozen base, the expected no-defect final production SHA is:

```text
409e416c88f0bd12666302fdaab533a626421a29
```

## 15. Requalification after an RC fix

If an RC fix is merged:

1. require fresh push-triggered verification on the resulting exact `main` SHA;
2. make all prior browser evidence that depends on changed behavior historical;
3. retarget/recreate the qualification branch from the new exact GREEN `main` as controller decides;
4. rerun the affected deterministic matrix;
5. rerun the full critical release smoke before final acceptance;
6. record the new exact final production SHA.

Stale run IDs or pre-fix browser artifacts must never be cited as current final evidence.

## 16. Physical Samsung/Tizen boundary

RC-BROWSER does not qualify:

- physical Samsung TV runtime behavior;
- real Tizen WidgetData behavior;
- device-keystore behavior;
- physical remote behavior;
- installed widget/package runtime on physical hardware;
- physical TV + phone pairing runtime.

Those remain explicitly deferred until the approved physical qualification stage.

Browser/build evidence may support Stage A repository-complete RC readiness but cannot establish final `1.0.0` physical release acceptance.

## 17. Controller verdict vocabulary

RC-BROWSER uses only:

```text
RC-BROWSER — IN PROGRESS
RC-BROWSER — BLOCKED
RC INTEGRATION FIX REQUIRED
RC-BROWSER — ACCEPTED
RC-BROWSER — CLOSED / GREEN
```

No acceptance is allowed while a deterministic browser defect remains unresolved.

## 18. Design invariants

The qualification phase preserves all existing product invariants, including:

- remote-first basic navigation;
- highlight is not playback;
- explicit play intent owns playback changes;
- last-intent-wins and bounded recovery remain owned by playback/session boundaries;
- provider/network/EPG failures do not destroy usable cache or durable user state;
- provider-scoped stable IDs own Favorites/watch state;
- no plaintext credential fallback;
- no legacy M3U ordinary-source persistence regression;
- pairing relay/public bootstrap boundaries remain privacy-safe;
- no broad architecture redesign during qualification;
- production changes require deterministic RED evidence and controller-routed ownership.

## 19. Next document

After this written design is approved, create a bounded RC-BROWSER execution plan that defines:

- exact qualification branch base;
- exact harness/evidence ownership paths;
- scenario IDs and execution order;
- deterministic setup/fixture strategy;
- browser automation commands;
- RED/defect-routing procedure;
- final repository gate commands;
- Draft PR/evidence requirements;
- acceptance checklist.

Only after that plan is approved may `verification/v1-rc-browser` begin qualification execution.
