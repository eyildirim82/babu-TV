# BabuşTV Parallel Development Control

Date: 2026-09-10
Owner: REVIEW / Integration Controller
Status: REPOSITORY QUEUE CLOSED — B0 + XTREAM ENTRY INTEGRATED; M3 REAL-TIZEN UI ACCEPTANCE DEFERRED

## Purpose

This is the canonical compact control/evidence board for `eyildirim82/babu-TV`. It records the current integration baseline, closed implementation tracks, and any external evidence debt that must not be mistaken for an open code task.

Canonical sources:

- `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`
- `docs/superpowers/plans/2026-09-09-babustv-brand-separation.md`
- `docs/superpowers/specs/2026-09-08-m3-live-tv-core-design.md`
- `docs/superpowers/plans/2026-09-08-m3-live-tv-core.md`
- `docs/superpowers/plans/2026-09-10-xtream-provider-entry.md`
- `docs/verification/b0-execution-status.md`
- `docs/verification/b0-brand-separation.md`
- `docs/verification/xtream-provider-entry.md`
- `docs/verification/m3-live-tv-runtime.md`

## Current integration baseline

| Field | Value |
| --- | --- |
| Repository | `eyildirim82/babu-TV` |
| Default branch | `main` |
| Current product baseline before this docs-only closeout | `640e503ed53c45c4f838a385846f0d857cfa6e40` |
| Current product baseline verify | `34414324515` SUCCESS |
| B0 implementation | B0A + B0B + B0C + B0D + B0E + B0F + B0G MERGED |
| Xtream entry | prerequisite #28 + XT-A #29 + XT-B #30 + XT-C #31 MERGED |
| Open implementation blocker | NONE |
| M3 Tizen UI/runtime acceptance | DEFERRED external evidence; not an open implementation claim |
| M2 WidgetData real-Tizen probe | PENDING external runtime evidence |
| Merge authority | Controller / explicit user instruction |

New production work must branch from the then-current exact GREEN `main`, not from historical worker/evidence branches.

## B0 dependency gate — CLOSED GREEN

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

Final B0 implementation result remains complete for code, brand separation, staged-package identity and automated regression acceptance. Hardware-only runtime/release observations are not retroactively manufactured as B0 PASS.

Key final B0 checkpoint:

- B0G worker head `5327edee5c9e8ed479dc8102e6ebf90a62ece6fa`;
- exact-head evidence `34405457500` SUCCESS;
- B0G resulting main `40cb22b2816b2d32104799591c67f9e8a6bb7d64`;
- post-merge verify `34406702831` SUCCESS.

## Xtream provider-entry gate — CLOSED GREEN

Sequence:

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

Controller closure:

1. XT-A onboarding transaction was integrated after its activation-order hardening and final GREEN evidence.
2. XT-B remote-first entry UI was integrated with masked password input, semantic BabuşTV focus tokens, safe Turkish error copy and pending-submit protection.
3. XT-C added one Settings request action, shared Provider Core browser construction, onboarding orchestration, remote-first route priority and reload-after-success semantics.
4. XT-C RED integration run `34411937376` failed on the expected missing Settings/main wiring.
5. Verified finish run `34413640960` passed focused integration, full regression, `brand:check`, typecheck, build, `tizen:build`, credential audit and planned-file checks.
6. Exact production head `95a23139a206f923f1d8ee1badccaee6ff784231` passed the full command gate in evidence run `34413787643` before a later evidence-harness URL error.
7. Final 1920×1080 synthetic browser smoke `34414088818` completed SUCCESS. Manual screenshot inspection confirmed the dedicated entry surface, violet 3px focus, masked password, safe AUTH failure behavior and Back restoration.
8. PR #31 was squash-merged to `main@640e503ed53c45c4f838a385846f0d857cfa6e40`.
9. Post-merge verify `34414324515` completed SUCCESS on the exact resulting main.
10. The final worker head and resulting squash-merge commit share Git tree `b9b82d04bf6561bf2acf4bc472a366641aa17792`, so the exact-head brand/Tizen/security/browser evidence is byte-for-byte applicable to the resulting main tree.

See `docs/verification/xtream-provider-entry.md` for the durable evidence summary.

**Xtream blockers:** none.

## M3G runtime evidence — REPOSITORY TRACK ARCHIVED / EXTERNAL ACCEPTANCE DEFERRED

Historical evidence branch: `docs/m3-live-tv-verification`, latest recorded head `f9c204baaafe80513358feb8d1d04f24b68ecaeb`.

The investigation achieved real Samsung retail-TV package/install/launch and on-device product-identity evidence. It also booted/attached a Samsung TV emulator, but emulator install remained blocked by certificate-chain trust. The 13-item M3 UI/playback smoke matrix was not directly observed because the retail remote-control channel was not paired and no human/screen observation path was available.

Controller rules:

- Do not call the 13 runtime matrix rows PASS from automated tests, packaging, install or launch alone.
- M2 WidgetData real-Tizen probe remains PENDING.
- Runtime UI/playback matrix is DEFERRED until a paired physical TV, RTL, or applicable emulator path exists.
- Any reproduced production defect must use a new scoped hardening branch and reproduce → root cause → RED → minimum fix → GREEN → affected runtime smoke.
- The old Draft PR #22 is not a current integration base and is closed/archived rather than merged as an “M3 complete” claim.

See `docs/verification/m3-live-tv-runtime.md` for the main-branch snapshot.

## Active controller state

There is no open repository implementation queue after this closeout. Future work begins only from a fresh exact GREEN `main` and receives a new scope/plan.

Controller duties remain:

1. refresh live GitHub state before merge decisions;
2. review latest head, changed files, CI and evidence;
3. reject scope drift even when CI is GREEN;
4. treat screenshots/manual evidence as first-class when required;
5. separate unavailable external runtime acceptance from code completion;
6. update canonical docs after integration changes.

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

These SHAs are evidence checkpoints, not permanent base instructions.
