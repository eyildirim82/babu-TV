# RC-PACKAGE Evidence Board — 1.0.0-rc.2

Date: 2026-09-14
Owner: REVIEW / Integration Controller
Status: CLOSED / GREEN — accepted 2026-09-14 for `1.0.0-rc.2` at package candidate `77b0a5b`; PR #140 merged to `main@e4a6bca`, post-merge verify `34861410744` SUCCESS; tagged `v1.0.0-rc.2`; physical Samsung/Tizen install and runtime rows remain NOT VERIFIED / DEFERRED

Method and check definitions: `docs/verification/rc-package-execution.md` (rc.1). This board records only what differs and the rc.2 results. The controller's `ACCEPTED` decision is recorded under "Controller acceptance record"; `CLOSED / GREEN` follows once this branch is merged to `main` with a SUCCESS post-merge verify.

## Why rc.2

`v1.0.0-rc.1` (tag at `c3c9709`) was run in a desktop browser at 1920×1080 before physical-device testing. That run surfaced defects the RC-BROWSER matrix had not caught. They were root-caused and fixed in #139, merged to `main@a7fe8f9` (post-merge verify `34860215716` SUCCESS: JS 68/68, TS 628/628).

| #139 commit | Defect |
| --- | --- |
| `f6809f1` | First Run logo used a root-absolute path. It broke under `/babustv/` and was present in the rc.1 WGT bundle. The rc-browser harness route that masked it was removed. |
| `b9d77d1` | IndexedDB key order reordered channels and categories (1,3,4,5,2), and CH± followed that order |
| `3fa7910` | Home and Provider Management were not pinned to the viewport ("Ayarları Aç" was clipped); `inset` shorthand is unsupported on Tizen 5.0; twelve undefined design tokens were used in First Run and TV pairing |
| `3dda382` | Unstyled Live TV feature panel from #70; the focused action had no visible focus |
| `569e2cc` | Two M3U providers were indistinguishable; now shown as "M3U", "M3U 2" (display-only, M3U privacy rule unchanged) |

## Exact identities

| Item | Value |
| --- | --- |
| Candidate version | `1.0.0-rc.2` (`package.json`, `player/package.json`, `package-lock.json`, `version.json`) |
| Tizen widget version | `1.0.0` (unchanged from rc.1) |
| Base `main` | `a7fe8f9` (#139) |
| Branch | `verification/v1-rc2-package` |
| Package candidate commit | `77b0a5b` — `release: bump BabuşTV to 1.0.0-rc.2` (versions, lockfile versions, `version.json`, README, CHANGELOG only) |
| Exact-head CI at `77b0a5b` | `verify` run `34860514185` SUCCESS — JS 68/68, TS 628/628 |
| Signed WGT (local only) | `babustv_beta_v1.0.0-rc.2_77b0a5b.wgt`, 365,138 bytes, SHA-256 `ea127ca6ac2f8d47728ae603cb99409c7ed5fee96e057a703e6eb3df18acecf1` |

## Command gate at `77b0a5b`

| Command | Where | Result |
| --- | --- | --- |
| `npm ci`, `npm test` (JS + TS), `npm run typecheck`, `npm run build`, `git diff --exit-code` | CI `34860514185` | PASS — JS 68/68, TS 628/628 |
| `npm run brand:check` | local | PASS, 150 active product surfaces clean |
| `node tools/check-m7-security-privacy.mjs` | local | PASS |
| `npm run tizen:build` | local | PASS, `[stage] vite build --base=./ (v1.0.0-rc.2)` |
| staged artifact checks (`tizen/build/`) | local | PASS, 20/20 |
| `TIZEN_PROFILE=samsung npm run tizen:package` | local, Tizen Studio CLI, controller-approved | PASS, author + distributor signed |
| signed WGT content checks (extracted) | local | PASS, 20/20; 10 entries; zip integrity clean; `role-author` and `role-distributor` signatures |
| rc-browser suite (H0 + all packs), `npm run build` at `77b0a5b` | local, cached Chromium 1243 via untracked executable-path config (deleted after run) | PASS, 76/76 in 3.7 min (H0 1, PROV 12, LIVE 11, PLAYNAV 12, STATE 15, SECPAIR 25), no retry |

On a Windows checkout, local `npm test` still shows the four known CRLF-only failures (`copy.d.ts…` and three `PAIR-I-WIRE` tests). Linux CI at the same head is authoritative.

The `rc-browser` CI workflow does not trigger on this branch, and its canonical scope check is pinned to production `eaa928c`. The browser matrix evidence for rc.2 is therefore local. The rc.2 suite runs without the removed `/brand` harness route, so it also proves no remaining root-absolute brand request.

## Staged check set (20)

These are the same 19 checks as rc.1, with the bundle version now expected as `"1.0.0-rc.2"`, plus one new check:

- **new:** no script in the bundle references `brand/` or `favicon.png` by a root-absolute path. It FAILS on the rc.1 WGT (extracted `babustv_beta_v1.0.0-rc.1_c3c9709.wgt`) and PASSES on rc.2.

Staged payload: 8 files, 1,144,685 bytes. Packaged payload: 10 files, 1,158,755 bytes.

## Update and install notes

- **Update check.** `version.json` on `main` becomes `1.0.0-rc.2`. By #135 semantics, `1.0.0-rc.1` installs with the update check enabled are offered rc.2, and `1.10.1` installs are not prompted.
- **Tizen widget version.** rc.1 and rc.2 both ship `1.0.0`. Installing rc.2 over rc.1 is a same-version install. That behaviour, and whether it keeps app data, is not verified here; it belongs to the physical-device stage.
- **Distributor-signed WGT.** It normally installs only on devices registered to that certificate. It has not been distributed.

## Open observations (not blockers)

From #139 follow-ups:
- Search results beyond about 5 rows do not scroll into view as focus moves.
- Home "Sık İzlenenler" has no empty-state message.
- Legacy root-absolute backend routes remain (`/log`, `/api/fetch`, `/proxy/`).
- Other IndexedDB `getAll` reads may share the key-order effect, and `MemoryStructuredStore` does not model IndexedDB ordering.
- Editing an Xtream server keeps the old host label.

Carried from rc.1:
- The legacy What's New list has no RC entry.
- `tizen/wgt.mjs` defaults to a missing `dev` profile.
- Interrupted onboarding reload.
- The relay HTTP 500 message wording.

## Physical Samsung/Tizen — NOT VERIFIED / DEFERRED

Unchanged from rc.1. Building, staging, signing and archive inspection do not prove install, launch, WidgetData persistence, remote keys, AVPlay fallback, lifecycle, long playback, network loss, TV + phone pairing, or final install smoke.

## Controller acceptance record

| Item | Value |
| --- | --- |
| Decision | `RC-PACKAGE 1.0.0-rc.2 — IN PROGRESS → ACCEPTED` |
| Date | 2026-09-14 |
| Decided by | Controller (repository owner) |
| Accepted candidate | `1.0.0-rc.2`, package candidate commit `77b0a5b`; Tizen widget version `1.0.0` |
| Accepted evidence head | `07cb5ce` (board), `verify` run `34861109862` SUCCESS; candidate head `77b0a5b` `verify` run `34860514185` SUCCESS |
| Accepted local WGT | `babustv_beta_v1.0.0-rc.2_77b0a5b.wgt`, SHA-256 `ea127ca6ac2f8d47728ae603cb99409c7ed5fee96e057a703e6eb3df18acecf1` (not distributed) |
| Merge method | merge commit, so `77b0a5b` stays reachable from `main` |
| Release tag | annotated `v1.0.0-rc.2` at `77b0a5b` created and pushed (tag object `fda4f69`), no GitHub Release |
| Next transition | `ACCEPTED → CLOSED / GREEN` when PR #140 merges and post-merge verify is SUCCESS |

Acceptance does not change any `NOT VERIFIED / DEFERRED` physical-device row, and the open observations stay open.

## Controller acceptance checklist

| Condition | State |
| --- | --- |
| Exact-head repository gates GREEN | CI `34860514185` at `77b0a5b` |
| `brand:check` and M7 static audit GREEN | PASS |
| `tizen:build` staging GREEN with numeric widget version | PASS, `1.0.0` |
| Staged and packaged artifact checks | 20/20 PASS each |
| `tizen:package` PASS or honestly NOT-AVAILABLE | PASS locally with `samsung` profile |
| Browser matrix at candidate version | local 76/76 PASS |
| Zero `player/src/**` changes in the version-bump commit | confirmed |
| Clean working tree after gates | `git status` clean |
| Physical-device rows untouched | confirmed |
