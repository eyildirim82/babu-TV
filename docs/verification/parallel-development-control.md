# BabuşTV Parallel Development Control

Date: 2026-09-10  
Owner: REVIEW / Integration Controller  
Status: V1 RC ACTIVE — RC-F0 CLOSED GREEN; WAVE 1 BASE FROZEN; ROLE PLANS PENDING; PHYSICAL-TIZEN RELEASE ACCEPTANCE DEFERRED

## Purpose

This is the canonical compact control/evidence board for `eyildirim82/babu-TV`. It records the current integration baseline, V1 RC work queue, maximum-parallel execution rules, dependency gates, and external runtime evidence debt that must not be mistaken for a repository implementation blocker.

Canonical sources:

- `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`
- `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`
- `docs/superpowers/specs/2026-09-08-m3-live-tv-core-design.md`
- `docs/superpowers/specs/2026-09-10-babustv-v1-rc-scope.md`
- `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`
- `docs/superpowers/plans/2026-09-08-m3-live-tv-core.md`
- `docs/superpowers/plans/2026-09-10-xtream-provider-entry.md`
- `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`
- `docs/superpowers/plans/2026-09-10-v1-rc-f0-shared-contracts.md`
- `docs/verification/v1-rc-readiness.md`
- `docs/verification/v1-parallel-execution.md`
- `docs/verification/b0-execution-status.md`
- `docs/verification/b0-brand-separation.md`
- `docs/verification/xtream-provider-entry.md`
- `docs/verification/m3-live-tv-runtime.md`

## Current integration baseline

| Field | Value |
| --- | --- |
| Repository | `eyildirim82/babu-TV` |
| Default branch | `main` |
| Roadmap starting main | `f3061cbad574b507b1f80cf23e19b8af179e90b0` |
| Starting main verify | `34414698392` SUCCESS |
| B0 implementation | B0A + B0B + B0C + B0D + B0E + B0F + B0G MERGED |
| Xtream entry | prerequisite #28 + XT-A #29 + XT-B #30 + XT-C #31 MERGED |
| RC-F0 worker | `8a216600b8244c58e7fabb8069f2320b906b21b4`; all plan-required gates GREEN |
| RC-F0 integration | PR #37 squash-merged to `main@aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` |
| Post-RC-F0 main verify | `34487321835` SUCCESS |
| Wave 1 common base | `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` |
| Open implementation blocker | individual Wave 1 bounded plans not yet approved |
| V1 RC implementation | RC-F0 CLOSED GREEN; Wave 1 planning next |
| Parallel execution design | APPROVED and integrated |
| M3 Tizen UI/runtime acceptance | DEFERRED external evidence |
| M2 WidgetData real-Tizen probe | PENDING external evidence |
| Merge authority | Controller / explicit user instruction |

New Wave 1 production work must branch from exact GREEN base `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`, not from historical B0/M3G/Xtream worker or evidence branches and not from later documentation-only commits unless controller records a new base.

## Closed foundation gates

### B0 — CLOSED GREEN

```text
B0A/B0B/B0C/B0F
       ↓
      B0D
       ↓
      B0E
       ↓
      B0G
       ↓
 B0 COMPLETE
```

Key final B0 checkpoint:

- B0G worker head `5327edee5c9e8ed479dc8102e6ebf90a62ece6fa`;
- exact-head evidence `34405457500` SUCCESS;
- B0G resulting main `40cb22b2816b2d32104799591c67f9e8a6bb7d64`;
- post-merge verify `34406702831` SUCCESS.

### Xtream provider entry — CLOSED GREEN

```text
Provider Core hardening #28
          ↓
       XT-A #29
          ↓
       XT-B #30
          ↓
       XT-C #31
          ↓
main@640e503ed53c45c4f838a385846f0d857cfa6e40
```

Key evidence:

- XT-C final production head `95a23139a206f923f1d8ee1badccaee6ff784231`;
- full finish evidence `34413640960`;
- exact-head command evidence `34413787643`;
- final 1920×1080 browser smoke `34414088818` SUCCESS;
- squash merge to `main@640e503ed53c45c4f838a385846f0d857cfa6e40`;
- post-merge verify `34414324515` SUCCESS.

Xtream blockers: none.

### RC-F0 shared contracts — CLOSED GREEN

```text
RC roadmap/docs + bounded plan
          ↓
foundation/v1-rc-contracts
          ↓
worker head 8a216600...
          ↓
PR #37 squash merge
          ↓
main@aac531b15bad85f6e7ae42c6ff1a6b71eed289d1
          ↓
verify 34487321835 SUCCESS
```

Key evidence:

- final worker head `8a216600b8244c58e7fabb8069f2320b906b21b4`;
- exact-head primary verify `34485061474` SUCCESS;
- auxiliary exact-head gate run `34486768193`: `brand:check` PASS, `tizen:build` PASS, clean diff PASS;
- exact five-file RC-F0 scope preserved;
- PR #37 squash-merged to `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`;
- post-merge push verify `34487321835` SUCCESS.

RC-F0 blockers: none.

## V1 RC maximum-parallel queue

The RC program is controlled by:

- `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md` for product sequencing;
- `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md` for architectural branch boundaries;
- `docs/verification/v1-parallel-execution.md` for live ROLE/dependency status;
- `docs/verification/v1-rc-readiness.md` for release readiness.

Execution shape:

```text
RC roadmap docs
      ↓
RC-F0 shared contract foundation — CLOSED GREEN
      ↓ exact GREEN post-F0 main
      ↓
13–14 independent first-wave core lanes
      ↓
persistence/provider integration lanes
      ↓
independent UI lanes
      ↓
M4 / M5 / Pairing composition
      ↓
parallel hardening domains
      ↓
RC-BROWSER + RC-PACKAGE
      ↓
repository-complete V1 RC
```

Recommended active concurrency is 8–12 workers. Architectural first-wave capacity is approximately 13–14 branches, but controller review/CI capacity is the limiting factor.

Physical-TV acceptance does not block these deterministic implementation waves. It does block final release acceptance.

## Immediate next gate

The common Wave 1 production base is frozen at `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` and its post-merge `main` verification `34487321835` is GREEN.

Next controller actions:

1. write and approve the bounded implementation plans for independent Wave 1 roles;
2. ensure every plan explicitly uses exact base `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` unless a controller exception is recorded;
3. mark only plan-backed roles `OPEN` in `docs/verification/v1-parallel-execution.md`;
4. start up to 8–12 non-overlapping workers concurrently;
5. keep `PAIR-WEB` blocked until its required pairing payload/session interfaces are frozen;
6. review each Draft PR independently and require post-merge GREEN before dependent waves advance.

Do not start the old monolithic `M4A` branch model. EPG core remains decomposed into `EPG-N`, `EPG-X`, `EPG-XML`, `EPG-MAP`, and `EPG-Q` plus later integration packages.

## First-wave role set

The exact common implementation base for these roles is `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.

```text
EPG-N      common EPG normalization
EPG-X      Xtream EPG adapter/parser
EPG-XML    XMLTV parser
EPG-MAP    EPG/channel reconciliation
EPG-Q      current/next/detail query core
FAV-D      Favorites domain/service
SRCH-C     Turkish-safe Search core
M3U-V      M3U onboarding validation primitives
WATCH-R    last-watched/watch-event domain
WATCH-S    frequently-watched scoring
PAIR-C     pairing crypto primitives
PAIR-S     pairing session TTL/single-use/replay
PAIR-R     ciphertext-only relay contract
PAIR-WEB   phone pairing UI after payload interfaces are frozen
```

Detailed branch names, dependencies, output contracts, and live status are canonical in `docs/verification/v1-parallel-execution.md`.

## Hot-zone policy

Core workers do not casually modify shared composition/migration files. Integration-owned hot zones include by default:

```text
player/src/main.js
player/index.html
player/src/live-tv/live-tv-controller.ts
player/src/live-tv/dom-live-tv-view.ts
player/src/live-tv/create-live-tv-runtime.ts
player/src/providers/create-browser-provider-runtime.ts
player/src/storage/contracts.ts
player/src/storage/indexeddb-structured-store.ts
application-wide settings/navigation composition
global runtime copy/shell presentation
```

Every bounded worker plan must explicitly declare:

```text
Owns
Read-only dependencies
Forbidden hot zones
Consumes
Produces
Exact base SHA
RED/GREEN commands
Full verification commands
Draft PR evidence requirements
```

If a worker discovers that a forbidden hot-zone change is required, it reports an integration requirement instead of expanding scope.

## Parallel development rules for the RC program

Parallelism is allowed only when both file ownership and semantic dependencies are non-overlapping.

Controller must reject parallel work when:

- two branches both change shared provider/repository contracts without an agreed base order;
- two branches both claim IndexedDB schema-version ownership;
- two branches own the same focus/navigation composition surface;
- a UI branch embeds feature-core behavior merely to avoid waiting for a dependency;
- Home work assumes watch-state/Favorites/Search interfaces that are not frozen;
- M3U onboarding bypasses Provider Core;
- M6 pairing invents a second credential persistence path instead of using `CredentialStore`;
- hardening branches mix unrelated feature development with regression fixes;
- a branch silently rebases onto another active worker branch without controller-recorded dependency.

Integration is its own reviewed work. Central composition branches should mostly wire already-tested modules and must not become catch-all implementation branches.

## Dependency shape

```text
RC-F0
  ↓
EPG-N/X/XML/MAP/Q ─→ EPG persistence/provider integration ─→ EPG-UI ─┐
FAV-D ─────────────→ user-state persistence ────────────────→ FAV-UI ├→ M4-COMP
SRCH-C ─────────────────────────────────────────────────────→ SRCH-UI ┤
                                                                ACT-UI ┘

M3U-V → M3U Provider Core integration → M3U-UI ────────────────┐
WATCH-R + WATCH-S → user persistence → playback event integration ─┤
Favorites/watch/provider read contracts → HOME-D → HOME-UI ───────┤→ M5-COMP
provider operations → PROV-UI ─────────────────────────────────────┤
Xtream + M3U callbacks → FIRST-UI ─────────────────────────────────┘

PAIR-C + PAIR-S + PAIR-R + PAIR-WEB + onboarding contracts → PAIR-I

M4-COMP + M5-COMP + PAIR-I(if V1) → PERF / FAIL / MIG / NAV / PLAY / SEC
                                           ↓
                               RC-BROWSER + RC-PACKAGE
```

## Short worker commands

Use short role prompts only after controller marks the relevant role OPEN and its bounded plan exists.

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=CONTROLLER.
```

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

Do not invent or activate a ROLE whose scoped contract/plan has not been approved.

## M3G runtime evidence — archived repository track / external acceptance deferred

Historical evidence branch: `docs/m3-live-tv-verification`, latest recorded head `f9c204baaafe80513358feb8d1d04f24b68ecaeb`.

The investigation achieved real Samsung retail-TV package/install/launch and on-device product-identity evidence. It also booted/attached a Samsung TV emulator, but emulator install remained blocked by certificate-chain trust. The 13-item M3 UI/playback smoke matrix was not directly observed because the retail remote-control channel was not paired and no human/screen observation path was available.

Controller rules:

- do not call the 13 runtime rows PASS from automated tests, packaging, install, or launch alone;
- M2 WidgetData real-Tizen probe remains PENDING;
- runtime UI/playback matrix remains DEFERRED until a paired physical TV, RTL, or applicable emulator path exists;
- future runtime defects use a new scoped branch and reproduce → root cause → RED → minimum fix → GREEN → affected runtime smoke;
- old Draft PR #22 is historical evidence, not a current integration base.

## Physical-Tizen release debt

Physical TV is currently unavailable. Therefore the following are external release-qualification debt, not open repository implementation blockers:

- M2 WidgetData real-Tizen credential-store probe;
- M3 Live TV 13-row runtime matrix;
- real CH± / numeric / optional remote keys;
- real Shaka/AVPlay fallback behavior;
- lifecycle/suspend/resume/relaunch;
- Back/exit conventions;
- repeated zap and long-playback stability;
- on-device network loss/recovery;
- real relaunch persistence;
- supported-model/Tizen-floor acceptance;
- final WGT install/release smoke.

An RC candidate may exist while these are explicitly `PENDING`/`DEFERRED`. Final `BabuşTV 1.0.0` release acceptance requires them to be satisfied.

## Controller duties

1. refresh live GitHub state before every merge decision;
2. enforce exact GREEN `main` as the base for new production waves;
3. maintain the ROLE/dependency state in `v1-parallel-execution.md`;
4. require bounded plan approval before activating a production role;
5. enforce file ownership and hot-zone restrictions;
6. review latest head, changed files, CI, security boundaries, and evidence;
7. reject scope drift even when CI is GREEN;
8. keep highlight/playback, provider, credential, and focus invariants intact across new features;
9. treat screenshots/manual evidence as first-class where required;
10. keep unavailable physical-runtime acceptance separate from code completion;
11. update `v1-rc-readiness.md`, `v1-parallel-execution.md`, and this board after integrations;
12. require post-merge `main` GREEN before dependent work starts.

## Historical evidence checkpoints

- First B0-wave base: `0af80caf24eab206f303f67c177a5d716fb38a6d`.
- B0D merge result: `ceb994b94f93c8939bad6f72e7fda354c5ad9cf9`; post-merge `34397292047` SUCCESS.
- B0E merge result: `43020e6fab513a018bd789183b2a9b9afd07fba0`; post-merge `34403420282` SUCCESS.
- B0G merge result: `40cb22b2816b2d32104799591c67f9e8a6bb7d64`; post-merge `34406702831` SUCCESS.
- XT-A final worker head: `17b1ff14aaae3b7c9d588af562a9c7614736e751`.
- XT-B final worker head: `08971c6d9219aa8a43833b82a75f567818807b47`.
- XT-C final worker head: `95a23139a206f923f1d8ee1badccaee6ff784231`.
- XT-C final browser smoke: `34414088818` SUCCESS.
- XT-C resulting main: `640e503ed53c45c4f838a385846f0d857cfa6e40`; post-merge `34414324515` SUCCESS.
- Docs closeout resulting main: `f3061cbad574b507b1f80cf23e19b8af179e90b0`; post-merge verify `34414698392` SUCCESS.
- RC-F0 final worker head: `8a216600b8244c58e7fabb8069f2320b906b21b4`; primary verify `34485061474` SUCCESS; auxiliary exact-head gates `34486768193` SUCCESS.
- RC-F0 resulting main / Wave 1 common implementation base: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`; post-merge verify `34487321835` SUCCESS.

These SHAs are historical evidence checkpoints except the explicitly frozen current Wave 1 base `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
