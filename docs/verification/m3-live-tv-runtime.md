# M3 Live TV Runtime Verification

Date: 2026-09-09
Track: M3G — Tizen-sensitive runtime verification/evidence
Branch: `docs/m3-live-tv-verification`
Runtime target code SHA: `0af80caf24eab206f303f67c177a5d716fb38a6d`
Status: RUNTIME EVIDENCE INCOMPLETE — do not claim M3 fully complete

## Scope and evidence rules

This document records the M3G verification state for the exact M3/B0-integrated code candidate at `0af80caf24eab206f303f67c177a5d716fb38a6d`.

The branch was confirmed to start from the same exact SHA as `main`. This track is docs/evidence-only. No B0 implementation branch or production source file is modified here.

Evidence rules used for this report:

- Runtime PASS requires an actual Samsung Tizen Emulator, Samsung Remote Test Lab, or physical Samsung TV observation.
- Automated/unit/browser evidence is recorded separately and does not substitute for Tizen runtime evidence.
- Checks that could not be executed on real Tizen are `NOT-AVAILABLE`, not PASS.
- Physical-TV release acceptance remains `DEFERRED` unless actually performed.
- Only synthetic/test provider data may be used for runtime probes.
- Provider credentials, provider URLs, credential-bearing/transient stream URLs, secret headers, DRM clear keys, and screenshots containing such material must not be recorded.
- A runtime defect requiring production code changes must move to `feature/m3g-tizen-hardening` after reproduce -> root cause -> RED. No speculative production fix belongs on this branch.

Sources reviewed before verification:

- `docs/superpowers/plans/2026-09-08-m3-live-tv-core.md`
- `docs/superpowers/specs/2026-09-08-m3-live-tv-core-design.md`
- `docs/verification/b0-execution-status.md`
- `docs/decisions/0002-tizen-credential-storage.md`

## Fresh milestone gate

| Gate | Result | Evidence |
| --- | --- | --- |
| `main` head | PASS | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| M3G branch starting head | PASS | `docs/m3-live-tv-verification` started at the same `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| Latest exact-main verify | PASS | GitHub Actions `verify` run `34286003705`, conclusion SUCCESS |
| Open PR review | RECORDED | B0 implementation PRs were open concurrently; M3G did not modify or depend on their branch heads |
| Upstream `Nur-allhi/en-tvplayer/main` | UNCHANGED | `58bc12f755b731cad540d50a8e16cf8bb8708738`, `release: v2.0.0`, same upstream SHA recorded by the M3 plan |
| M2 WidgetData runtime gate | PENDING | ADR states no real Tizen runtime probe was completed; no PASS is inferred from unit tests, packaging, or documentation |

`docs/verification/b0-execution-status.md` is review-owned and was intentionally not edited by this worker.

## Automated baseline — exact code candidate

GitHub Actions run: `34286003705`
Exact checkout SHA: `0af80caf24eab206f303f67c177a5d716fb38a6d`
Job: `test-and-build` (`102261639413`)
Runner test Node: `v22.23.2`
Runner npm: `10.9.8`

| Command / stage | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | 24 packages added; 27 audited; 0 vulnerabilities |
| `npm test` — legacy/JS | PASS | 27/27 passed, 0 failed |
| `npm test` — TypeScript | PASS | 173/173 passed, 0 failed |
| Total automated tests | PASS | 200/200 passed |
| `npm run typecheck` | PASS | `tsc -p tsconfig.json --noEmit` exited 0 |
| `npm run build` | PASS | Vite 6.4.3 production build completed; 48 modules transformed |
| clean-diff check | PASS | `git diff --exit-code` exited 0 |

### Build warnings

The exact candidate build reports:

1. `$WEBAPIS/webapis/webapis.js` cannot be bundled without a `type="module"` attribute.
2. A post-minification chunk exceeds Vite's 500 kB warning threshold.

Both warning categories were already present in pre-M3 design verification run `34210143461` at `3306275c2a69addeb3dc30697db03021e1f1c827`, so they are recorded as inherited/non-blocking for M3G. This does not waive future bundle-size work.

GitHub Actions also reports an actions-runtime Node 20 deprecation compatibility warning; this is runner/action infrastructure output, not an M3 runtime finding.

## Tizen package / signing evidence

Status: `NOT-AVAILABLE`.

The M3 plan requires `npm run tizen` only in a secret-safe signing environment. This execution environment has no Samsung Tizen SDK/emulator session, device/RTL session, or approved signing material available to the worker. Therefore no WGT package/sign/deploy result is claimed here, and no certificate/private-key material was accessed or recorded.

The repository exposes `tizen`, `tizen:build`, `tizen:package`, `tizen:emu`, and `tizen:log` scripts, but script presence is not runtime/package evidence.

## Runtime environment

| Field | Value |
| --- | --- |
| Samsung Tizen Emulator | NOT-AVAILABLE |
| Samsung Remote Test Lab | NOT-AVAILABLE |
| Physical Samsung TV | NOT-AVAILABLE |
| Runtime/model/version | N/A — no real Tizen runtime session was available |
| Test data | Synthetic/test data required; no real provider material recorded |
| Screenshots | None captured |

Because no real Tizen runtime was available, the matrix below deliberately contains no runtime PASS results. Automated evidence is provided only as corroboration and must not be read as a substitute for the missing runtime observation.

## M3 runtime smoke matrix

| # | Runtime smoke | Runtime result | Automated corroboration on `0af80caf...` | Notes |
| ---: | --- | --- | --- | --- |
| 1 | Enter Live TV: overlay opens, no implicit playback | NOT-AVAILABLE | GREEN: first-entry controller/state tests | Requires actual Tizen UI observation |
| 2 | SELECT: highlighted channel starts | NOT-AVAILABLE | GREEN: `select plays highlighted channel and PLAYING closes overlay` | Requires actual playback runtime |
| 3 | Category movement changes highlight/filter; playback unchanged | NOT-AVAILABLE | GREEN: category movement/scope tests | Requires remote/UI observation |
| 4 | Overlay reopen restore priority: playing -> saved -> first | NOT-AVAILABLE | GREEN: overlay restore stable-ID tests | Requires rendered runtime observation |
| 5 | CH+/CH- stays in active scope and does not wrap | NOT-AVAILABLE | GREEN: active-scope/no-wrap controller tests | Requires Tizen remote key path |
| 6 | Rapid repeated zap: last intent wins; stale channel never takes over | NOT-AVAILABLE | GREEN: stale resolve/session/recovery and overlapping-switch tests | Requires real asynchronous player/runtime observation |
| 7 | Successful handoff shows short `Yayın açılıyor...`; overlay closes on success | NOT-AVAILABLE | GREEN: renderer loading state + PLAYING close behavior | Timing/presentation requires runtime observation |
| 8 | Failed target preserves/restores previous channel when possible; overlay open; failed target highlighted | NOT-AVAILABLE | GREEN: failed target + rollback controller/session tests | Requires real engine failure/rollback runtime |
| 9 | Back: option layer -> overlay -> platform exit; no custom exit modal | NOT-AVAILABLE | GREEN: layer-by-layer Back platform test | Actual Tizen exit behavior not observed |
| 10 | Shaka primary path | NOT-AVAILABLE | GREEN: Shaka-first/non-sticky engine tests | Real Tizen Shaka path not observed |
| 11 | AVPlay fallback for safe synthetic unsupported-engine case where runtime permits | NOT-AVAILABLE | GREEN: bounded alternate-engine fallback tests | Requires real AVPlay/Tizen runtime |
| 12 | Numeric zap only with capability; ~500 ms entry; invalid number no-op | NOT-AVAILABLE | GREEN: capability gate, raw-digit mode, 500 ms NumericZapBuffer, unique-number tests | Requires runtime exposing numeric key capability |
| 13 | Background provider refresh does not stop a still-working removed playing channel | NOT-AVAILABLE | GREEN: catalog refresh keeps removed playing channel test | Requires real playing stream + refresh runtime |

## Runtime bug cycle

No runtime defect is claimed or cleared because the required real Tizen runtime could not be executed. No speculative production change was made.

If a later emulator/RTL/TV run finds a defect, the required workflow is:

`reproduce -> identify root cause -> add narrow automated regression -> verify RED -> minimum fix on feature/m3g-tizen-hardening -> verify GREEN -> rerun affected runtime smoke`

## M3 acceptance criteria evidence map

The statuses below distinguish automated evidence from runtime completion. `AUTOMATED-GREEN` means deterministic automated coverage exists on the exact code SHA; it does not upgrade missing Tizen runtime evidence to PASS.

| # | Acceptance criterion | Status | Evidence / remaining gate |
| ---: | --- | --- | --- |
| 1 | Live TV can enter without implicit playback | AUTOMATED-GREEN / RUNTIME OPEN | First-entry state/controller tests; runtime smoke #1 unavailable |
| 2 | Overlay focus restore is deterministic and stable-ID-based | AUTOMATED-GREEN / RUNTIME OPEN | Stable-ID restore tests; runtime smoke #4 unavailable |
| 3 | Highlight changes never start playback implicitly | AUTOMATED-GREEN / RUNTIME OPEN | Category/highlight/state tests; runtime smoke #3 unavailable |
| 4 | SELECT starts the highlighted channel | AUTOMATED-GREEN / RUNTIME OPEN | Controller SELECT test; runtime smoke #2 unavailable |
| 5 | CH+/CH- zaps only inside active scope and does not wrap | AUTOMATED-GREEN / RUNTIME OPEN | Controller active-scope/no-wrap test; runtime smoke #5 unavailable |
| 6 | Numeric zap works only when platform/provider capability permits | AUTOMATED-GREEN / RUNTIME OPEN | Remote/platform/NumericZapBuffer/controller tests; runtime smoke #12 unavailable |
| 7 | Rapid channel intents are last-intent-wins | AUTOMATED-GREEN / RUNTIME OPEN | Intent/session stale suppression tests; runtime smoke #6 unavailable |
| 8 | Stale async results cannot override a newer intent | AUTOMATED-GREEN / RUNTIME OPEN | Stale resolve/session/recovery/retry tests; runtime smoke #6 unavailable |
| 9 | Stream resolution keeps old channel playing until disruptive handoff begins | AUTOMATED-GREEN / RUNTIME OPEN | Coordinator ordering coverage; real player handoff not observed |
| 10 | Shaka primary; AVPlay fallback bounded and non-sticky | AUTOMATED-GREEN / RUNTIME OPEN | Engine policy and fallback tests; runtime smoke #10/#11 unavailable |
| 11 | Recovery is classified and bounded | AUTOMATED-GREEN / RUNTIME OPEN | AUTH once; NETWORK/TIMEOUT twice; STREAM_NOT_FOUND no retry; fallback budget tests |
| 12 | Failed channel attempts leave overlay usable | AUTOMATED-GREEN / RUNTIME OPEN | Failed-selection controller test; runtime smoke #8 unavailable |
| 13 | Prior playback restored when technically possible after failed handoff | AUTOMATED-GREEN / RUNTIME OPEN | Session rollback tests; runtime smoke #8 unavailable |
| 14 | Back closes one UI layer at a time with no custom fullscreen exit modal | AUTOMATED-GREEN / RUNTIME OPEN | Controller/platform Back test; runtime smoke #9 unavailable |
| 15 | M4 features are not shipped as placeholders in M3 | AUTOMATED/DIFF EVIDENCE | M3 controller/view contract tests and bounded M3 wiring; no runtime-specific gate identified |
| 16 | Legacy orchestration is reduced incrementally, not rewritten wholesale | AUTOMATED/DIFF EVIDENCE | Legacy fallback/playback tests remain GREEN alongside M3 wiring |
| 17 | Exact-head CI is green for each merge candidate | BASE CANDIDATE PASS; DOCS HEAD PENDING | `main@0af80caf...` run `34286003705` SUCCESS; docs-only branch head needs its own PR exact-head CI after this evidence commit |
| 18 | Applicable Tizen-sensitive runtime smoke is recorded before claiming M3 fully complete | OPEN | Matrix recorded truthfully, but all real Tizen runtime observations are NOT-AVAILABLE; M3 fully complete must not be claimed |

## Open gates

- M2 WidgetData runtime probe: pending unless separately completed with real Tizen evidence.
- Dual-session capability spike: not required for M3 production completion; remains a future capability investigation.
- Physical-TV release acceptance: deferred to release/RC gate unless performed now.

Additional M3G gate:

- Real Emulator and/or Samsung Remote Test Lab execution of the applicable M3 smoke matrix remains required before criterion 18 can close.

Do not call M2 fully complete while its WidgetData probe is pending.

## Security/privacy evidence

- No provider credential was used or recorded.
- No provider URL was recorded.
- No resolved/transient stream URL was recorded.
- No secret header or DRM clear key was recorded.
- No runtime screenshot was captured.
- Automated baseline includes GREEN redaction coverage for transient StreamRequest/log handling.

## Conclusion

The exact code candidate `0af80caf24eab206f303f67c177a5d716fb38a6d` has a GREEN automated baseline (`200/200`, typecheck, production build, clean diff) and the branch/base/upstream gates are recorded.

M3 Tizen-sensitive runtime verification is **not complete** in this execution because no Samsung Tizen Emulator, Remote Test Lab session, or physical Samsung TV was available. The 13-item runtime matrix therefore remains `NOT-AVAILABLE`, M2 WidgetData remains `PENDING`, and physical-TV release acceptance remains `DEFERRED`.

No production bug fix or B0 implementation change was made on this docs/evidence branch.