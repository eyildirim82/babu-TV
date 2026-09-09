# BabuşTV Parallel Development Control

Date: 2026-09-09
Owner: REVIEW / Integration Controller
Status: CANONICAL PARALLEL-WORK CONTROL BOARD

## Purpose

This file is the compact control/evidence board for running multiple development windows safely against `eyildirim82/babu-TV`.

Workers should be started with a short role command and must read this file before changing anything. This file does not replace approved specs/plans. If it conflicts with an approved spec or implementation plan, the spec/plan wins and this file must be corrected by the controller.

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
| Pre-board GREEN baseline | `a7d4770b176a7e3336a8f772ab4bc508e39a55e6` |
| B0D final worker head | `50ec2ab35e023041be0f1f0d6c73375961b99179` |
| B0D merge result before controller board/status update | `ceb994b94f93c8939bad6f72e7fda354c5ad9cf9` |
| B0D post-merge CI | GitHub `verify` run `34397292047` SUCCESS on exact `ceb994b...` |
| B0 merged slices | B0A + B0B + B0C + B0D + B0F, all post-merge GREEN |
| Open implementation PR | none; B0E is next eligible after this controller board/status update is exact-head GREEN |
| Open runtime-evidence PR | #22 M3G, Draft / real Tizen runtime incomplete |
| Merge authority | Controller window only |

The B0D squash merge is complete. PR #24 merged exact worker head `50ec2ab...` into `main` as `ceb994b...`, and post-merge `verify` run `34397292047` completed SUCCESS on that exact result.

The controller is updating this board and `docs/verification/b0-execution-status.md` after the merge. Because those controller-owned documentation commits advance `main` again, B0E must use the final exact GREEN `main` after these board/status commits, not `ceb994b...` merely because it was the production merge result.

## Dependency gates

B0 sequence remains constrained:

```text
B0A/B0B/B0C/B0F merged + GREEN
            |
            v
           B0D
            |
    MERGED + POST-MERGE GREEN
            v
           B0E
            |
    merge + post-merge GREEN
            v
           B0G
```

Rules:

- B0D is complete; do not reopen its scope from a new worker window without a separately reviewed defect/hardening assignment.
- B0E is the next implementation slice and must start from the final exact GREEN `main` after this controller board/status checkpoint.
- B0D and B0E must not be developed from overlapping historical branches; B0E consumes the merged shell/presentation DOM contract.
- Do not start B0G until B0E and all other B0 implementation slices are merged and GREEN.
- M3G runtime verification may continue independently because it is evidence-oriented and must not make speculative production fixes on its docs branch.
- M4 EPG/Search/Favorites stays outside current B0/M3 completion scope; production implementation requires its own approved spec/plan and base gate.

## Completed role: B0D worker

**Branch:** `feature/b0d-shell-rebrand`

**Final worker head:** `50ec2ab35e023041be0f1f0d6c73375961b99179`

**PR:** #24 — MERGED via squash.

**Resulting production main:** `ceb994b94f93c8939bad6f72e7fda354c5ad9cf9`

**Post-merge CI:** `verify` run `34397292047` — SUCCESS on exact `ceb994b...`.

Controller re-review closure:

1. Latest four-file diff stayed in B0D shell/boot/global-presentation scope.
2. The stale invisible boot zoom wait is removed without restoring zoom animation.
3. Confirm-dialog remote focus has the required higher-specificity BabuşTV violet token override; the inherited orange focus blocker is closed.
4. Exact-head PR `verify` run `34371869771` is SUCCESS on `50ec2ab...`.
5. Plan-required Step 7 was executed on exact `50ec2ab...` in run `34376296841`: shell acceptance, `brand:check`, full tests, typecheck, production build, `tizen:build`, and clean-diff all completed SUCCESS. The workflow's later failure was isolated to the first synthetic-smoke Playwright import and occurred after Step 7.
6. Corrected 1920×1080 smoke retry run `34380325702` is SUCCESS while still pinning exact production head `50ec2ab...`. Six states were uploaded as artifact `10115583195`, digest `sha256:4a9e317e2b3188625c07cabf2acb7514d1af7caf520b7e1c7aca7986996257ac`.
7. Manual controller review of the six screenshots found no B0D clipping/stacking/focus blocker: confirm `Onayla`, settings, right-sidebar and What's New focus are violet/token-based; boot reduced-motion animation is `none`.
8. The synthetic shell state still shows inherited channel/group orange styling. That is intentionally B0E-owned Live TV visual-reset scope and was not pulled into B0D.

**B0D blockers:** none.

## Next eligible role: B0E worker

B0E may start only after the controller confirms the final board/status-updated `main` is exact-head GREEN.

Base contract:

- branch from the then-current exact GREEN `main`;
- do not base new work on `feature/b0d-shell-rebrand` or any historical worker SHA;
- read the approved BabuşTV brand-separation spec/plan and this board first;
- keep implementation to the plan-defined B0E Live TV visual reset, including B0E-owned channel/group presentation surfaces;
- preserve the merged B0D shell/boot/global presentation contract;
- do not expand into provider/domain, playback engine, stream resolution, PlayerSessionCoordinator/recovery, storage/credential, Tizen/package identity, or M3 highlight-vs-playback semantics unless the approved B0E plan explicitly assigns a surface;
- TDD RED -> minimum implementation -> GREEN;
- open Draft PR and return exact-head evidence to the controller; worker must not Ready/merge.

## Active role: M3G worker

**Branch:** `docs/m3-live-tv-verification`

**Evidence head at last controller checkpoint:** `eee8c714ff00661297b3cbf15405378edffcaca9`

**PR:** #22 — Draft; automated CI GREEN, real Tizen runtime incomplete.

Current evidence state:

- Automated target-code baseline is GREEN.
- Exact-head evidence PR CI is GREEN.
- 13/13 real Tizen runtime smoke observations remain `NOT-AVAILABLE` unless a real Samsung Tizen Emulator, Samsung Remote Test Lab, or physical Samsung TV is actually used.
- M2 WidgetData real-Tizen runtime probe remains `PENDING`.
- Physical-TV acceptance remains `DEFERRED` unless actually executed.
- Do not manufacture runtime PASS from unit tests, packaging, browser mocks, or documentation.

M3G worker contract:

1. Read the M3 plan/spec and `docs/verification/m3-live-tv-runtime.md` first.
2. Use only synthetic/test data for runtime verification.
3. Never log or screenshot credentials, provider URLs, credential-bearing/transient stream URLs, DRM material, secret headers, or keys.
4. Record unavailable checks as `NOT-AVAILABLE` or `DEFERRED`, never PASS.
5. If a real Tizen runtime defect is reproduced, do not patch production code on the docs branch. Record reproduce/root-cause evidence and move any production fix to a separately scoped hardening branch with RED -> minimum fix -> GREEN.
6. Keep the PR Draft until controller review.

## Active role: Controller

The controller owns integration decisions and this control board.

Controller duties:

1. Refresh live GitHub state before every merge decision.
2. Read the worker PR's latest exact head, diff, CI, review comments, and evidence.
3. Reject scope drift even when CI is GREEN.
4. For visual/runtime tasks, treat screenshots/manual evidence as first-class when the plan requires them.
5. Only mark Ready/merge after Critical/Important blockers are cleared.
6. After every merge, verify exact resulting `main` with post-merge CI before allowing the next dependent branch.
7. Update `docs/verification/b0-execution-status.md` and this file only from controller-owned docs/integration work.
8. Do not allow worker branches to edit controller-owned status boards unless explicitly assigned.

## File ownership / parallel safety

Parallel windows are safe only when their owned surfaces do not overlap semantically.

Current hot spots requiring single-owner discipline:

- `player/src/main.js`
- `player/src/player.js`
- `player/src/settings.js`
- inherited/global presentation CSS
- Tizen packaging/staging identity surfaces

Rules:

- Two workers in the same wave must not independently edit the same hot-spot file.
- Prefer new bounded TypeScript modules with explicit interfaces, then a later single integration owner for shared wiring.
- A verification/docs worker must not make speculative production fixes.
- Historical worker branches are evidence/history, not automatic bases for new work.
- New dependent branches use: prior merge -> post-merge GREEN -> exact current `main` -> new branch.

## Short window commands

These are the intended compact prompts for separate ChatGPT/Codex windows. The worker must derive the detailed assignment from this file and the canonical plan/spec.

### B0E — next eligible after final controller-board CI GREEN

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=B0E. Current exact GREEN main'den basla; plan Task B0E ile sinirli kal; Draft/merge yapma.
```

### M3G

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=M3G. Gercek Tizen evidence'tan devam et. Runtime PASS uydurma; production fix yapma.
```

### Controller

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=CONTROLLER. Acik worker PR'larini latest-head + scope + evidence ile review et; onaysiz merge yapma.
```

### Future B0G

Use only after B0E and all other B0 implementation slices are merged and post-merge GREEN:

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=B0G. Current GREEN main'den basla; final brand hardening/gate ile sinirli kal; Draft/merge yapma.
```

## Evidence checkpoint references

At this controller checkpoint:

- Historical pre-board GREEN baseline: `main@a7d4770b176a7e3336a8f772ab4bc508e39a55e6`.
- B0D PR #24 final worker head: `50ec2ab35e023041be0f1f0d6c73375961b99179`.
- B0D exact-head PR CI: `verify` run `34371869771` SUCCESS.
- B0D Step 7 evidence: run `34376296841`; all required Step 7 commands SUCCESS before the later smoke-harness infrastructure failure.
- B0D corrected smoke: run `34380325702` SUCCESS on exact production head, artifact `10115583195`.
- B0D squash merge result: `main@ceb994b94f93c8939bad6f72e7fda354c5ad9cf9`.
- B0D post-merge exact-head CI: `verify` run `34397292047` SUCCESS.
- M3G PR #22 remains Draft with real-Tizen runtime acceptance incomplete at its last reviewed checkpoint.

These SHAs are evidence checkpoints, not permanent branch-base instructions. Workers must refresh live GitHub state before making decisions that depend on current heads.
