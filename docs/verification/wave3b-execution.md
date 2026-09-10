# BabuşTV V1 Wave 3B Execution Board

**Date:** 2026-09-10  
**Controller production base:** `b55a01642cd03a555712dd64026f3e22f1a81323`  
**Production-base verify:** `34526851457` SUCCESS  
**Design:** `docs/superpowers/specs/2026-09-10-wave3b-home-m4-pairing-execution-design.md`

This file is the current Wave 3B overlay for the older V1 parallel board. Historical `BLOCKED-*` values in `docs/verification/v1-parallel-execution.md` do not override this controller-approved Wave 3B state.

| ROLE | Branch | Status | Plan / control |
| --- | --- | --- | --- |
| HOME-UI | `feature/home-ui` | OPEN | `docs/superpowers/plans/2026-09-10-wave3b-home-ui.md` |
| M4-COMP | `integration/m4-live-tv-composition` | OPEN | `docs/superpowers/plans/2026-09-10-wave3b-m4-live-tv-composition.md` |
| PAIR-C | `feature/pairing-crypto` | OPEN-RETARGETED | frozen PAIR-C plan + `docs/superpowers/plans/2026-09-10-wave3b-pair-c-retarget.md` |
| PAIR-S | `feature/pairing-session` | OPEN-RETARGETED | frozen PAIR-S plan + `docs/superpowers/plans/2026-09-10-wave3b-pair-s-retarget.md` |
| PAIR-R | `feature/pairing-relay-contract` | OPEN-RETARGETED | frozen PAIR-R plan + `docs/superpowers/plans/2026-09-10-wave3b-pair-r-retarget.md` |
| M5-COMP | `integration/m5-app-composition` | BLOCKED | HOME-UI + M4-COMP merged/GREEN |
| PAIR-WEB | TBD by bounded design | BLOCKED | PAIR-C/S/R merged/frozen + approved phone UI contract |
| PAIR-I | `integration/pairing-onboarding` | BLOCKED | pairing core + PAIR-WEB + final onboarding contracts |

## Production ownership

HOME-UI owns only focused Home presentation/style/test files and may not touch `main.js`, `index.html`, Live TV hot zones, provider runtime, storage, or playback.

M4-COMP is the sole Wave 3B worker allowed bounded ownership of shared Live TV controller/view/runtime files. It may not touch `main.js`, `index.html`, provider runtime, storage, credential handling, or playback/recovery semantics.

PAIR-C/S/R remain mutually independent and preserve their frozen exact file scopes.

## Worker evidence contract

Every production worker follows RED -> minimum GREEN and opens a Draft PR only. Final exact-head evidence must include:

```text
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --check b55a01642cd03a555712dd64026f3e22f1a81323...HEAD
```

Physical Samsung/Tizen runtime is `NOT VERIFIED` unless a real device/emulator run is performed. Workers do not mark Ready or merge.
