# BabuşTV B0 Execution Status

Date: 2026-09-09
Owner: REVIEW / Integration Controller only
Status: PRE-EXECUTION — B0 docs merge pending

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
| Current `main` | `b35483d0da85e4d73e335387592874759232d304` |
| B0 docs branch | `docs/b0-babustv-brand-separation` |
| B0 docs merge | PENDING |
| First-wave GREEN base SHA | NOT SET |
| Baseline suite | NOT RUN on post-docs-merge main |
| Current integration state | PRE-EXECUTION |
| Last merged B0 slice | NONE |
| Next eligible merge | NONE — docs must merge first |

### Baseline gate before first-wave branches

After the docs branch is merged, REVIEW must refresh `main`, record the exact SHA, and require:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run tizen:build
```

Only after all are GREEN may REVIEW set `First-wave GREEN base SHA` and allow B0A/B0B/B0C/B0F branches to start from that exact SHA.

---

## Parallel Tracks

### B0A — Product Identity

| Field | Value |
| --- | --- |
| Branch | `refactor/b0a-product-identity` |
| Base | NOT SET |
| Head | NOT STARTED |
| PR | NONE |
| Status | BLOCKED ON DOCS MERGE + GREEN BASE |
| CI | NOT RUN |
| Scope review | NOT RUN |
| Merge readiness | NOT READY |
| Blockers | Docs branch not merged; first-wave GREEN base not established |

Owned scope: package metadata, `package-lock.json`, Vite base identity, Tizen identity/packaging, identity scanner, active build docs.

Must not own: `player/index.html`, presentation CSS, settings-copy cleanup, Live TV renderer behavior.

### B0B — Design System

| Field | Value |
| --- | --- |
| Branch | `feature/b0b-design-system` |
| Base | NOT SET |
| Head | NOT STARTED |
| PR | NONE |
| Status | BLOCKED ON DOCS MERGE + GREEN BASE |
| CI | NOT RUN |
| Scope review | NOT RUN |
| Merge readiness | NOT READY |
| Blockers | Docs branch not merged; first-wave GREEN base not established |

Owned scope: `player/src/ui/tokens.css`, `theme.css`, `primitives.css`, design-system contract tests.

Must not own: shell integration, runtime copy, package metadata, Tizen packaging.

### B0C — Brand Assets

| Field | Value |
| --- | --- |
| Branch | `feature/b0c-brand-assets` |
| Base | NOT SET |
| Head | NOT STARTED |
| PR | NONE |
| Status | BLOCKED ON DOCS MERGE + GREEN BASE |
| CI | NOT RUN |
| Scope review | NOT RUN |
| Merge readiness | NOT READY |
| Blockers | Docs branch not merged; first-wave GREEN base not established |

Owned scope: BabuşTV mark/wordmark/boot/favicon/Tizen icon assets and asset acceptance checks.

Must not own: application logic, presentation layout, package identity, localization.

### B0F — Runtime Copy Cleanup

| Field | Value |
| --- | --- |
| Branch | `feature/b0f-settings-copy-cleanup` |
| Base | NOT SET |
| Head | NOT STARTED |
| PR | NONE |
| Status | BLOCKED ON DOCS MERGE + GREEN BASE |
| CI | NOT RUN |
| Scope review | NOT RUN |
| Merge readiness | NOT READY |
| Blockers | Docs branch not merged; first-wave GREEN base not established |

Owned scope: shared runtime copy contract and user-visible runtime/settings/action/status strings.

Must not own: `player/index.html`, layout CSS, Tizen packaging, playback/provider behavior.

### M3G — Tizen-sensitive Runtime Verification

| Field | Value |
| --- | --- |
| Branch | `docs/m3-live-tv-verification` |
| Base | Fresh GREEN main at start |
| Head | NOT STARTED |
| PR | NONE |
| Status | WAITING FOR EXECUTION START |
| CI | NOT RUN |
| Runtime evidence | NOT RUN |
| Merge readiness | NOT READY |
| Blockers | Emulator environment may require restart/fix before runtime evidence |

Primary output: `docs/verification/m3-live-tv-runtime.md`.

Code fixes are not allowed on this docs branch. A reproduced runtime defect requiring code must use a separate `feature/m3g-tizen-hardening` branch with root cause → RED → minimum fix → GREEN.

---

## Review / Integration Queue

Current queue:

1. Review B0 docs branch content and merge checkpoint.
2. After user approval, merge docs branch.
3. Verify post-merge `main` baseline.
4. Record exact first-wave GREEN base SHA.
5. Allow B0A/B0B/B0C/B0F to start from the same SHA.
6. Monitor M3G independently from fresh GREEN `main`.
7. Review worker PRs individually as they become ready.
8. Merge first-wave PRs one at a time only after explicit user approval and post-merge main GREEN.
9. Start B0D only after B0A+B0B+B0C+B0F are all merged and main is GREEN.
10. Start B0E only after B0D merge + GREEN.
11. Start B0G only after all B0 implementation slices merge + GREEN.

---

## Merge History

| Order | Slice | PR | Merged head | Resulting main | Post-merge CI |
| ---: | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

---

## Open Blockers / Findings

### Critical

- None recorded yet.

### Important

- Current `main@b35483d` has not been treated as a verified GREEN execution base; post-docs-merge baseline verification is mandatory before first-wave branch creation.

### Minor

- None recorded yet.

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
