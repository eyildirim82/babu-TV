# BabuşTV V1 RC Readiness Board

**Date:** 2026-09-15\
**Owner:** REVIEW / Integration Controller\
**Status:** RC CANDIDATE `1.0.0-rc.2` PRODUCED AND TAGGED (SUPERSEDES rc.1) — WAVES 0–5 CLOSED GREEN; RC-BROWSER CLOSED GREEN; RC-PACKAGE rc.1 AND rc.2 CLOSED GREEN; PHONE-PAIRING RELAY LIVE (#144–#146); rc.3 NOT YET PRODUCED; PHYSICAL-TIZEN DEBT PENDING/DEFERRED\
**Starting baseline:** `main@f3061cbad574b507b1f80cf23e19b8af179e90b0`\
**Baseline verify:** `34414698392` SUCCESS\
**Latest evidence head:** `main@f1ddb8c` (default pairing relay config, PR #146); post-merge verify `34941573975` and relay-cloudflare `34941574025` SUCCESS

## Purpose

This is the canonical status/evidence board for work between the completed B0 + Xtream integration baseline and the first BabuşTV V1 release candidate.

It separates:

- repository implementation work that can proceed without a physical TV;
- deterministic browser/build/security evidence;
- physical-Tizen acceptance that must remain pending/deferred until an applicable runtime is available.

Detailed roadmap: `docs/superpowers/plans/2026-09-10-babustv-v1-rc-roadmap.md`.

Maximum-parallel execution design: `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md`.

Live role/dependency board: `docs/verification/v1-parallel-execution.md`.

RC-BROWSER evidence board: `docs/verification/rc-browser-execution.md`.

RC-PACKAGE evidence boards: `docs/verification/rc-package-execution.md` (rc.1) and `docs/verification/rc-package-rc2-execution.md` (rc.2).

Approved product spec: `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `CLOSED GREEN` | Integrated and verified on the required repository gates |
| `PLANNED` | In V1 RC scope; implementation has not started |
| `IN PROGRESS` | Active scoped branch/PR exists |
| `BLOCKED` | Repository work cannot proceed because a concrete dependency is unsatisfied |
| `PENDING` | Required evidence has not yet been obtained |
| `DEFERRED` | Intentionally postponed because the required external environment is unavailable |
| `NOT-AVAILABLE` | A specific verification command/environment is unavailable; not a PASS |

## Current baseline

| Area | Status | Evidence / note |
| --- | --- | --- |
| B0 brand/product separation | `CLOSED GREEN` | B0A–B0G merged |
| Provider Core registration hardening | `CLOSED GREEN` | PR #28 merged |
| Xtream onboarding core | `CLOSED GREEN` | PR #29 merged |
| Xtream remote-first entry UI | `CLOSED GREEN` | PR #30 merged |
| Xtream application integration | `CLOSED GREEN` | PR #31 merged; post-merge product baseline `640e503...` GREEN |
| Docs closeout baseline | `CLOSED GREEN` | `main@f3061cb...`; verify `34414698392` SUCCESS |
| Maximum-parallel execution design | `CLOSED GREEN` | design and RC-F0 bounded plan integrated before production start |
| RC-F0 shared contracts | `CLOSED GREEN` | PR #37 squash-merged; resulting `main@aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`; post-merge verify `34487321835` SUCCESS |
| Wave 1 implementation base | `CLOSED GREEN` | common exact base frozen at `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` (historical) |
| Wave 1 bounded plan pack | `CLOSED GREEN` | 13 independent core roles had controller-authored bounded plans (PR #40) |
| Wave 1 core lanes | `CLOSED GREEN` | 13 core roles #41–#49, #51, #72–#74, plus `PAIR-WEB` #79; last post-merge verify `34610551534` (`8d6a94a`) SUCCESS |
| Wave 2 persistence/provider integration | `CLOSED GREEN` | #52, #53, #54, #56, #57; last post-merge verify `34521303374` (`7b9b61c`) SUCCESS |
| Wave 3 UI lanes | `CLOSED GREEN` | #58–#65, #71; last post-merge verify `34568048330` (`3a4d60d`) SUCCESS |
| Wave throughput policy | `CLOSED GREEN` | `docs/verification/wave-throughput-policy.md` (`8c1c14a`, `92af4f5`); verify `34612781820`, `34612837592` SUCCESS |
| Wave 4 composition | `CLOSED GREEN` | #70, #78, #84, #87, plus provider integration #83, #86; last post-merge verify `34685628558` (`0cdc1ed`) SUCCESS |
| Wave 5 hardening | `CLOSED GREEN` | #88, #90, #92, #93, #94, #95, #96; last post-merge verify `34707993412` (`409e416`) SUCCESS |
| RC-BROWSER production fixes | `CLOSED GREEN` | #105 `3ed999f`, #119 `49c9e3e`, #129 `ac8a346`, #130 `69b4d72`, #131 `8b0f340`, #134 `eaa928c`; hardening #133 `0eb86cf`; each post-merge verify SUCCESS |
| RC-BROWSER qualification | `CLOSED GREEN` | accepted 2026-09-14 against production `eaa928c` (head `aca5f44`, 76/76 PASS, `rc-browser` run `34838069268` attempts 1 and 2); PR #132 merged to `main@450f681`; post-merge verify `34846072550` SUCCESS |
| V1 RC versioning decision | `CLOSED GREEN` | independent `1.0.0-rc.1` line; see "V1 RC versioning decision" below |
| RC FIX version prerelease | `CLOSED GREEN` | #135 `29c2e0f`; post-merge verify `34849186407` SUCCESS |
| Control boards refresh | `CLOSED GREEN` | #136 `6773ca1`; post-merge verify `34849192504` SUCCESS |
| RC-PACKAGE qualification | `CLOSED GREEN` | accepted 2026-09-14 for `1.0.0-rc.1` at package candidate `c3c9709` (verify `34849865998`); PR #137 merged to `main@4afeef4` by merge commit; post-merge verify `34851391827` SUCCESS (JS 62/62, TS 620/620) |
| Release tag `v1.0.0-rc.1` | `CLOSED GREEN` | annotated tag at package candidate `c3c9709`; no GitHub Release; superseded by rc.2 |
| RC FIX browser demo findings | `CLOSED GREEN` | #139 merged to `main@a7fe8f9` by merge commit (`f6809f1`, `b9d77d1`, `3fa7910`, `3dda382`, `569e2cc`); post-merge verify `34860215716` SUCCESS (JS 68/68, TS 628/628); local rc-browser 76/76 |
| RC-PACKAGE qualification rc.2 | `CLOSED GREEN` | accepted 2026-09-14 for `1.0.0-rc.2` at package candidate `77b0a5b` (verify `34860514185`); PR #140 merged to `main@e4a6bca` by merge commit; post-merge verify `34861410744` SUCCESS (JS 68/68, TS 628/628) |
| Release tag `v1.0.0-rc.2` | `CLOSED GREEN` | annotated tag at package candidate `77b0a5b`; no GitHub Release |
| RC FIX rc.2 follow-ups | `CLOSED GREEN` | #142 merged to `main@3f86fa4` by merge commit (`00449dc`, `487f8dd`, `9385168`, `be6e8f4`); post-merge verify `34866709641` SUCCESS (JS 68/68, TS 637/637); local rc-browser 76/76; not yet packaged |
| RC FIX onboarding and cleanups | `IN PROGRESS` | branch `fix/rc3-onboarding-cleanups`: interrupted-onboarding discard (`e4e8727`), BabuşTV-only What's New (`bf8ebb3`), Tizen signing-profile preflight (`c5b3f37`); merge pending user approval |
| Open implementation blocker | none | physical-Tizen debt is not a repository blocker |

Every PR listed on this board merged to `main` with a SUCCESS post-merge `verify` run. Per-role merge SHAs and run IDs are recorded in `v1-parallel-execution.md`.

## RC product implementation queue

This table remains product-level. Evidence lists the merged PRs that implement each package; the worker decomposition, merge SHAs and verify runs are tracked in `docs/verification/v1-parallel-execution.md`.

| Order | Work package | Status | TV required to implement? | Exit condition | Evidence |
| ---: | --- | --- | --- | --- | --- |
| 0 | RC-F0 shared contracts | `CLOSED GREEN` | No | common EPG/user-state/capability seams frozen without feature behavior | #37 |
| 1 | M4 EPG core/integration | `CLOSED GREEN` | No | normalized current/next/detail + bounded cache/query + malformed/large-data tests | #41 #42 #45 #47 #49 #53 #56 |
| 2 | M4 Live TV EPG presentation | `CLOSED GREEN` | No | remote-first EPG UI + missing-EPG degradation + 1920×1080 evidence | #59 #70 |
| 3 | M4 Favorites | `CLOSED GREEN` | No | provider-scoped stable-ID durable favorites + virtual Favorites scope | #48 #52 #58 #70 |
| 4 | M4 Local Search | `CLOSED GREEN` | No | Turkish-safe local search + large-list benchmark + highlight≠playback preserved | #51 #62 #70; RC fix #134 |
| 5 | M4 Channel Options | `CLOSED GREEN` | No | core actions reachable with six basic remote actions | #60 #70 |
| 6 | M3U Provider-Core onboarding parity | `CLOSED GREEN` | No | modern M3U add/validate/register/sync/activate flow; no credential leakage | #43 #54 #61 |
| 7 | M5 Watch State | `CLOSED GREEN` | No | last watched + meaningful watch stats + provider-scoped frequently-watched state | #44 #46 #57 |
| 8 | M5 Home | `CLOSED GREEN` | No | Provider / Last Watched / Live TV / Favorites / Frequently Watched / Settings flow | #64 #71 #78 |
| 9 | M5 Provider Management | `CLOSED GREEN` | No | switch/add/edit/delete with provider-scoped cleanup | #63 #78 #83 #86; RC fix #105 |
| 10 | M5 First Run | `CLOSED GREEN` | No | short branded Provider Ekle flow; later boots remain restrained | #65 #78 |
| 11 | M6 Secure Pairing | `CLOSED GREEN` | No for protocol/browser development | ephemeral encrypted single-use pairing + public/self-host-compatible relay contract | #72 #73 #74 #79 #84 #87; RC fix #131; relay server #144, Cloudflare relay #145, default public relay config #146 (deployed 2026-09-14) |
| 12 | M7 Hardening | `CLOSED GREEN` | No for deterministic matrix | large/malformed/offline/migration/focus/security cases GREEN | #88 #90 #92 #93 #94 #95 #96 |
| 13 | Browser Release Matrix | `CLOSED GREEN` | No | deterministic 1920×1080 release smoke GREEN | #132 → `main@450f681`; `docs/verification/rc-browser-execution.md` |
| 14 | Tizen build/package RC gate | `CLOSED GREEN` | No for build; environment-dependent for package signing | available package/staging gates GREEN, unavailable paths honestly classified | #135 → #137 `main@4afeef4` (rc.1); #139 → #140 `main@e4a6bca` (rc.2); `docs/verification/rc-package-execution.md`, `docs/verification/rc-package-rc2-execution.md` |
| 15 | V1 RC versioning decision | `CLOSED GREEN` | No | explicit choice: independent `1.0.0-rc.1` line or inherited version continuation | controller decision 2026-09-14: independent `1.0.0-rc.1`; constraints below |

Product defects found by RC-BROWSER qualification were fixed on `main` through #105, #119, #129, #130, #131 and #134; #119 integrated a set of product fixes across several packages. #133 is WidgetData credential-store hardening.

### V1 RC versioning decision

Controller decision 2026-09-14: BabuşTV takes an independent `1.0.0-rc.1` → `1.0.0` version line instead of continuing the inherited `1.10.1`.

Verified constraints on `main@450f681`:

- `tizen/stage.mjs` (`npm run tizen:build`) and `tizen/package.mjs` copy the `package.json` version into the staged `config.xml` widget version. Every staged build so far therefore carried `1.10.1`, although source `tizen/config.xml` says `1.0.0`.
- Tizen widget versions must be numeric `x.y.z`; a prerelease suffix must not reach the staged `config.xml`.
- `player/src/update.js` `compareVersions` splits on `.` and compares numbers only; it does not understand prerelease tags.

Sequence:

1. prerequisite RC FIX #135 (`29c2e0f`) derives a numeric Tizen widget version and makes update comparison prerelease-aware — merged;
2. RC-PACKAGE applied the `1.0.0-rc.1` bump (`c3c9709`) from post-fix `main` and merged as #137 (`4afeef4`).

Upgrade note: legacy EN TV Player installs used Tizen package `IPTVPlayer`. Since B0A (#18, 2026-09-09) the package is `BabusTVApp`, so those installs are a separate Tizen application, not an in-place upgrade target. Only `BabusTVApp` developer/emulator installs built at `1.10.1` will see a lower widget version and need one uninstall/reinstall.

## Parallel execution overlay

All role waves in `v1-parallel-execution.md` up to hardening are integrated: Wave 0 (RC-F0), Wave 1 core lanes, Wave 2 persistence/provider integration, Wave 3 UI lanes, Wave 4 composition and Wave 5 hardening are `CLOSED GREEN`, each role through a merged PR with a SUCCESS post-merge `verify` run.

Wave 6 state:

- `RC-BROWSER` is `CLOSED GREEN`: PR #132 (`verification/v1-rc-browser-h2`) merged to `main@450f681` with a merge commit that preserves the qualification SHAs; post-merge verify `34846072550` SUCCESS;
- `RC-PACKAGE` is `CLOSED GREEN`: PR #137 (`verification/v1-rc-package`) merged to `main@4afeef4` with a merge commit that keeps package candidate `c3c9709` reachable; post-merge verify `34851391827` SUCCESS.

History: Wave 1 production branches started from the frozen base `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` (post-RC-F0 verify `34487321835`); it is not a base for new work.

## Required per-package workflow

Each production package must have a bounded scope and independent review gate:

```text
fresh exact GREEN allowed base
  → approved role spec/plan
  → characterization
  → RED
  → minimum implementation
  → focused GREEN
  → full regression/typecheck/build/security gates
  → exact diff + file-ownership review
  → browser/Tizen evidence as applicable
  → Draft PR
  → controller review
  → explicit merge authority
  → post-merge main GREEN
```

Parallel work is allowed only when file ownership and semantic dependencies do not overlap. Dependent packages must wait for their required predecessor to merge and return GREEN.

## RC deterministic release matrix

Before an RC is declared ready, record evidence for these scenarios where applicable. Scenario IDs refer to the RC-BROWSER scenario matrix in `docs/verification/rc-browser-execution.md` (production `eaa928c`, run `34838069268`).

| Scenario | Required before RC | Physical TV required? | Current status |
| --- | --- | --- | --- |
| Cold boot / branded shell | Yes | No | `CLOSED GREEN` (RC-BROWSER H0-SMOKE, A01, BROW-SECPAIR-S01) for cold boot to First Run with default focus and clean console; branding rests on `brand:check` PASS at `aca5f44`, not on a visual browser assertion |
| Xtream add / fail / success | Yes | No | `CLOSED GREEN` (RC-BROWSER A02, A03, A04, BROW-SECPAIR-S05-*) |
| M3U add / fail / success | Yes | No | `CLOSED GREEN` (RC-BROWSER A05, A06) |
| Home and default focus | Yes | No | `CLOSED GREEN` (RC-BROWSER B01, A04) |
| Provider switching | Yes | No | `CLOSED GREEN` (RC-BROWSER A07, A08, C06) |
| Live TV overlay/navigation | Yes | No | `CLOSED GREEN` (RC-BROWSER B02, B03, B10, P08-P10-layer-focus-back) |
| Explicit channel play vs highlight | Yes | No | `CLOSED GREEN` (RC-BROWSER P01-P02-explicit-play, B02, B07, P12-single-item) |
| CH± logical behavior | Yes | No | `CLOSED GREEN` (RC-BROWSER P03-P04-last-intent-wins: logical `ChannelUp`/`ChannelDown` simulation); physical CH± keys stay `DEFERRED` |
| Numeric zap logical behavior | Yes | No | unit/deterministic coverage (`player/test-ts/live-tv-controller.test.ts` numeric commit); browser matrix only proves a digit typed into Search does not zap (P10-search-focus); positive numeric zap not in browser matrix; physical numeric keys stay `DEFERRED` |
| EPG present/missing/broken | Yes | No | `CLOSED GREEN` (RC-BROWSER B08, B09, C09) |
| Favorites | Yes | No | `CLOSED GREEN` (RC-BROWSER B04, B05, C02, C04) |
| Search | Yes | No | `CLOSED GREEN` (RC-BROWSER B06, B07, P10-search-focus; requalified after #134) |
| Last Watched | Yes | No | `CLOSED GREEN` (RC-BROWSER C03, C05) for browser-established Last Watched persistence and provider isolation; B01 covers the no-entry Home fallback |
| Frequently Watched | Yes | No | unit/deterministic coverage (`watch-score`, `home-domain`, `m5-app-composition`, `m7-perf-hardening` tests); not in browser matrix |
| Settings/provider management | Yes | No | `CLOSED GREEN` (RC-BROWSER A07–A10, A12, C08) via the Home Settings entry to Provider Management; no separate app-settings assertion |
| Offline/provider failure | Yes | No | `CLOSED GREEN` (RC-BROWSER A03, A11, BROW-SECPAIR-S05-*, B09, C09, P05, P07, P15-failure-sanitization) |
| Cache fallback | Yes | No | `CLOSED GREEN` (RC-BROWSER A11, C09) |
| Back/layer ownership | Yes | No | `CLOSED GREEN` (RC-BROWSER A10, B10, P08-P10-layer-focus-back, P10-search-focus, BROW-SECPAIR-S12-TV-BACK) |
| Focus restoration | Yes | No | `CLOSED GREEN` (RC-BROWSER A07, B11, P08-P10-layer-focus-back, P11-deleted-reordered-focus) |
| Reduced motion | Yes | No | `CLOSED GREEN` for Live TV (RC-BROWSER P14-reduced-motion); other final surfaces are not asserted under reduced motion in the browser matrix |
| Secret/log/artifact audit | Yes | No | `CLOSED GREEN` (RC-BROWSER BROW-SECPAIR-S02, S03-S04-S13, S09, S14-S15, S16, C12, C13; static `tools/check-m7-security-privacy.mjs` PASS; SEC #96) |

## Physical-Tizen evidence debt

These rows are not repository implementation blockers while TV access is unavailable, but they block final `BabuşTV 1.0.0` release acceptance.

| Gate | Current status | Required evidence |
| --- | --- | --- |
| M2 WidgetData credential-store runtime probe | `PENDING` | API access + synthetic write/read + relaunch persistence + replace + remove + absence + sanitized failure |
| M3 13-row Live TV UI/playback runtime matrix | `DEFERRED` | directly observable supported Tizen runtime with remote/human/screen evidence |
| Real optional Samsung keys | `DEFERRED` | supported-key discovery and behavior on device |
| Real CH± / numeric keys | `DEFERRED` | physical remote acceptance |
| Shaka → AVPlay/native fallback | `DEFERRED` | reproducible on-device fallback evidence |
| Lifecycle / suspend / resume / relaunch | `DEFERRED` | real-device lifecycle smoke |
| Back / exit convention | `DEFERRED` | real Samsung behavior observed |
| Repeated real-device zapping | `DEFERRED` | stability and interruption observation |
| Long playback / memory | `DEFERRED` | extended physical-runtime session |
| On-device network loss/recovery | `DEFERRED` | observable recovery/failure behavior |
| Persisted settings/provider after relaunch | `DEFERRED` | real Tizen persistence check |
| Supported Tizen floor/model acceptance | `DEFERRED` | applicable hardware/RTL/emulator matrix |
| Final release install/package smoke | `DEFERRED` | candidate WGT installed and exercised on release-truth environment |
| Phone pairing on a physical TV | `PENDING` | real phone camera scans the TV QR, provider arrives through the public relay, TV registers it; needs a package containing #146 |

No row in this table may be converted to PASS solely because unit tests, browser smoke, package construction, install, or launch succeeded.

## RC command gate

Expected repository commands at the first RC candidate:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
npm run tizen:package
```

For every command record:

- exact candidate head;
- command;
- exit result;
- relevant test counts/output summary;
- any `NOT-AVAILABLE` environmental limitation;
- clean-diff status.

## Security/privacy release gate

Final audit must demonstrate that active source, storage, logs, errors, screenshots, and CI artifacts do not expose:

- passwords;
- credential-bearing provider URLs;
- tokens;
- transient stream URLs;
- decrypted pairing payloads;
- plaintext Provider Core credentials in localStorage or ordinary IndexedDB.

Synthetic/fake provider data only in public CI and screenshots.

## Controller state

Current controller state (2026-09-15):

- Waves 0–5 are integrated on `main`; every role PR merged with a SUCCESS post-merge `verify` run (per-role evidence in `v1-parallel-execution.md`);
- RC-BROWSER was accepted under Task 13 on 2026-09-14 against production `eaa928c`, qualification head `aca5f44`, integrated suite 76/76 PASS in `rc-browser` run `34838069268` attempts 1 and 2 with no retried scenario;
- PR #132 merged to `main@450f681` with a merge commit (qualification SHAs preserved); post-merge verify `34846072550` SUCCESS; RC-BROWSER is `CLOSED GREEN`;
- qualification found deterministic production defects, fixed on `main` by #105, #119, #129, #130, #131 and #134; #133 is credential-store hardening;
- GitGuardian incident `37220448` on #132 is the synthetic `RC_SECRETS.xtreamPassword` leak canary in `tools/rc-browser/fixtures/common.mjs`; classified as a false positive and merged by controller decision;
- V1 RC versioning decision taken: independent `1.0.0-rc.1` → `1.0.0` line (queue row 15);
- RC FIX #135 merged (`29c2e0f`, verify `34849186407`); control boards refreshed by #136 (`6773ca1`, verify `34849192504`);
- RC-PACKAGE was accepted on 2026-09-14 for `1.0.0-rc.1` at package candidate `c3c9709`; PR #137 merged to `main@4afeef4` with a merge commit; post-merge verify `34851391827` SUCCESS; RC-PACKAGE is `CLOSED GREEN`;
- per the RC completion rule, RC candidate `1.0.0-rc.1` was produced and tagged `v1.0.0-rc.1` at `c3c9709`;
- a desktop-browser run of rc.1 at 1920×1080 found defects the RC-BROWSER matrix had not caught (First Run logo path, IndexedDB key-ordered channels/categories, unpinned Home/Provider Management, `inset` and undefined tokens, unstyled Live TV feature panel, indistinguishable M3U providers); they were root-caused and fixed in #139 (`main@a7fe8f9`);
- RC candidate `1.0.0-rc.2` was accepted at package candidate `77b0a5b`, merged by #140 (`main@e4a6bca`, post-merge verify `34861410744`), and tagged `v1.0.0-rc.2`; it supersedes rc.1;
- local author+distributor signed WGTs existed on the controller machine only and were never distributed: rc.1 `babustv_beta_v1.0.0-rc.1_c3c9709.wgt` (SHA-256 `7601527b…99173e`, still preserved) and rc.2 `babustv_beta_v1.0.0-rc.2_77b0a5b.wgt` (SHA-256 `ea127ca6…18acecf1`, accidentally deleted during the 2026-09-15 cleanup; unpacked signed contents preserved; see `docs/verification/branch-cleanup-2026-09-15.md`);
- rc.1 and rc.2 both carry Tizen widget version `1.0.0`; same-version install behaviour is a physical-device check;
- #139 follow-ups closed by #142: Live TV channel, category and Search rows now scroll into view (the channel list had the same defect, found with a 60-channel playlist; the RC matrix uses 11 channels); Home "Sık İzlenenler" empty-state message; Xtream server edit relabels the provider; IndexedDB `getAll` audit found no other order-dependent read, and `MemoryStructuredStore` now lists rows in primary-key order;
- legacy root-absolute routes (`/log`, `/api/fetch`, `/proxy/`) investigated 2026-09-14, no change: in the staged `file://` build all three resolve to package-local URLs and are rejected without any network request; `/log` failures are swallowed and rc-browser uses `/log` levels as its playback-error signal; `/proxy/` rewriting only applies to `https:` pages; the legacy-shell proxy toggle cannot work on a TV with no proxy server (unchanged);
- RC-PACKAGE observations fixed by #143 (`main@5eb8e18`, post-merge verify `34886040249`): What's New now lists BabuşTV releases instead of inherited EN TV Player 1.x history; `tizen/wgt.mjs` stops before signing and lists profiles when the requested profile is missing;
- RC-BROWSER interrupted-onboarding observation fixed by #143: boot discards providers that never completed a first sync;
- open non-blocking RC-BROWSER observations: phone relay HTTP 500 shown with the network copy (product wording decision), B06 Search passed without retry in the RC-PACKAGE local run;
- M6 public relay gap closed. The merged pairing code had no relay server and no build supplied `BABUSTV_PAIRING_CONFIG`, so packaged builds could not pair:
  - #144 (`main@9c28e85`, verify `34887479016`) added the self-hostable ciphertext-only Node relay after three independent review rounds;
  - #145 (`main@36264ec`, verify `34894744390`, relay-cloudflare `34894744526`) added the Cloudflare Worker + single in-memory Durable Object deployment chosen in ADR 0003, and removed literal NUL bytes that #144 had left in `relay/src/memory-rate-limiter.ts`;
  - #146 (`main@f1ddb8c`, verify `34941573975`, relay-cloudflare `34941574025`) enabled pairing in normal builds via `player/public/pairing-config.js`;
- the owner deployed the relay on 2026-09-14 (version `1c2adf63-23bf-4a47-8a89-fdc8d96cd262`) and renamed the e-mail-derived `workers.dev` subdomain to `babustv`. Live checks and a live end-to-end desktop pairing (local TV build → live relay → deployed phone page → provider registered) passed with synthetic data (`docs/verification/pairing-relay-cloudflare.md`). Wrangler was logged out afterwards. The dashboard Observability setting has not been checked on screen;
- `1.0.0-rc.3` is not produced: the owner asked on 2026-09-14 and again on 2026-09-15 to package last, so the rc.1/rc.2 WGTs do not contain #142–#146;
- 31 historical Wave 3B, Wave 3C, M7 and RC-BROWSER plans, specs and boards that existed only on unmerged docs branches were imported with historical banners on 2026-09-15. The remaining unmerged branches are CI verification/evidence branches or PRs superseded by merged work, and are not merge candidates;
- 2026-09-15 handover cleanup: 124 finished remote branches deleted (tips recorded in `docs/verification/branch-cleanup-2026-09-15.md`), 61 CI evidence and historical docs branches kept, two local-only branches published as Draft PRs #148 and #149, inherited EN-IPTV Player WGTs and `tizen/config.xml.bak` removed from the tree, `HANDOVER.md` added;
- physical-Tizen debt rows are unchanged and remain `PENDING`/`DEFERRED`;
- old B0/M3G/Xtream worker branches and the Wave 1 base are historical evidence, not implementation bases;
- merge authority remains Controller / explicit user instruction.

## RC completion rule

An RC candidate may be produced when all TV-optional V1 work and deterministic release gates are GREEN, with external physical-Tizen rows explicitly still `PENDING`/`DEFERRED`.

Final `BabuşTV 1.0.0` may be called release-accepted only after the mandatory physical-Tizen debt is satisfied.
