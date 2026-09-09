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
| Current main | `a7d4770b176a7e3336a8f772ab4bc508e39a55e6` |
| Main status | GREEN; GitHub `test-and-build` completed successfully on this exact head |
| B0 first wave | B0A + B0B + B0C + B0F merged and post-merge GREEN |
| Open implementation PR | #24 B0D, Draft / NOT READY |
| Open runtime-evidence PR | #22 M3G, Draft / runtime incomplete |
| Merge authority | Controller window only |

Do not assume a worker branch should be based on the SHA above after `main` advances. Every new dependent implementation branch must start only after the previous required merge is complete and the new `main` exact head is post-merge GREEN.

## Dependency gates

B0 sequence is intentionally constrained:

```text
B0A/B0B/B0C/B0F merged + GREEN
            |
            v
           B0D
            |
    merge + post-merge GREEN
            v
           B0E
            |
    merge + post-merge GREEN
            v
           B0G
```

Rules:

- Do not start B0E implementation while B0D is open.
- B0D and B0E must not be parallelized; both depend on the final shell/presentation DOM contract.
- Do not start B0G until all B0 implementation slices are merged and GREEN.
- M3G runtime verification may continue independently because it is evidence-oriented and must not make speculative production fixes on its docs branch.
- M4 EPG/Search/Favorites stays outside current B0/M3 completion scope; design work may be prepared separately, but production implementation must have its own approved spec/plan and base gate.

## Active role: B0D worker

**Branch:** `feature/b0d-shell-rebrand`

**Current head at this checkpoint:** `e840cb0becc9083aeb80f96b458cfcf5fad6cccf`

**PR:** #24 — Draft / NOT READY.

Earlier stale boot-exit delay was repaired. Full Step 7 and a 1920x1080 synthetic smoke were executed on `e840cb0...` and their mechanical checks completed successfully.

The latest controller re-review still has one **Important** blocker:

- `05-confirm.png` shows the focused `Onayla` button with an inherited orange outline.
- Root cause: inherited `player/src/styles.css` rule `.confirm-dialog-buttons .btn.focused { outline: ... solid #ff6b35; }` has higher specificity than B0D's generic violet `.btn.focused` rule.
- This belongs to B0D global shell/confirm/focus scope and must not be deferred to B0E.

Required repair:

1. Add a focused RED acceptance that rejects inherited orange confirm-dialog focus.
2. Apply the minimum shell-only specificity override in `player/src/ui/shell.css`.
3. Do not broaden into B0E channel/group styling.
4. Keep remote focus clearly visible and based on the BabuşTV violet token system.
5. Re-run focused RED -> GREEN.
6. Re-run the complete B0D Step 7 on the new exact head:

```bash
node --test player/test/babustv-shell.test.js
npm run brand:check
npm test
npm run typecheck
npm run build
npm run tizen:build
```

7. Re-run the 1920x1080 synthetic smoke on the same exact head.
8. Manually inspect the new confirm screenshot before updating the PR body.
9. Keep the PR Draft. Do not mark Ready or merge; return evidence to the controller.

**Forbidden B0D scope expansion:** provider/domain, playback engines, stream resolution, ChannelIntentCoordinator, PlayerSessionCoordinator/recovery, remote/input semantics, storage/credentials, Tizen/package identity, M3 highlight-vs-playback semantics, B0E channel/group visual reset.

## Active role: M3G worker

**Branch:** `docs/m3-live-tv-verification`

**Current evidence head:** `eee8c714ff00661297b3cbf15405378edffcaca9`

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

1. Refresh GitHub state before every merge decision.
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

### B0D

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=B0D. Son controller blockerindan devam et. Scope disina cikma; Draft/merge yapma.
```

### M3G

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=M3G. Gercek Tizen evidence'tan devam et. Runtime PASS uydurma; production fix yapma.
```

### Controller

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=CONTROLLER. Acik worker PR'larini latest-head + scope + evidence ile review et; onaysiz merge yapma.
```

### Future B0E

Use only after B0D is merged and the resulting `main` is post-merge GREEN:

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=B0E. Current GREEN main'den basla; plan Task B0E ile sinirli kal; Draft/merge yapma.
```

### Future B0G

Use only after B0E and all other B0 implementation slices are merged and post-merge GREEN:

```text
Repo eyildirim82/babu-TV. Oku docs/verification/parallel-development-control.md. ROLE=B0G. Current GREEN main'den basla; final brand hardening/gate ile sinirli kal; Draft/merge yapma.
```

## Evidence checkpoint references

At the time this board was written:

- `main`: `a7d4770b176a7e3336a8f772ab4bc508e39a55e6`, `test-and-build` SUCCESS.
- B0D PR #24: head `e840cb0becc9083aeb80f96b458cfcf5fad6cccf`, Draft; latest controller review reports the inherited orange confirm-focus blocker described above.
- M3G PR #22: head `eee8c714ff00661297b3cbf15405378edffcaca9`, Draft; automated CI GREEN, real Tizen runtime criterion still open.

These SHAs are evidence checkpoints, not permanent branch-base instructions. Workers must refresh live GitHub state before making decisions that depend on current heads.
