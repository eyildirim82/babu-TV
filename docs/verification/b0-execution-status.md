# BabuşTV B0 Execution Status

Date: 2026-09-09
Owner: REVIEW / Integration Controller only
Status: FIRST-WAVE ACTIVE — RED checkpoints under review

## Purpose

This file is the single execution-status board for B0 Brand Separation and the parallel M3G verification track.

Workers must **not** edit this file. Worker evidence belongs in each PR body. The review/integration window reads branch/PR evidence and updates this file after meaningful checkpoints.

Canonical requirements remain in:

- `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`
- `docs/superpowers/plans/2026-09-09-babustv-brand-separation.md`

Short worker assignments live in:

- `docs/superpowers/assignments/2026-09-09-b0-parallel-assignments.md`

If this status file conflicts with the approved spec or implementation plan, the spec/plan wins and this file must be corrected by the review owner.

---

## Global Execution State

| Field | Value |
| --- | --- |
| Current `main` at first-wave start | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| B0 docs branch | `docs/b0-babustv-brand-separation` |
| B0 docs merge | MERGED via PR #17 -> `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| First-wave GREEN base SHA | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| Baseline suite | GREEN base accepted by bootstrap authority; GitHub `verify` run `34286003705` SUCCESS on exact SHA (tests/typecheck/build/clean-diff) |
| Current integration state | FIRST-WAVE DEVELOPMENT ACTIVE |
| Last merged B0 slice | NONE |
| Next eligible merge | NONE YET — wait for an individual first-wave PR to reach exact-head GREEN + review |

The exact first-wave base above is authoritative for B0A/B0B/B0C/B0F even if this review-owned status document advances `main` afterward.

---

## Parallel Tracks

### B0A — Product Identity

| Field | Value |
| --- | --- |
| Branch | `refactor/b0a-product-identity` |
| Base | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| Head | `2903141b348938055d23181d06d4c6bdf6136754` |
| PR | #18 DRAFT |
| Status | RED CHECKPOINT — implementation pending |
| CI | `verify` run `34323764569` FAILURE at tests as expected for RED; typecheck/build skipped |
| Scope review | PASS for current checkpoint: only `player/test/brand-identity.test.js` changed |
| Merge readiness | NOT READY |
| Blockers | Minimum implementation, GREEN evidence, exact-head full verification, final scope/security/regression review |

Owned scope: package metadata, `package-lock.json`, Vite base identity, Tizen identity/packaging, identity scanner, active build docs.

Must not own: `player/index.html`, presentation CSS, settings-copy cleanup, Live TV renderer behavior.

### B0B — Design System

| Field | Value |
| --- | --- |
| Branch | `feature/b0b-design-system` |
| Base | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| Head | `ddcce4031c09d643c82c9b35a0b54f80dab9c31f` |
| PR | #19 DRAFT |
| Status | RED CHECKPOINT — implementation pending |
| CI | `verify` run `34323808070` FAILURE at tests as expected for RED; typecheck/build skipped |
| Scope review | PASS for current checkpoint: only `player/test/babustv-design-system.test.js` changed |
| Merge readiness | NOT READY |
| Blockers | Minimum CSS implementation, GREEN evidence, exact-head full verification, final visual/scope review |

Owned scope: `player/src/ui/tokens.css`, `theme.css`, `primitives.css`, design-system contract tests.

Must not own: shell integration, runtime copy, package metadata, Tizen packaging.

### B0C — Brand Assets

| Field | Value |
| --- | --- |
| Branch | `feature/b0c-brand-assets` |
| Base | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| Head | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| PR | NONE |
| Status | NOT STARTED / NO COMMITS YET |
| CI | NOT RUN |
| Scope review | NO DIFF |
| Merge readiness | NOT READY |
| Blockers | Worker implementation and evidence not yet published |

Owned scope: BabuşTV mark/wordmark/boot/favicon/Tizen icon assets and asset acceptance checks.

Must not own: application logic, presentation layout, package identity, localization.

### B0F — Runtime Copy Cleanup

| Field | Value |
| --- | --- |
| Branch | `feature/b0f-settings-copy-cleanup` |
| Base | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| Head | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| PR | NONE |
| Status | NOT STARTED / NO COMMITS YET |
| CI | NOT RUN |
| Scope review | NO DIFF |
| Merge readiness | NOT READY |
| Blockers | Worker implementation and evidence not yet published |

Owned scope: shared runtime copy contract and user-visible runtime/settings/action/status strings.

Must not own: `player/index.html`, layout CSS, Tizen packaging, playback/provider behavior.

### M3G — Tizen-sensitive Runtime Verification

| Field | Value |
| --- | --- |
| Branch | `docs/m3-live-tv-verification` |
| Base | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| Head | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| PR | NONE |
| Status | NOT STARTED / NO EVIDENCE COMMIT YET |
| CI | NOT RUN |
| Runtime evidence | NOT RUN / NOT PUBLISHED |
| Merge readiness | NOT READY |
| Blockers | Emulator/Tizen evidence not yet published; physical-TV-only checks must remain NOT-AVAILABLE or DEFERRED |

Primary output: `docs/verification/m3-live-tv-runtime.md`.

Code fixes are not allowed on this docs branch. A reproduced runtime defect requiring code must use a separate `feature/m3g-tizen-hardening` branch with root cause -> RED -> minimum fix -> GREEN.

---

## Review / Integration Queue

Current queue:

1. Monitor B0A/B0B/B0C/B0F in parallel from exact base `0af80caf24eab206f303f67c177a5d716fb38a6d`.
2. Monitor M3G independently; do not convert unavailable Tizen/physical-TV checks into PASS.
3. Re-review each worker PR when its GREEN implementation/evidence lands: correct base, ahead/behind, scope/file ownership, TDD RED/GREEN, exact-head CI/test/typecheck/build, secret leakage, playback/provider/domain/focus/recovery regressions, ENTV identity reduction, conflicts/divergence, and changed-file discipline.
4. Present exactly one eligible first-wave merge checkpoint at a time and obtain explicit user approval before merging.
5. After each approved merge, require post-merge `main` GREEN before advancing to the next merge checkpoint.
6. Start B0D only after B0A+B0B+B0C+B0F are all merged and `main` is GREEN.
7. Start B0E only after B0D merge + GREEN.
8. Start B0G only after all B0 implementation slices merge + GREEN.

---

## Merge History

| Order | Slice | PR | Merged head | Resulting main | Post-merge CI |
| ---: | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

---

## Open Blockers / Findings

### Critical

- None recorded at this checkpoint.

### Important

- PR #18 and PR #19 are intentional RED-only checkpoints. They are not merge candidates until minimum implementation plus exact-head GREEN evidence lands.
- B0C, B0F, and M3G have no commits/evidence yet.

### Minor

- None recorded at this checkpoint.

---

## Final B0 Gate

B0 cannot complete until REVIEW records all of the following:

```text
B0A merged + post-merge GREEN
B0B merged + post-merge GREEN
B0C merged + post-merge GREEN
B0F merged + post-merge GREEN
B0D merged + post-merge GREEN
B0E merged + post-merge GREEN
B0G final active-surface brand scan GREEN
Tizen build/package verification recorded
Emulator smoke evidence recorded where available
No active ENTV/EN-IPTV product identity remains
Legal/historical provenance preserved rather than erased
```
