# BabuşTV V1 Maximum Parallel Execution Design

**Date:** 2026-09-10  
**Status:** Approved design for parallel RC execution  
**Repository:** `eyildirim82/babu-TV`  
**Parent roadmap branch:** `docs/v1-rc-roadmap`  
**Parent roadmap head at design start:** `28bd0ee7c7cb89352a782d0669e6e56554186802`

## 1. Purpose

This design refactors the BabuşTV V1 RC roadmap into the smallest practical independently reviewable work packages so multiple development windows can progress in parallel without converging on the same high-conflict files.

The goal is not to maximize branch count for its own sake. The goal is to maximize useful concurrency while preserving:

- exact GREEN `main` baselines;
- bounded ownership;
- deterministic RED → GREEN evidence;
- provider/security/playback invariants;
- low-conflict merges;
- controller visibility;
- explicit integration gates.

A branch that cannot be understood, tested, and reviewed without reading another branch's unmerged internals is not sufficiently independent.

## 2. Design principles

### 2.1 Foundation first, then fan out

After the V1 RC documentation PR is merged and resulting `main` is GREEN, one short serial foundation package named **RC-F0** freezes the shared seams required by the parallel lanes.

RC-F0 must stay small. It may define or extend common contracts and persistence seams needed by multiple later packages, but it must not implement EPG ingestion, Favorites behavior, Search behavior, watch scoring, M3U onboarding, pairing behavior, Home, or user-facing UI.

After RC-F0 merges and `main` is GREEN, the first production wave branches from the same exact post-F0 `main` SHA.

### 2.2 Core logic before shared integration

Parallel workers should prefer new focused modules with injected dependencies and memory/test doubles.

They must not independently edit central composition, IndexedDB migration, or Live TV rendering files merely to make their feature runnable. Those shared files belong to explicit integration packages.

### 2.3 Shared hot zones have single-owner integration branches

The following paths are treated as high-conflict integration hot zones unless a bounded plan explicitly grants ownership:

- `player/src/main.js`
- `player/index.html`
- `player/src/live-tv/live-tv-controller.ts`
- `player/src/live-tv/dom-live-tv-view.ts`
- `player/src/live-tv/create-live-tv-runtime.ts`
- `player/src/providers/create-browser-provider-runtime.ts`
- `player/src/storage/contracts.ts`
- `player/src/storage/indexeddb-structured-store.ts`
- application-wide settings/navigation composition
- global runtime copy or shell presentation files

Core workers consume contracts exposed by these areas but do not casually modify them.

### 2.4 Integration is a feature package, not cleanup

Connecting independently-developed modules is explicit scoped work with its own RED/GREEN cycle, tests, CI evidence, and review. Integration branches must not become dumping grounds for unrelated fixes.

### 2.5 Parallelism stops at semantic dependency boundaries

Two branches may run concurrently only if one does not need the other's unmerged implementation semantics. File non-overlap alone is not enough.

For example:

- Xtream EPG parsing and XMLTV parsing may run concurrently once their input/output contracts are frozen;
- Home UI must not assume a watch-score contract that is still changing;
- pairing integration must wait for both pairing protocol and final onboarding transaction contracts;
- hardening begins after the relevant feature contract is frozen.

## 3. RC-F0 — shared contract and persistence foundation

Branch target:

`foundation/v1-rc-contracts`

Base:

The exact GREEN `main` produced after the RC roadmap documentation is merged.

RC-F0 responsibilities are limited to enabling independent implementation.

Allowed responsibilities:

- freeze provider-scoped durable user-state key conventions;
- freeze EPG source/query boundary contracts;
- define repository interfaces used by EPG/Favorites/watch state;
- define any structured-store schema names or migration seams required by later dedicated persistence integration;
- define provider capability seams needed to attach EPG without coupling EPG failure to channel/playback availability;
- supply memory/test-double seams needed by first-wave workers;
- add contract tests proving feature implementations can compile against the frozen boundaries.

RC-F0 must not:

- perform real IndexedDB feature-data migration unless the foundation cannot be made coherent without it;
- implement provider-specific EPG parsing;
- add Favorites behavior;
- add local Search behavior;
- add watch-state scoring;
- add M3U onboarding UI/transaction behavior;
- add pairing crypto/session behavior;
- change playback/session semantics;
- change Live TV presentation.

If a proposed F0 diff grows into implementation, split it instead of expanding F0.

## 4. First-wave parallel lanes

Once RC-F0 is merged and post-merge `main` is GREEN, the following branches may be created from the same exact SHA.

### 4.1 EPG-N — common EPG normalization

Branch:

`feature/epg-normalizer`

Owns:

- pure timestamp/timezone normalization;
- normalized EPG record shaping;
- malformed-record rejection rules;
- overlap/boundary normalization rules where specified;
- focused synthetic tests.

Does not own provider HTTP, XML parsing, IndexedDB, Live TV UI, or application composition.

### 4.2 EPG-X — Xtream EPG source/parser

Branch:

`feature/epg-xtream-adapter`

Owns:

- Xtream-specific EPG response decoding;
- provider error classification at the EPG source boundary;
- conversion into the frozen normalized EPG input contract;
- credential/log sanitization tests.

Does not own common normalization, repository persistence, or UI.

### 4.3 EPG-XML — XMLTV parser

Branch:

`feature/epg-xmltv-parser`

Owns:

- XMLTV parsing from synthetic inputs;
- XMLTV channel/program primitive extraction;
- time parsing and malformed XMLTV behavior before common normalization;
- large-input parser tests.

Does not own M3U channel reconciliation, persistence, or UI.

### 4.4 EPG-MAP — EPG/channel reconciliation

Branch:

`feature/epg-channel-mapper`

Owns:

- provider-scoped channel ↔ EPG matching rules;
- stable-ID/tvg-id/approved fallback matching order;
- ambiguity rejection;
- reconciliation tests for reorder, duplicates, missing IDs, and name fallback.

Does not own parsing, persistence, provider network access, or UI.

### 4.5 EPG-Q — EPG query engine

Branch:

`feature/epg-query-engine`

Owns pure or repository-interface-driven logic for:

- current program;
- next program;
- detail lookup;
- deterministic boundary behavior at exact start/end timestamps;
- bounded time-window queries.

Does not own provider ingestion or browser rendering.

### 4.6 FAV-D — Favorites domain/service

Branch:

`feature/favorites-domain`

Owns:

- stable provider-scoped favorite identity;
- FavoriteRepository interface consumption;
- add/remove/toggle/query service behavior;
- removed-channel/reconciliation semantics at the domain boundary;
- memory-backed tests.

Does not own IndexedDB schema or Live TV rendering.

### 4.7 SRCH-C — local Search core

Branch:

`feature/search-core`

Owns:

- Turkish-safe normalization;
- case-insensitive channel/category matching;
- optional exact/unambiguous number matching;
- result ranking rules approved by its bounded spec;
- large synthetic catalog benchmark/test harness.

This package should be pure and must not own application UI or playback intents.

### 4.8 M3U-V — M3U onboarding validation primitives

Branch:

`feature/m3u-entry-validation`

Owns:

- user-input normalization and validation for modern M3U entry;
- safe credential-bearing URL handling boundary;
- validation result/error contracts;
- failure-preserves-input domain behavior;
- synthetic tests.

Does not own final Provider Core transaction composition or UI.

### 4.9 WATCH-R — last-watched domain

Branch:

`feature/watch-state-domain`

Owns:

- provider-scoped last-watched record model;
- meaningful play/open event model;
- update/query behavior through injected repository interfaces;
- deletion/reconciliation semantics;
- deterministic tests.

Does not own scoring, IndexedDB, Home UI, or playback engine internals.

### 4.10 WATCH-S — frequently-watched scoring

Branch:

`feature/watch-score`

Owns a pure deterministic scoring/ranking function using approved inputs such as:

- meaningful watch duration;
- meaningful opens;
- recency;
- suppression of very short zaps.

No persistence or UI ownership.

### 4.11 PAIR-C — pairing crypto primitives

Branch:

`feature/pairing-crypto`

Owns:

- ephemeral key generation abstraction;
- encrypt-for-TV/decrypt-on-TV contract;
- authenticated ciphertext format;
- malformed/tampered payload rejection;
- no-secret-log tests.

No relay networking, session lifecycle, onboarding integration, or UI.

### 4.12 PAIR-S — pairing session state machine

Branch:

`feature/pairing-session`

Owns:

- random session identifier abstraction;
- expiry/TTL state;
- single-use consumption;
- replay rejection;
- deterministic injected clock/random seams;
- tests around default five-minute V1 TTL unless superseded by an approved pairing spec.

No crypto internals or HTTP relay implementation.

### 4.13 PAIR-R — pairing relay contract/client

Branch:

`feature/pairing-relay-contract`

Owns:

- ciphertext-only relay request/response contracts;
- polling/fetch client abstraction where needed;
- sanitized errors;
- public/self-host endpoint compatibility contract;
- tests that plaintext provider secrets are absent from relay payload structures.

No provider registration or UI.

### 4.14 PAIR-WEB — phone pairing UI shell

Branch:

`feature/pairing-phone-ui`

May begin in parallel only after the pairing payload interfaces are sufficiently frozen by RC-F0 or a dedicated pairing design.

Owns:

- phone-side provider input surface;
- local validation shell;
- handoff to injected encryption/relay interfaces;
- browser-only focus/accessibility/error behavior.

It must not invent independent cryptographic formats or backend semantics.

## 5. Second-wave persistence and provider integration

These packages start only after their required core dependencies merge.

### 5.1 EPG-P — EPG persistence

Branch:

`integration/epg-persistence`

Dependencies:

- RC-F0;
- EPG normalization/query contracts frozen.

Owns:

- actual structured persistence for EPG;
- IndexedDB schema/version migration required by EPG;
- provider-scoped indexes;
- bounded-window replacement/query behavior;
- migration tests and memory/IndexedDB parity tests.

This is one of the few packages allowed to own `player/src/storage/contracts.ts` and `player/src/storage/indexeddb-structured-store.ts` for its scoped migration.

### 5.2 USER-P — durable Favorites/watch-state persistence

Branch:

`integration/user-state-persistence`

Dependencies:

- FAV-D;
- WATCH-R;
- RC-F0.

Owns:

- durable provider-scoped Favorites state;
- last-watched/watch-event state persistence;
- migrations and cleanup rules;
- user-owned state preservation tests.

It must coordinate schema version ownership with EPG-P. Controller assigns ordering if both require the same IndexedDB version bump. They must never independently merge conflicting version numbers.

### 5.3 EPG-PI — provider EPG capability integration

Branch:

`integration/epg-provider-capability`

Dependencies:

- EPG-X;
- EPG-XML as applicable;
- EPG-N;
- EPG-MAP;
- EPG-P.

Owns:

- attachment of EPG capabilities to Provider Core/adapters;
- partitioned EPG refresh behavior;
- failure isolation from channel/catalog availability;
- background refresh and cache update orchestration.

It is the package allowed to modify shared provider runtime composition for EPG.

### 5.4 M3U-C — Provider Core onboarding transaction

Branch:

`integration/m3u-provider-core`

Dependencies:

- M3U-V;
- existing Provider Core registration/sync contracts.

Owns the modern transaction:

`validate → register → initial sync → validate cache → activate final commit`

Requirements:

- no activation before usable cache validation;
- rollback/cleanup on failed registration/sync;
- no credential-bearing URL leakage;
- existing Xtream onboarding remains unchanged.

### 5.5 WATCH-I — playback/watch-event integration

Branch:

`integration/watch-playback-events`

Dependencies:

- WATCH-R;
- WATCH-S;
- USER-P.

Owns translation of existing playback/session lifecycle events into meaningful watch-state events without changing playback/recovery ownership.

This package may observe playback state; it must not modify Shaka/AVPlay/recovery semantics.

## 6. Third-wave independently reviewable UI packages

UI workers receive domain/view-model inputs through injected interfaces and avoid central runtime composition until the composition packages.

### 6.1 EPG-UI

Branch:

`feature/epg-live-tv-ui`

Owns presentational/view-model support for:

- current program in channel context;
- selected channel current/next/detail;
- missing EPG degradation.

Must preserve highlight ≠ playback and existing focus semantics.

### 6.2 FAV-UI

Branch:

`feature/favorites-ui`

Owns:

- Favorite action presentation;
- virtual Favorites category/view-model behavior;
- empty Favorites state;
- remote-first focus behavior inside its bounded surface.

No persistence implementation.

### 6.3 SRCH-UI

Branch:

`feature/search-ui`

Owns:

- search input/results presentation;
- TV keyboard interaction boundary;
- result focus/restore behavior;
- no implicit playback on highlight.

### 6.4 ACT-UI

Branch:

`feature/channel-actions-ui`

Owns the minimal action surface:

- `İzle`;
- `Favoriye Ekle` / `Favorilerden Çıkar`;
- `Program Bilgisi` when available.

Tools/Menu may accelerate access but is never required.

### 6.5 M3U-UI

Branch:

`feature/m3u-onboarding-ui`

Depends on M3U-C contract.

Owns modern M3U entry UI only, using injected onboarding transaction callbacks. It must not reimplement Provider Core logic.

### 6.6 HOME-D

Branch:

`feature/home-domain`

May be developed before final Home composition once Favorites/watch/EPG read interfaces are frozen.

Owns:

- Home view model;
- Last Watched selection;
- Favorites row projection;
- Frequently Watched ordering projection;
- provider selector state projection;
- default focus decision rules.

No DOM composition or persistence implementation.

### 6.7 HOME-UI

Branch:

`feature/home-ui`

Depends on HOME-D contract.

Owns:

- Home rendering;
- TV-distance layout;
- remote-first focus movement;
- empty/loading/error states;
- reduced-motion behavior.

### 6.8 PROV-UI

Branch:

`feature/provider-management-ui`

Owns provider list/switch/add/delete presentation and confirmation surfaces through injected provider-management operations.

It must not directly manipulate CredentialStore or provider repositories.

### 6.9 FIRST-UI

Branch:

`feature/first-run-ui`

Owns branded first-run presentation and provider-type selection. It consumes existing Xtream and modern M3U entry callbacks rather than embedding onboarding logic.

## 7. Composition packages

Composition packages are deliberately few because they own hot-zone files.

### 7.1 M4-COMP — Live TV feature composition

Branch:

`integration/m4-live-tv-composition`

Dependencies:

- EPG provider/query/persistence integration;
- EPG-UI;
- FAV-D + USER-P + FAV-UI;
- SRCH-C + SRCH-UI;
- ACT-UI.

Owns scoped changes to shared Live TV controller/view/runtime composition.

Acceptance must prove:

- existing M3 highlight/playback invariant remains intact;
- focus restoration remains stable-ID based;
- EPG failure does not break Live TV;
- Favorites/Search/actions do not start playback unless explicit play intent occurs;
- Back owns one UI layer at a time.

### 7.2 M5-COMP — application/Home/provider composition

Branch:

`integration/m5-app-composition`

Dependencies:

- M3U-C + M3U-UI;
- WATCH-I;
- HOME-D + HOME-UI;
- PROV-UI;
- FIRST-UI;
- completed M4 contracts needed by Home.

Owns application-level runtime/navigation wiring including `main.js` as needed.

It must not change provider or playback semantics to simplify UI integration.

### 7.3 PAIR-I — pairing onboarding integration

Branch:

`integration/pairing-onboarding`

Dependencies:

- PAIR-C;
- PAIR-S;
- PAIR-R;
- phone/TV pairing UI contract;
- final Xtream/M3U onboarding transaction contracts;
- CredentialStore boundary.

Owns:

- TV session → QR → relay ciphertext → TV decrypt → existing onboarding transaction handoff;
- provider kind dispatch;
- sanitized failure behavior;
- single-use completion.

Pairing must not create a second provider persistence or credential-storage architecture.

## 8. Hardening lanes

Hardening is split by failure domain and may run in parallel after its dependencies are integrated.

### 8.1 PERF

Branch:

`hardening/catalog-epg-performance`

Owns deterministic performance characterization/fixes for:

- 1,000+ channels;
- many categories;
- large EPG;
- local Search;
- Home projections.

### 8.2 FAIL

Branch:

`hardening/provider-failures`

Owns synthetic failure matrix:

- 401/403/404/500;
- malformed provider responses;
- timeout/offline;
- stale cache + failed refresh;
- EPG failure isolation;
- token/session expiry where applicable.

### 8.3 MIG

Branch:

`hardening/storage-migrations`

Owns:

- schema upgrade paths;
- corrupted structured data handling;
- preservation of user-owned state;
- rebuildability of provider-owned cache;
- provider deletion cleanup.

### 8.4 NAV

Branch:

`hardening/focus-navigation`

Owns cross-feature remote navigation, Back/layer ownership, focus restoration, and reduced-motion regression tests.

### 8.5 PLAY

Branch:

`hardening/live-tv-regression`

Owns regression evidence around rapid zapping, stale intent rejection, rollback, channel disappearance, and new-feature interactions with existing playback/session behavior.

This package may fix only reproduced regressions introduced by V1 work; it must not redesign playback architecture.

### 8.6 SEC

Branch:

`hardening/security-privacy-audit`

Owns final credential/log/DOM/storage/artifact leakage scans and fixes with focused RED evidence.

## 9. Final verification lanes

### 9.1 RC-BROWSER

Branch:

`verification/v1-rc-browser`

Owns deterministic 1920×1080 browser release matrix, mechanical focus assertions, screenshots, synthetic provider fixtures, and evidence documentation.

No speculative production changes. Bugs discovered here are reproduced and routed to a new bounded fix branch.

### 9.2 RC-PACKAGE

Branch:

`verification/v1-rc-package`

Owns exact-head build/staging/package evidence:

- `npm test`;
- `npm run typecheck`;
- `npm run brand:check`;
- `npm run build`;
- `npm run tizen:build`;
- `npm run tizen:package` when available;
- staged identity/icon/privilege/path checks;
- clean-diff verification.

No false PASS when signing/Tizen environment is unavailable.

### 9.3 RC-CONTROLLER

Controller is not a production branch. It continuously maintains the canonical readiness/control documentation after merges and decides which dependency gates are open.

## 10. Dependency DAG

```text
RC docs merged
      ↓
RC-F0 contracts
      ↓ post-F0 exact GREEN main
      ├─ EPG-N ───────┐
      ├─ EPG-X ───────┤
      ├─ EPG-XML ─────┤
      ├─ EPG-MAP ─────┤→ EPG-P / EPG-PI → EPG-UI ─┐
      ├─ EPG-Q ───────┘                            │
      ├─ FAV-D ─────────────→ USER-P → FAV-UI ────┤
      ├─ SRCH-C ───────────────────→ SRCH-UI ─────┤→ M4-COMP
      ├─ M3U-V ─────────────→ M3U-C → M3U-UI ─────┐
      ├─ WATCH-R ─┐                                │
      ├─ WATCH-S ─┴→ USER-P → WATCH-I ─┐          │
      ├─ PAIR-C ─┐                     ├→ HOME-D → HOME-UI ─┐
      ├─ PAIR-S ─┼→ PAIR-I (later)     │                    │
      └─ PAIR-R ─┘                     └→ PROV-UI/FIRST-UI ├→ M5-COMP
                                                              │
M4-COMP ──────────────────────────────────────────────────────┘

M3U-C + onboarding contracts + PAIR core/UI → PAIR-I

M4-COMP + M5-COMP + PAIR-I (if V1) → PERF / FAIL / MIG / NAV / PLAY / SEC
                                            ↓
                              RC-BROWSER + RC-PACKAGE
                                            ↓
                              repository-complete RC
                                            ↓
                            physical-Tizen release gate
```

Controller may merge independent lanes in any order inside a wave, but no dependent branch may pretend an unmerged dependency is stable.

## 11. Maximum active concurrency

The design permits approximately 13–14 first-wave production branches after RC-F0.

That is an architectural upper bound, not a requirement to keep 14 windows busy at all times.

Recommended active concurrency is **8–12 workers** because controller review, CI capacity, rebase frequency, and contract-change coordination become dominant costs beyond that point.

When more than 12 candidate tasks are available, prefer keeping the remainder planned but not active until review capacity opens.

## 12. Branch/base policy

For every production branch:

1. controller records the exact allowed base SHA;
2. branch is created from that SHA or from an explicitly documented merged dependency head when stacked work is unavoidable;
3. a worker does not silently rebase onto another worker branch;
4. historical B0/M3G/Xtream branches are never bases;
5. after a dependency merges, downstream work rebases/retargets to the resulting exact GREEN `main` before final verification unless its approved plan explicitly uses a stacked base;
6. final PR evidence records merge-base and exact head.

## 13. File ownership rules

Every bounded worker plan must contain:

- `Owns:` exact files/directories it may create or modify;
- `Read-only dependencies:` files it may inspect but not edit;
- `Forbidden hot zones:` shared files it must not touch;
- `Produces:` exact public interfaces later branches consume;
- `Consumes:` exact interfaces already merged/frozen.

If implementation requires editing a forbidden hot-zone file, the worker stops that part and reports an integration requirement; it does not expand scope.

## 14. Contract-change protocol

After RC-F0, a first-wave worker may discover a missing shared contract.

It must not independently mutate the common contract if another active lane consumes it.

Instead:

1. document the missing seam and reproduction;
2. controller determines whether it is local or shared;
3. local change stays in the worker branch;
4. shared change receives a small contract amendment branch or an ordered dependency;
5. affected active branches rebase only after the amendment merges and `main` is GREEN.

This prevents silent interface divergence across parallel windows.

## 15. Worker completion gate

A worker may report its bounded package complete only when:

- scope matches the approved role;
- required characterization exists;
- behavior change has RED evidence where applicable;
- minimum implementation reaches focused GREEN;
- relevant full tests/typecheck/build are GREEN;
- secrets/log scan is clean for affected surfaces;
- changed files match ownership;
- exact head is recorded;
- CI is GREEN on exact head when required;
- Draft PR states dependencies and integration requirements;
- no physical-TV-only row is fabricated as PASS.

Workers do not Ready/merge their own PRs without controller/user authority.

## 16. Controller merge policy

Controller reviews in this order:

1. exact base and dependency correctness;
2. file ownership/scope drift;
3. public interface compatibility;
4. security/privacy invariants;
5. playback/focus/provider invariants where affected;
6. RED/GREEN and exact-head evidence;
7. CI;
8. downstream impact.

For independent first-wave branches, controller may merge whichever becomes GREEN first.

When two ready branches affect a shared integration seam indirectly, merge one, verify post-merge `main`, then rebase/reverify the other before merge.

## 17. Short role commands

After the relevant bounded role plan exists on an approved base, workers can be started with compact prompts such as:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=EPG-N.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=FAV-D.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=WATCH-S.
```

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=PAIR-C.
```

Controller must not activate a role until its bounded spec/plan or explicit bounded contract is available and the dependency gate is OPEN.

## 18. Initial role catalog

The canonical role identifiers are:

```text
RC-F0
EPG-N
EPG-X
EPG-XML
EPG-MAP
EPG-Q
FAV-D
SRCH-C
M3U-V
WATCH-R
WATCH-S
PAIR-C
PAIR-S
PAIR-R
PAIR-WEB
EPG-P
USER-P
EPG-PI
M3U-C
WATCH-I
EPG-UI
FAV-UI
SRCH-UI
ACT-UI
M3U-UI
HOME-D
HOME-UI
PROV-UI
FIRST-UI
M4-COMP
M5-COMP
PAIR-I
PERF
FAIL
MIG
NAV
PLAY
SEC
RC-BROWSER
RC-PACKAGE
CONTROLLER
```

Roles may be split further only when the new boundary has independent inputs/outputs, tests, file ownership, and review value. Roles must not be split merely to increase worker count.

## 19. Physical-TV boundary

This parallel model changes no physical-device acceptance policy.

Repository-complete RC work can proceed with unit, integration, synthetic browser, build, staging, emulator/RTL evidence where available.

The following remain external release qualification until directly observed on an applicable Samsung runtime:

- M2 WidgetData real-Tizen persistence probe;
- M3 real-Tizen UI/playback matrix;
- physical remote optional keys/CH±/numeric behavior;
- real Shaka/AVPlay fallback;
- lifecycle/suspend/resume/relaunch;
- repeated real-device zapping;
- long-playback/memory behavior;
- on-device network recovery;
- final install/release smoke.

Unavailable hardware evidence remains `PENDING`/`DEFERRED`, never PASS.

## 20. Success criteria

This execution architecture succeeds when:

- first-wave core work can run in roughly 8–12 active windows with minimal shared-file overlap;
- common storage/runtime hot zones are changed only by designated integration packages;
- worker PRs remain small enough for independent controller review;
- dependency changes are explicit rather than discovered during merge conflict resolution;
- integration packages compose already-tested modules rather than implementing missing feature cores;
- every merged wave returns `main` to exact GREEN before dependent work advances;
- the resulting repository reaches V1 RC without sacrificing security, playback stability, focus semantics, or evidence quality for concurrency.
