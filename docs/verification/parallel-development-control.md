# BabuşTV Parallel Development Control

Date: 2026-09-10  
Owner: REVIEW / Integration Controller  
Status: V1 RC MAX-PARALLEL DESIGN APPROVED — RC-F0 PLAN DRAFTED; PRODUCTION NOT STARTED; PHYSICAL-TIZEN RELEASE ACCEPTANCE DEFERRED

## Purpose

This is the canonical compact control/evidence board for `eyildirim82/babu-TV`. It records the current integration baseline, the V1 RC work queue, dependency/parallelism rules, and external runtime evidence debt that must not be mistaken for a repository implementation blocker.

Canonical sources:

- `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`
- `docs/superpowers/specs/2026-09-10-babustv-v1-rc-scope.md`
- `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`
- `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`
- `docs/superpowers/plans/2026-09-10-v1-rc-f0-shared-contracts.md`
- `docs/verification/v1-parallel-execution.md`
- `docs/verification/v1-rc-readiness.md`
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
| Open implementation blocker | NONE at roadmap creation |
| V1 RC implementation | PLANNED; not started |
| Maximum-parallel execution | DESIGN APPROVED |
| RC-F0 | PLAN-DRAFTED; no production branch open |
| M3 Tizen UI/runtime acceptance | DEFERRED external evidence |
| M2 WidgetData real-Tizen probe | PENDING external evidence |
| Merge authority | Controller / explicit user instruction |

New production work must branch from the then-current exact GREEN `main`, not from historical B0/M3G/Xtream worker or evidence branches.

## Closed foundation gates

### B0 — CLOSED GREEN

Key final B0 checkpoint:

- B0G worker head `5327edee5c9e8ed479dc8102e6ebf90a62ece6fa`;
- exact-head evidence `34405457500` SUCCESS;
- B0G resulting main `40cb22b2816b2d32104799591c67f9e8a6bb7d64`;
- post-merge verify `34406702831` SUCCESS.

### Xtream provider entry — CLOSED GREEN

Key evidence:

- XT-C final production head `95a23139a206f923f1d8ee1badccaee6ff784231`;
- full finish evidence `34413640960`;
- exact-head command evidence `34413787643`;
- final 1920×1080 browser smoke `34414088818` SUCCESS;
- squash merge to `main@640e503ed53c45c4f838a385846f0d857cfa6e40`;
- post-merge verify `34414324515` SUCCESS.

Xtream blockers: none.

## V1 RC maximum-parallel execution

The authoritative role/dependency board is `docs/verification/v1-parallel-execution.md`.

Execution shape:

```text
RC docs
  ↓
RC-F0 shared contracts (serial)
  ↓ exact GREEN post-F0 main
  ↓
Wave 1 independent core lanes
  ↓
Persistence/provider integration
  ↓
Independent UI lanes
  ↓
M4/M5/Pairing composition
  ↓
Parallel hardening
  ↓
RC browser/package verification
```

Recommended active concurrency is 8–12 workers. Approximately 13 core lanes are available after RC-F0; `PAIR-WEB` remains blocked until its payload/interface design is frozen.

## Immediate next gate

No production role is OPEN from the docs branches.

Required order:

1. controller integrates the approved RC roadmap/parallel-execution docs;
2. resulting `main` verify must be exact GREEN;
3. RC-F0 plan receives execution approval;
4. create `foundation/v1-rc-contracts` from that exact GREEN `main`;
5. implement only the five planned contract/test-support files via RED → GREEN;
6. exact-head CI + scope review + explicit merge authority;
7. verify post-F0 `main` GREEN;
8. record the exact post-F0 SHA/run as `FIRST_WAVE_BASE`;
9. open approved first-wave roles from the same exact base.

RC-F0 must not bump IndexedDB schema/version, modify runtime composition, add feature behavior, or touch playback/provider/credential semantics.

## Hot-zone controller rule

Integration-owned by default:

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

Core workers must not edit these paths unless their approved bounded plan explicitly grants ownership. Missing hot-zone changes are reported as integration requirements, not implemented opportunistically.

## First-wave role identifiers

After post-F0 GREEN, controller may open approved roles such as:

```text
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
```

Short prompt:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=<ROLE>.
```

No ROLE becomes OPEN merely because its name exists. Its bounded plan/spec must also be approved and its exact base must be recorded.

## M3G runtime evidence — external acceptance deferred

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
3. require bounded plan approval before implementation;
4. enforce role ownership and hot-zone restrictions;
5. review latest head, changed files, CI, security boundaries, and evidence;
6. reject scope drift even when CI is GREEN;
7. keep highlight/playback, provider, credential, and focus invariants intact across new features;
8. treat screenshots/manual evidence as first-class where required;
9. keep unavailable physical-runtime acceptance separate from code completion;
10. update `v1-parallel-execution.md`, `v1-rc-readiness.md`, and this board after integrations;
11. require post-merge `main` GREEN before dependent work starts.

## Historical evidence checkpoints

- First-wave base: `0af80caf24eab206f303f67c177a5d716fb38a6d`.
- B0D merge result: `ceb994b94f93c8939bad6f72e7fda354c5ad9cf9`; post-merge `34397292047` SUCCESS.
- B0E merge result: `43020e6fab513a018bd789183b2a9b9afd07fba0`; post-merge `34403420282` SUCCESS.
- B0G merge result: `40cb22b2816b2d32104799591c67f9e8a6bb7d64`; post-merge `34406702831` SUCCESS.
- XT-A final worker head: `17b1ff14aaae3b7c9d588af562a9c7614736e751`.
- XT-B final worker head: `08971c6d9219aa8a43833b82a75f567818807b47`.
- XT-C final worker head: `95a23139a206f923f1d8ee1badccaee6ff784231`.
- XT-C final browser smoke: `34414088818` SUCCESS.
- XT-C resulting main: `640e503ed53c45c4f838a385846f0d857cfa6e40`; post-merge `34414324515` SUCCESS.
- Docs closeout resulting main: `f3061cbad574b507b1f80cf23e19b8af179e90b0`; post-merge verify `34414698392` SUCCESS.

These SHAs are historical evidence checkpoints, not permanent base instructions.
