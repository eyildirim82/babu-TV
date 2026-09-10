# BabuşTV Parallel Development Control

Date: 2026-09-10  
Owner: REVIEW / Integration Controller  
Status: V1 RC ROADMAP OPEN — IMPLEMENTATION NOT STARTED; PHYSICAL-TIZEN RELEASE ACCEPTANCE DEFERRED

## Purpose

This is the canonical compact control/evidence board for `eyildirim82/babu-TV`. It records the current integration baseline, the new V1 RC work queue, dependency/parallelism rules, and external runtime evidence debt that must not be mistaken for a repository implementation blocker.

Canonical sources:

- `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`
- `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`
- `docs/superpowers/specs/2026-09-08-m3-live-tv-core-design.md`
- `docs/superpowers/plans/2026-09-08-m3-live-tv-core.md`
- `docs/superpowers/plans/2026-09-10-xtream-provider-entry.md`
- `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`
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
| M3 Tizen UI/runtime acceptance | DEFERRED external evidence |
| M2 WidgetData real-Tizen probe | PENDING external evidence |
| Merge authority | Controller / explicit user instruction |

New production work must branch from the then-current exact GREEN `main`, not from historical B0/M3G/Xtream worker or evidence branches.

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

## V1 RC queue

The next program of work is controlled by:

- `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`;
- `docs/verification/v1-rc-readiness.md`.

High-level sequence:

```text
M4 EPG / Favorites / Search
        ↓
M3U Provider-Core onboarding parity
        ↓
M5 Watch State / Home / Provider Management / First Run
        ↓
M6 Secure QR / Phone Pairing
        ↓
M7 Hardening / Security / Migration / Performance
        ↓
Browser Release Matrix + Tizen Build/Package Gate
        ↓
V1 RC candidate
```

Physical-TV acceptance does not block these deterministic implementation waves. It does block final release acceptance.

## Immediate next gate

No M4 production branch should begin from this docs branch.

After this roadmap documentation is merged and the resulting `main` is GREEN:

1. write and approve a bounded M4A EPG Core spec/implementation plan;
2. create the M4A branch from that exact GREEN `main`;
3. run RED → minimum implementation → GREEN;
4. open Draft PR with exact base/head and evidence;
5. controller reviews before Ready/merge;
6. dependent M4 work starts only from the required post-merge GREEN baseline.

## Parallel development rules for the RC program

Parallelism is allowed only when both file ownership and semantic dependencies are non-overlapping.

Controller must reject parallel work when:

- two branches both change shared provider/repository contracts without an agreed base order;
- two branches own the same focus/navigation surface;
- Home work assumes watch-state/favorites/search interfaces that have not yet merged;
- M3U onboarding bypasses Provider Core to avoid waiting for a dependency;
- M6 pairing invents a second credential persistence path instead of using `CredentialStore`;
- hardening branches mix unrelated feature development with regression fixes.

Recommended dependency shape:

```text
M4A EPG Core
   ├─→ M4B EPG UI
   └─→ later Home current-program cards

M4C Favorites ─→ M5 Home Favorites row
M4D Search    ─→ final navigation/search smoke
M3U onboarding parity ─→ complete first-run/provider-management flows
M5A Watch State ─→ M5B Home
M5C Provider Management depends on stable Provider Core onboarding/switch/delete contracts
M6 Pairing depends on final onboarding transaction + CredentialStore boundaries
M7 begins only after feature scope is frozen
```

## Short worker commands

Use short role prompts only after the relevant bounded plan exists and is merged/available on `main`.

Examples:

```text
Repo eyildirim82/babu-TV. Kontrol boardunu oku. ROLE=CONTROLLER.
```

```text
Repo eyildirim82/babu-TV. V1 RC roadmap ve M4A planını oku. ROLE=M4A.
```

```text
Repo eyildirim82/babu-TV. V1 RC readiness boardunu oku. ROLE=RC-VERIFY.
```

Do not invent a ROLE for a work package whose scoped implementation plan has not been approved.

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
3. require bounded plan approval before implementation;
4. review latest head, changed files, CI, security boundaries, and evidence;
5. reject scope drift even when CI is GREEN;
6. keep highlight/playback, provider, credential, and focus invariants intact across new features;
7. treat screenshots/manual evidence as first-class where required;
8. keep unavailable physical-runtime acceptance separate from code completion;
9. update `v1-rc-readiness.md` and this board after integrations;
10. require post-merge `main` GREEN before dependent work starts.

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
