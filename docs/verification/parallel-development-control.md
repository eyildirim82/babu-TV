# BabuşTV Parallel Development Control

Date: 2026-09-10
Owner: REVIEW / Integration Controller
Status: CANONICAL PARALLEL-WORK CONTROL BOARD — B0 COMPLETE; M3G REAL-TIZEN RUNTIME GATES OPEN

## Purpose

This is the canonical compact control/evidence board for parallel work in `eyildirim82/babu-TV`. Workers must read the approved spec/plan plus this board before changing code. If this board conflicts with an approved spec/plan, the spec/plan wins and the controller must correct this file.

Canonical sources:

- `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`
- `docs/superpowers/plans/2026-09-09-babustv-brand-separation.md`
- `docs/superpowers/specs/2026-09-08-m3-live-tv-core-design.md`
- `docs/superpowers/plans/2026-09-08-m3-live-tv-core.md`
- `docs/verification/b0-execution-status.md`
- `docs/verification/b0-brand-separation.md`
- `docs/verification/m3-live-tv-runtime.md` on the M3G evidence branch

## Current integration baseline

| Field | Value |
| --- | --- |
| Repository | `eyildirim82/babu-TV` |
| Default branch | `main` |
| B0G worker head | `5327edee5c9e8ed479dc8102e6ebf90a62ece6fa` |
| B0G PR | #27 — MERGED via squash |
| B0G resulting main | `40cb22b2816b2d32104799591c67f9e8a6bb7d64` |
| B0G post-merge CI | GitHub `verify` run `34406702831` SUCCESS on exact `40cb22b...` |
| B0 implementation | B0A + B0B + B0C + B0D + B0E + B0F + B0G MERGED |
| B0 status | COMPLETE for code/brand/staged-package acceptance; unavailable emulator/physical-TV gates recorded honestly |
| Open runtime-evidence PR | #22 M3G, Draft; real Tizen runtime incomplete |
| Merge authority | Controller window only |

## B0 dependency gate — CLOSED GREEN

```text
B0A/B0B/B0C/B0F merged + GREEN
            |
            v
           B0D
            |
      merged + GREEN
            v
           B0E
            |
      merged + GREEN
            v
           B0G
            |
      merged + GREEN
            v
        B0 COMPLETE
```

B0G final active-product gate completed, PR #27 was squash-merged, and post-merge `main@40cb22b2816b2d32104799591c67f9e8a6bb7d64` passed `verify` run `34406702831`.

## Completed role: B0G worker

**Branch:** `feature/b0g-brand-hardening`

**Worker head:** `5327edee5c9e8ed479dc8102e6ebf90a62ece6fa`

**PR:** #27 — MERGED via squash.

**Resulting main:** `40cb22b2816b2d32104799591c67f9e8a6bb7d64`

**Post-merge CI:** `verify` run `34406702831` — SUCCESS.

Controller closure:

1. B0G was based on exact GREEN controller checkpoint `main@0ccf8c3c3a32ec709ee60e10e380e458d5f04e8d`.
2. Final scanner covers `player/index.html`, `player/src/**`, and `player/public/**` in addition to B0A identity/build surfaces, with only plan-approved generated/vendor/binary exclusions.
3. Final gate reproduced two active-product legacy-brand defects: `player/src/update.js` legacy update metadata route and root `version.json` legacy release route.
4. RED revision `811066f347ec19079506f2f0629f2e5fd92a88df` was proven by run `34405210273`; the focused acceptance was required to fail on that revision.
5. Minimum repair changed only update/release ownership to `eyildirim82/babu-TV`; consent/cache storage keys and update-flow semantics stayed unchanged.
6. Exact-head evidence run `34405457500` explicitly checked out `5327edee...` and passed JS 48/48, TypeScript 174/174, typecheck, build, `brand:check` with 83 active surfaces clean, `tizen:build`, staged identity/icon/index checks, staged legacy scan, and clean diff.
7. Broad audit classified remaining legacy markers only as legal attribution or historical spec/baseline/test-fixture provenance; no unresolved `BUG_ACTIVE_PRODUCT_SURFACE` remained.
8. `npm run tizen:package`, emulator, and physical-TV acceptance were not available in the B0G worker environment and were recorded as NOT-AVAILABLE/DEFERRED rather than promoted to PASS.
9. PR-triggered `verify` run `34406390866` passed on exact worker head before merge.
10. Post-merge `verify` run `34406702831` passed on exact resulting main.

**B0G blockers:** none.

## Final B0 acceptance

Recorded GREEN / satisfied:

- user-visible product identity is BabuşTV;
- npm/Tizen/browser/WGT source identity is BabuşTV-owned;
- browser/dev base is `/babustv/`;
- shell/settings/status copy is Turkish-first;
- charcoal/violet design system and remote focus are the presentation base;
- Live TV focus/playing/failed presentation states remain distinct while M3 playback semantics stay unchanged;
- final active product surfaces pass the expanded legacy-brand scanner;
- staged Tizen identity is `BabusTVApp.BabusTV`, package `BabusTVApp`, display name `BABUŞ TV`, required version `5.0`;
- staged icon is byte-equal to the canonical BabuşTV icon and staged index uses relative asset paths;
- legal/historical provenance is preserved outside active product identity;
- B0G exact-head and post-merge regression verification are GREEN.

Availability-limited evidence is explicitly not release/hardware PASS:

- Tizen signed package creation: NOT-AVAILABLE in B0G worker environment;
- Tizen Emulator: NOT-AVAILABLE in B0G worker environment;
- physical TV: DEFERRED to runtime verification;
- M2 WidgetData real-Tizen probe: PENDING in M3G until genuinely executed.

These availability-limited gates do not reopen B0 implementation scope. Any real-Tizen defect discovered later must be reproduced and handled in a separately scoped hardening branch.

## Active role: M3G worker

**Branch:** `docs/m3-live-tv-verification`

**PR:** #22 — Draft; automated evidence exists, real Tizen runtime remains incomplete.

Current runtime rules:

- Real Samsung Tizen Emulator, RTL, or physical-TV evidence is required for runtime PASS claims.
- M2 WidgetData real-Tizen probe remains pending until actually executed.
- Physical-TV acceptance remains deferred unless actually performed.
- Do not log/screenshot credentials, provider URLs, transient stream URLs, DRM material, secret headers, or keys.
- A reproduced Tizen production defect must move to a separately scoped hardening branch; do not patch production code speculatively on the docs branch.

## Active role: Controller

Controller duties:

1. Refresh live GitHub state before every merge decision.
2. Review latest worker head, changed files, CI, comments/reviews, and required evidence.
3. Reject scope drift even when CI is GREEN.
4. Treat screenshots/manual evidence as first-class for visual/runtime gates.
5. Only mark Ready/merge after Critical/Important blockers are cleared.
6. After every merge, require exact resulting `main` post-merge CI before starting dependent work.
7. Update this board and `docs/verification/b0-execution-status.md` only from controller-owned integration work.
8. Do not let worker branches edit controller-owned status boards unless explicitly assigned.

## Parallel safety

B0 implementation slices are integrated. Historical B0 worker branches remain evidence/history and are not automatic bases for future work. Any new production work must branch from the then-current exact GREEN `main` after its own controller gate.

M3G remains independent and hardware/runtime constrained. Do not convert unit/browser/staging evidence into real-Tizen PASS.

## Short window commands

### M3G

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=M3G. Gercek Tizen evidence'tan devam et. Runtime PASS uydurma; production fix yapma.
```

### Controller

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=CONTROLLER. Acik worker PR'larini latest-head + scope + evidence ile review et; onaysiz merge yapma.
```

## Evidence checkpoints

- First-wave base: `0af80caf24eab206f303f67c177a5d716fb38a6d`.
- B0D merge result: `ceb994b94f93c8939bad6f72e7fda354c5ad9cf9`; post-merge run `34397292047` SUCCESS.
- Pre-B0E controller GREEN main: `78eddb16dd1242976e61246541ec7c5189098bb8`; run `34397606608` SUCCESS.
- B0E worker head: `ea9a4b974025032cd50c3fa192c2fd4187eb2abf`; exact-head evidence/smoke run `34401861105` SUCCESS.
- B0E squash merge result: `43020e6fab513a018bd789183b2a9b9afd07fba0`; post-merge run `34403420282` SUCCESS.
- Pre-B0G controller checkpoint: `0ccf8c3c3a32ec709ee60e10e380e458d5f04e8d`; run `34403623125` SUCCESS.
- B0G worker head: `5327edee5c9e8ed479dc8102e6ebf90a62ece6fa`.
- B0G RED proof: run `34405210273` SUCCESS by requiring focused acceptance failure at RED revision.
- B0G exact-head full evidence: run `34405457500` SUCCESS.
- B0G PR verify: run `34406390866` SUCCESS.
- B0G squash merge result: `main@40cb22b2816b2d32104799591c67f9e8a6bb7d64`.
- B0G post-merge exact-head CI: `verify` run `34406702831` SUCCESS.
- M3G PR #22 remains Draft with real-Tizen runtime acceptance incomplete.

These SHAs are evidence checkpoints, not permanent base instructions. Workers must refresh live GitHub state before decisions that depend on current heads.
