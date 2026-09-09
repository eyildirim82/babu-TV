# BabuşTV Parallel Development Control

Date: 2026-09-09
Owner: REVIEW / Integration Controller
Status: CANONICAL PARALLEL-WORK CONTROL BOARD — B0G GATE PENDING CONTROLLER CHECKPOINT CI

## Purpose

This is the canonical compact control/evidence board for parallel work in `eyildirim82/babu-TV`. Workers must read the approved spec/plan plus this board before changing code. If this board conflicts with an approved spec/plan, the spec/plan wins and the controller must correct this file.

Canonical sources:

- `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`
- `docs/superpowers/plans/2026-09-09-babustv-brand-separation.md`
- `docs/superpowers/specs/2026-09-08-m3-live-tv-core-design.md`
- `docs/superpowers/plans/2026-09-08-m3-live-tv-core.md`
- `docs/verification/b0-execution-status.md`
- `docs/verification/m3-live-tv-runtime.md` on the M3G evidence branch

## Current integration baseline

| Field | Value |
| --- | --- |
| Repository | `eyildirim82/babu-TV` |
| Default branch | `main` |
| B0E worker head | `ea9a4b974025032cd50c3fa192c2fd4187eb2abf` |
| B0E PR | #26 — MERGED via squash |
| B0E resulting main | `43020e6fab513a018bd789183b2a9b9afd07fba0` |
| B0E post-merge CI | GitHub `verify` run `34403420282` SUCCESS on exact `43020e6...` |
| B0 merged implementation slices | B0A + B0B + B0C + B0D + B0E + B0F |
| Next dependent slice | B0G after this controller-owned board/status checkpoint is itself exact-head GREEN |
| Open runtime-evidence PR | #22 M3G, Draft; real Tizen runtime incomplete |
| Merge authority | Controller window only |

## Dependency gate

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
```

B0E is complete. PR #26 merged exact worker head `ea9a4b9...` into `main` as `43020e6...`, and post-merge `verify` run `34403420282` completed SUCCESS on that exact merge result.

The controller is now advancing this board and `docs/verification/b0-execution-status.md`. Because these controller-owned docs commits advance `main` again, B0G must branch from the final exact GREEN `main` after the board/status checkpoint, not directly from historical worker or pre-checkpoint SHAs.

## Completed role: B0E worker

**Branch:** `feature/b0e-live-tv-visual-reset`

**Worker head:** `ea9a4b974025032cd50c3fa192c2fd4187eb2abf`

**PR:** #26 — MERGED via squash.

**Resulting main:** `43020e6fab513a018bd789183b2a9b9afd07fba0`

**Post-merge CI:** `verify` run `34403420282` — SUCCESS.

Controller closure:

1. Changed files matched plan Task 6 exactly: `dom-live-tv-view.ts`, `m3-live-tv.css`, new `ui/live-tv.css`, TypeScript view tests, and BabuşTV Live TV presentation acceptance.
2. Provider/domain, playback engine, stream resolution, recovery, storage/credentials, Tizen identity, and M3 highlight-vs-playback semantics did not drift.
3. RED commit `3e06cf7f...` failed for the intended missing-presentation requirement; GREEN product head `ea9a4b9...` passed PR `verify` run `34400842223`.
4. Exact-head evidence run `34401861105` pinned `ea9a4b9...` and passed focused presentation acceptance, TypeScript 174/174, `brand:check`, full regression JS 47/47 + TS 174/174, typecheck, production build, and clean checkout.
5. Synthetic browser smoke measured a CSS viewport of exactly 1920×1080 and passed channel/category/numeric/failed/closed states. Artifact `b0e-final-smoke-ea9a4b9-v2`, ID `10123801323`.
6. Manual controller review found categories/channels composed together, strong violet remote focus distinct from passive highlight, playing state independently marked with `Yayında`, long channel names safely clipped, failure status visible, numeric overlay visible, and closed overlay leaving the playback surface unobstructed.

**B0E blockers:** none.

## Next eligible role: B0G worker

B0G may start only after the controller confirms the final board/status-updated `main` is exact-head GREEN.

B0G contract from plan Task 7:

- branch `feature/b0g-brand-hardening` from the then-current exact GREEN `main`;
- expand `tools/check-legacy-brand.mjs` to all active product surfaces defined by the plan;
- create `docs/verification/b0-brand-separation.md`;
- modify tests/code only after a reproduced final-gate failure and follow RED -> minimum fix -> GREEN;
- run the complete automated matrix including `npm ci`, tests, typecheck, build, `brand:check`, and `tizen:build`;
- validate staged BabuşTV identity/assets and classify broad legacy-brand hits as legal attribution, historical provenance, or active-product bug;
- execute emulator/Tizen evidence only when genuinely available; unavailable runtime checks must not be manufactured as PASS;
- do not add M4 EPG/Search/Favorites or unrelated provider/playback/recovery behavior;
- open a Draft PR and return evidence to the controller; worker must not Ready/merge.

## Active role: M3G worker

**Branch:** `docs/m3-live-tv-verification`

**PR:** #22 — Draft; automated CI/evidence exists, real Tizen runtime remains incomplete.

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
6. After every merge, require exact resulting `main` post-merge CI before starting a dependent slice.
7. Update this board and `docs/verification/b0-execution-status.md` only from controller-owned integration work.
8. Do not let worker branches edit controller-owned status boards unless explicitly assigned.

## Parallel safety

Current hot spots requiring single-owner discipline include `player/src/main.js`, `player/src/player.js`, `player/src/settings.js`, inherited/global presentation CSS, and Tizen packaging/staging identity surfaces. Historical worker branches are evidence/history, not automatic bases for new work. New dependent work always follows: prior merge -> post-merge GREEN -> controller checkpoint GREEN -> exact current `main` -> new branch.

## Short window commands

### B0G — use only after final controller checkpoint CI GREEN

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=B0G. Current exact GREEN main'den basla; plan Task 7 final brand hardening/gate ile sinirli kal; Draft/merge yapma.
```

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
- Controller pre-B0E GREEN main: `78eddb16dd1242976e61246541ec7c5189098bb8`; run `34397606608` SUCCESS.
- B0E worker head: `ea9a4b974025032cd50c3fa192c2fd4187eb2abf`.
- B0E product PR run: `34400842223` SUCCESS.
- B0E exact-head evidence/smoke run: `34401861105` SUCCESS; artifact `10123801323`.
- B0E squash merge result: `main@43020e6fab513a018bd789183b2a9b9afd07fba0`.
- B0E post-merge exact-head CI: `verify` run `34403420282` SUCCESS.
- M3G PR #22 remains Draft with real-Tizen runtime acceptance incomplete.

These SHAs are evidence checkpoints, not permanent base instructions. Workers must refresh live GitHub state before decisions that depend on current heads.
