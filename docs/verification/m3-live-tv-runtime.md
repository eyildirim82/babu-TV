# M3 Live TV Runtime Verification

Date: 2026-09-10
Owner: REVIEW / Integration Controller
Source evidence branch: `docs/m3-live-tv-verification`
Source evidence head: `f9c204baaafe80513358feb8d1d04f24b68ecaeb`
Status: REPOSITORY WORK CLOSED / RUNTIME ACCEPTANCE DEFERRED — DO NOT CLAIM FULL M3 RUNTIME PASS

## Purpose

This is the `main`-branch snapshot of the M3G Tizen-sensitive evidence accumulated in PR #22. The original evidence branch remains historical provenance, but the repository no longer needs an open Draft PR merely to represent an external hardware/observation dependency.

Runtime PASS still requires an actual Samsung Tizen Emulator, Remote Test Lab, or physical-TV observation for the applicable behavior. Automated tests, browser smoke, staging, packaging and install evidence do not manufacture UI/playback runtime PASS.

## Evidence obtained

The M3G investigation progressed beyond the original unavailable-runtime checkpoint and reached a real retail Samsung TV.

| Gate | Result | Evidence / notes |
| --- | --- | --- |
| Automated M3 target baseline | PASS | exact runtime-target verify `34286003705`; historical target `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| M3G docs-head verify | PASS | historical exact-head verify `34324366136` on the earlier evidence checkpoint |
| `npm run tizen:build` for hardware candidate | PASS | staging completed before package creation |
| Signed Samsung TV WGT | PASS | package created with Samsung VD signing profile; no certificate secret recorded here |
| Install on retail Samsung TV | PASS | device-side install reported completion |
| Launch on retail Samsung TV | PASS | app launch command succeeded |
| On-device identity | PASS | device application list reported `BABUŞ TV` / `BabusTVApp.BabusTV` |
| Emulator boot / attach | PASS | Samsung TV emulator booted and accepted file transfer |
| Emulator app install | BLOCKED / NOT APP DEFECT | available signing chains were rejected by the emulator certificate trust path |
| Retail-TV remote-control pairing | NOT-AVAILABLE | remote channel remained unauthorized; pairing acceptance was unavailable |
| Retail-TV screen observation | NOT-AVAILABLE | no supported capture path; a human observer was not available for the UI matrix |
| M2 WidgetData real-Tizen probe | PENDING | no genuine runtime probe has established this gate |

The historical evidence also isolated Tizen Studio CLI/signing-profile defects. Those tooling failures were not classified as M3 production defects and no speculative playback/provider/runtime fix was made on the docs branch.

No certificate password, private key, DUID value, provider credential, provider URL, transient credential-bearing stream URL, secret header, DRM clear key, or screenshot containing such material is recorded in this snapshot.

## Runtime smoke matrix

The 13-item M3 runtime behavior matrix remains **not observed** on a real Tizen UI/playback session. Automated tests corroborate the intended behavior but do not replace runtime observation.

| # | Runtime behavior | Final repository status |
| ---: | --- | --- |
| 1 | Enter Live TV without implicit playback | DEFERRED — runtime observation required |
| 2 | SELECT starts highlighted channel | DEFERRED — runtime playback required |
| 3 | Category movement changes highlight/filter without playback change | DEFERRED |
| 4 | Overlay reopen restore priority | DEFERRED |
| 5 | CH+/CH- active-scope, no-wrap behavior | DEFERRED |
| 6 | Rapid repeated zap / last-intent-wins | DEFERRED |
| 7 | Stale async completion cannot replace newer intent | DEFERRED |
| 8 | Old playback survives resolution until disruptive handoff | DEFERRED |
| 9 | Shaka primary / bounded AVPlay fallback | DEFERRED |
| 10 | Classified bounded recovery | DEFERRED |
| 11 | Failed target leaves overlay usable | DEFERRED |
| 12 | Prior playback rollback when technically possible | DEFERRED |
| 13 | Layered Back ownership on Tizen remote | DEFERRED |

No row above is promoted to PASS without a direct runtime observation.

## Why PR #22 can be closed without merging

PR #22 served as a live notebook while hardware access, signing, emulator and pairing paths were investigated. Keeping it open no longer changes the engineering truth:

- repository implementation work for this track is not pending;
- retail packaging/install/launch evidence exists;
- the remaining gates depend on future hardware access, remote pairing and human/runtime observation;
- those gates should be reopened as a new, current runtime-verification task against the then-current release candidate rather than merging an old branch based on a historical M3 code target.

Accordingly PR #22 is archived/closed without a full-M3-complete claim. Its detailed branch history remains available for provenance.

## Reopen criteria

Create a new scoped runtime-verification task only when at least one of these becomes available:

- a paired physical Samsung TV with a human observer;
- Samsung Remote Test Lab with controllable UI observation;
- an emulator signing profile accepted by the target TV emulator for applicable non-AVPlay checks;
- a deliberate M2 WidgetData real-Tizen credential-store probe.

Any reproduced production defect must follow reproduce → root cause → RED → minimum fix → GREEN → affected runtime smoke. Do not patch production speculatively from this deferred evidence record.
