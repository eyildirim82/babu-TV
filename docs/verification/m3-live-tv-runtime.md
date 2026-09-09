# M3 Live TV Runtime Verification

Date: 2026-09-09
Track: M3G — Tizen-sensitive runtime verification/evidence
Branch: `docs/m3-live-tv-verification`
Runtime target code SHA (session 1): `0af80caf24eab206f303f67c177a5d716fb38a6d`
Runtime target code SHA (session 2): `cb36a4f` — `docs/m3-live-tv-verification` merged with `main@688f6ab`, tree identical to `main` except this evidence file
Status: RUNTIME EVIDENCE INCOMPLETE — do not claim M3 fully complete

Session 2 (2026-09-09, later) reached a real retail Samsung set. Packaging, signing, install and launch are now PASS on real hardware. The 13-item UI smoke matrix is still open because the remote-control channel is unpaired and no screen observation has been recorded.

Session 2 then ended without UI results. The set became unreachable before pairing was accepted: `sdb devices` lists nothing and `sdb connect` returns `error: failed to connect to remote target`. No smoke was observed, so no smoke result changed.

Session 3 (2026-09-09, later still) moved to the Samsung TV emulator instead. The emulator boots and attaches, but the app cannot be installed on it yet, so the matrix is still untouched. Details below.

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
| Branch-start `main` / runtime target | PASS | `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| M3G branch starting head | PASS | `docs/m3-live-tv-verification` started at the same `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| Merge-base with concurrent `main` | PASS | Still `0af80caf24eab206f303f67c177a5d716fb38a6d` |
| Current `main` after concurrent review checkpoint | RECORDED / GREEN | `ca9c19b55045f111bbb7336006c1486abbd6f8ba`; only `docs/verification/b0-execution-status.md` changed from the runtime target; Actions run `34324051571` SUCCESS |
| Exact runtime-target verify | PASS | GitHub Actions `verify` run `34286003705`, conclusion SUCCESS |
| Open PR review | RECORDED | B0 implementation PRs were open concurrently; M3G did not modify or depend on their branch heads |
| Upstream `Nur-allhi/en-tvplayer/main` | UNCHANGED | `58bc12f755b731cad540d50a8e16cf8bb8708738`, `release: v2.0.0`, same upstream SHA recorded by the M3 plan |
| M2 WidgetData runtime gate | PENDING | ADR states no real Tizen runtime probe was completed; no PASS is inferred from unit tests, packaging, or documentation |

The concurrent `main` move from `0af80caf...` to `ca9c19b...` is a review-status documentation commit whose parent is the required runtime target SHA. It does not alter playback, Tizen, provider, storage, remote, or M3 runtime code. The M3G branch is intentionally not rebased onto that moving review-status commit so the requested runtime target and branch-start base remain explicit.

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

## Session 2 automated baseline — exact runtime candidate

Run locally on `cb36a4f` (Windows 11, Node v24.15.0, npm 11.12.1) because this session builds the artifact that is actually installed on hardware.

| Command / stage | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | 0 vulnerabilities |
| `node --test player/test/*.test.js` | 39/40 | 1 failure, see below |
| `npm run test:ts -w player` | PASS | 173/173 |
| `npm run typecheck` | PASS | exit 0 |
| `npm run brand:check` | PASS | 11 owned identity/build surfaces clean |
| `npm run build` | PASS | Vite production build, inherited 500 kB chunk warning only |

The single JS failure is `copy.d.ts matches the exact UI_COPY declaration shape`. It is a Windows checkout line-ending artifact: the assertion compares a CRLF file against an LF literal. The same tree is GREEN in CI on Linux, and a fix already exists on the local branch `fix/copy-declaration-line-endings` (`5e28851`). It is not an M3 runtime defect and was not fixed on this docs branch.

## Tizen package / signing evidence

Status: `PASS` on a real retail set.

| Stage | Result | Evidence |
| --- | --- | --- |
| `npm run tizen:build` | PASS | staged `tizen/build` from a `--base=./` Vite build |
| `TIZEN_PROFILE=samsung npm run tizen:package` | PASS | signed `babustv_beta_v1.10.1_cb36a4f.wgt`, 315.8 KB |
| Author certificate | PASS | Samsung VD Author CA profile `samsung` |
| Distributor certificate | PASS | Samsung VD DEVELOPER Public CA, bound to the target set DUID |
| Install on retail TV | PASS | `vd_appinstall` reached `install completed` |
| Launch on retail TV | PASS | `was_execute BabusTVApp.BabusTV` reported `launched` |
| On-device identity | PASS | `applist` reports `'BABUŞ TV' 'BabusTVApp.BabusTV'` |

No certificate password, private key, DUID value, or provider material is recorded in this document. The signed artifact name carries the exact head short SHA so the installed build is traceable.

### SDK defect blocking the documented deploy path

`node tizen/deploy.mjs` fails before it reaches the device:

```
java.lang.NullPointerException: null
	at org.tizen.ncli.util.TargetUtil.getTargets(TargetUtil.java:96)
	at org.tizen.ncli.subcommands.target.InstallCLICommand.setTarget(InstallCLICommand.java:182)
```

`tizen install -s <serial>` and `tizen run -s <serial>` both crash in the CLI target lookup while `sdb devices` lists the set correctly. This is a Tizen Studio CLI defect, not an M3 runtime defect, so no production change was made here. Install and launch were completed through the TV's own `vd_appinstall` / `was_execute` commands over `sdb`. A repository-side fallback for this already exists as an unpushed local commit (`c68b519` on `chore/tizen-real-tv-deploy`); promoting it is packaging/tooling scope, not M3G scope.

## Session 3 — emulator attempt

The Samsung TV emulator image `tv-samsung-10.0-x86_64`, VM `tv-emu`, template HD1080 TV at 1920x1080, is installed on the verification host and hardware acceleration is available. The VM boots, attaches as `emulator-26101`, and its guest shell answers about 80 seconds after launch.

| Step | Result | Evidence |
| --- | --- | --- |
| Emulator launch | PASS | `em-cli launch -n tv-emu`, guest shell responds |
| Push package to emulator | PASS | 315.8 KB transferred |
| Install on emulator | FAIL | `install failed[118, -12], reason: Check certificate error : :Invalid format of certificate in signature.:<-2>` |
| Emulator device log | NOT-AVAILABLE | `dlog -d` returns nothing on this image, same as the retail set |

The install failure is expected and is not an app defect. The available signed artifact carries the Samsung retail distributor certificate, which is bound to the physical set and which the emulator refuses. An emulator run needs a Tizen developer profile instead.

Building that profile is blocked on this host by three separate Tizen Studio defects, on top of the CLI target-lookup crash already recorded:

1. `tizen security-profiles list` and `add` throw `NullPointerException` in `SigningProfile.readProfileItem` whenever a profile entry stores its password as a path to a `.pwd` file. The bundled password encryptor still writes that file format, but the Java side of the same SDK build can no longer read it. Entries that carry the password inline load without complaint, which isolates the defect to the file-path form.
2. `tizen certificate` reports its parameters and exits without writing any keystore file.
3. The pre-existing `dev` profile entry, restored from the host's own backup, reproduces defect 1 and had to be removed again.

A replacement author certificate signed by the SDK's bundled Tizen Developers CA was generated successfully with OpenSSL and is held outside the repository. It cannot be used yet: a profile entry that loads is not enough, because packaging then fails with `CertificationException: Invaild password` when the inline value is not in the SDK's own encrypted form. Producing that form, or re-wrapping the SDK signer key to avoid it, is credential handling that this session deliberately did not carry out on its own. The host's `profiles.xml` was returned to its original single-profile state and verified to load cleanly, and the two scratch files written into the SDK tree were removed.

Closing the emulator path therefore needs one human step: create a Tizen developer security profile through Certificate Manager, or supply an already-working one. Everything after that is automatable, and the emulator itself is proven to boot and accept transfers.

Emulator results, once they exist, must be labelled `EMULATOR-PASS` rather than `PASS`. The image is Tizen 10.0 while the retail set is Tizen 9.0, and emulator AVPlay and Shaka behaviour is not equivalent to a real set.

## Runtime environment

| Field | Value |
| --- | --- |
| Samsung Tizen Emulator | NOT-AVAILABLE |
| Samsung Remote Test Lab | NOT-AVAILABLE |
| Physical Samsung set | AVAILABLE — connected over `sdb` at port 26101 |
| Model | `LS43FM700UUXUF` |
| Platform version | Tizen 9.0, `profile_name:tv`, `cpu_arch:armv7`, `sdbd_version:2.2.31` |
| Developer mode | enabled; the set reports this host as its developer IP |
| Device log | NOT-AVAILABLE — `dlog` returns an empty stream on this retail set, so no console/runtime log evidence can be captured |
| Remote key channel | NOT-AVAILABLE — the remote-control WebSocket answers `ms.channel.unauthorized`; pairing must be accepted on the set |
| Screen observation | NOT-AVAILABLE — no screen capture path exists on a retail set, so UI results need a human observer |
| Test data | Synthetic/test data required; no real provider material recorded |
| Screenshots | None captured |

Hardware is now reachable, but the two channels the UI matrix depends on are not. Driving the smokes needs an accepted remote-control pairing and a person watching the screen. Until both exist, the matrix below deliberately contains no runtime PASS results. Automated evidence is corroboration only and never substitutes for the missing runtime observation.

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
| 17 | Exact-head CI is green for each merge candidate | BASE CANDIDATE PASS; DOCS HEAD PENDING | `main@0af80caf...` run `34286003705` SUCCESS; docs-only branch head needs its own PR exact-head CI after the final evidence commit |
| 18 | Applicable Tizen-sensitive runtime smoke is recorded before claiming M3 fully complete | OPEN | Matrix recorded truthfully, but all real Tizen runtime observations are NOT-AVAILABLE; M3 fully complete must not be claimed |

## Open gates

- M2 WidgetData runtime probe: pending unless separately completed with real Tizen evidence.
- Dual-session capability spike: not required for M3 production completion; remains a future capability investigation.
- Physical-TV release acceptance: deferred to release/RC gate unless performed now.

Additional M3G gates:

- Execution of the applicable M3 smoke matrix remains required before criterion 18 can close. Session 2 removes the hardware obstacle; what remains is an accepted remote-control pairing plus a human observer for the screen.
- Retail-set logging is unavailable, so every UI smoke result must come from direct screen observation and must name the observer and the exact head.
- A synthetic playlist reachable from the set is required before the playback, zap, failure-rollback and refresh smokes can run at all.

A third session needs all of the following before the matrix can move:

1. The set powered on, in developer mode, and answering `sdb connect` on port 26101.
2. Device Connect Manager access granted, so the remote-control WebSocket returns a token instead of `ms.channel.unauthorized`.
3. A named human observer at the screen, since the set gives neither logs nor screen capture.
4. A synthetic playlist served on the local network and entered in the app.

The installed build is already the correct candidate, so a third session can start at the smoke matrix rather than repeating the packaging chain, as long as the head under test is still `cb36a4f` or is re-recorded.

Do not call M2 fully complete while its WidgetData probe is pending.

## Security/privacy evidence

- No provider credential was used or recorded.
- No provider URL was recorded.
- No resolved/transient stream URL was recorded.
- No secret header or DRM clear key was recorded.
- No runtime screenshot was captured.
- Automated baseline includes GREEN redaction coverage for transient StreamRequest/log handling.
- Signing used the existing local Samsung profile. No certificate path content, password, private key, or set DUID value is reproduced in this document.
- The set's own network address and developer-mode host address were observed during connection checks and are deliberately not written down here.
- Verification helpers written for this session live outside the repository, in the session scratchpad, and are not part of any branch.

## Conclusion

The exact runtime target `0af80caf24eab206f303f67c177a5d716fb38a6d` has a GREEN automated baseline (`200/200`, typecheck, production build, clean diff), and the M3G branch was created from that exact GREEN main. A later concurrent `main` move to `ca9c19b55045f111bbb7336006c1486abbd6f8ba` changed only the review-owned B0 execution-status document and is independently GREEN; it does not alter the runtime target code.

Session 2 verified the same code as current `main` at merge head `cb36a4f`, whose only difference from `main@688f6ab` is this evidence file. On that head the packaging chain is proven end to end on real hardware: signed with the Samsung profile, installed on the retail set `LS43FM700UUXUF` running Tizen 9.0, launched, and listed on the device as `BABUŞ TV`. Session 1's `NOT-AVAILABLE` verdict on packaging and signing is therefore superseded.

M3 Tizen-sensitive runtime verification is still **not complete**. The 13-item UI smoke matrix remains `NOT-AVAILABLE` because the retail set exposes neither a device log nor a screen capture path, and its remote-control channel is unpaired. M2 WidgetData remains `PENDING` and physical-TV release acceptance remains `DEFERRED`.

One defect was found and reproduced: the Tizen Studio CLI crashes in its own target lookup, which blocks the documented `tizen install` deploy path. It is SDK tooling, not M3 runtime behaviour, and no production or B0 implementation change was made on this docs/evidence branch.