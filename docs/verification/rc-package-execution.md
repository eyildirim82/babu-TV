# RC-PACKAGE Execution Evidence Board

Date: 2026-09-14
Owner: REVIEW / Integration Controller
Status: READY FOR CONTROLLER ACCEPTANCE — `1.0.0-rc.1` build, staging and package gates GREEN on the exact candidate head; physical Samsung/Tizen install and runtime rows remain NOT VERIFIED / DEFERRED

Design: `docs/superpowers/specs/2026-09-10-babustv-v1-maximum-parallel-execution-design.md` §9.2
Readiness board: `docs/verification/v1-rc-readiness.md` (queue row 14)

This board records what the RC-PACKAGE gate proved for the first BabuşTV release candidate, and what it cannot prove. It does not mark RC-PACKAGE `ACCEPTED`; that transition belongs to the controller.

## Exact identities

| Item | Value |
| --- | --- |
| Candidate version | `1.0.0-rc.1` (`package.json`, `player/package.json`, `package-lock.json`, `version.json`) |
| Tizen widget version | `1.0.0` (derived by `tizenWidgetVersion`, #135) |
| Base `main` | `6773ca1` (#136), post-merge verify `34849186407` (#135 `29c2e0f`) and `34849192504` (#136) SUCCESS |
| Branch | `verification/v1-rc-package` |
| Version-bump commit (package candidate) | `c3c9709` |
| Exact-head CI at `c3c9709` | `verify` run `34849865998` SUCCESS — JS 62/62, TS 620/620 |
| Signed WGT (local only) | `babustv_beta_v1.0.0-rc.1_c3c9709.wgt`, 364,456 bytes, SHA-256 `7601527bde3cdee9639c7c5224d96811826e0d13d0dc81fb482a1985ed99173e` |

The WGT is built from `c3c9709`. The commit that adds this board changes only this file.

## Prerequisites closed before the bump

| Item | Evidence |
| --- | --- |
| RC-BROWSER `CLOSED GREEN` | #132 `450f681`, post-merge verify `34846072550` |
| Versioning decision `1.0.0-rc.1` | readiness queue row 15 (#136) |
| RC FIX: numeric Tizen widget version + prerelease-aware update check | #135 `29c2e0f`; 8 new tests RED then GREEN; review clean |
| Control boards reflect waves 0–5 and RC-BROWSER | #136 `6773ca1` |

## Version bump scope (`c3c9709`)

| File | Change |
| --- | --- |
| `package.json`, `player/package.json` | `1.10.1` → `1.0.0-rc.1` |
| `package-lock.json` | root and `player` workspace versions only |
| `version.json` | update-check metadata `1.0.0-rc.1` |
| `README.md` | current version line |
| `CHANGELOG.md` | new `[1.0.0-rc.1]` entry |

No `player/src/**`, `tizen/**` or `tools/**` change. `tizen/config.xml` keeps `version="1.0.0"`; staging now writes the derived `1.0.0` too.

Update-check effect of `version.json` on `main` (served through jsDelivr `@main`), by #135 semantics:

- `1.10.1` installs see `1.0.0-rc.1` as older, so no update prompt;
- `1.0.0-rc.1` installs are not prompted by their own version;
- `1.0.0-rc.1` installs will be offered the final `1.0.0`.

## Repository command gate

| Command | Where | Head | Result |
| --- | --- | --- | --- |
| `npm ci` | CI `34849865998` and local | `c3c9709` | PASS |
| `npm test` (JS) | CI `34849865998` | `c3c9709` | PASS, 62/62 |
| `npm run test:ts -w player` (via `npm test`) | CI `34849865998` | `c3c9709` | PASS, 620/620 |
| `npm run typecheck` | CI `34849865998` and local | `c3c9709` | PASS |
| `npm run build` | CI `34849865998` and local | `c3c9709` | PASS |
| `git diff --exit-code` after verification | CI `34849865998` | `c3c9709` | PASS |
| `npm run brand:check` | local | `c3c9709` | PASS, 149 active product surfaces clean |
| `node tools/check-m7-security-privacy.mjs` | local | `c3c9709` | PASS, source/privacy scan clean |
| `npm run tizen:build` | local | `c3c9709` | PASS, `[stage] vite build --base=./ (v1.0.0-rc.1)` |
| staged artifact checks | local | `c3c9709` | PASS, 19/19 (below) |
| `TIZEN_PROFILE=samsung npm run tizen:package` | local, Tizen Studio CLI | `c3c9709` | PASS, author + distributor signed WGT (below) |
| signed WGT content checks | local | `c3c9709` | PASS, 19/19 + signature roles (below) |
| `npm run rc:browser` (H0 + all packs) | local, cached Chromium 1243 via untracked executable-path config | `c3c9709` | PASS, 76/76 in 5.4 min, no retried scenario |

Local Windows `npm test` shows 1 JS and 3 TS failures (`copy.d.ts matches the exact UI_COPY declaration shape`, three `PAIR-I-WIRE` tests). They are the known CRLF-only failures on an untouched Windows checkout and do not occur in Linux CI, which is authoritative: 62/62 and 620/620 at the same head.

## Staged artifact checks (`tizen/build/`)

| Check | Result |
| --- | --- |
| widget `id="https://babus.tv/babustvapp"` | PASS |
| widget `version="1.0.0"` (numeric, no prerelease) | PASS |
| `tizen:application id="BabusTVApp.BabusTV" package="BabusTVApp" required_version="5.0"` | PASS |
| `<name>BABUŞ TV</name>`, author `BABUS` / `https://babus.tv` | PASS |
| `content src="index.html"`, `icon src="icon.png"`, profile `tv-samsung` | PASS |
| privileges exactly `internet`, `tv.inputdevice`, `developer.samsung.com/privilege/widgetdata` | PASS |
| staged `config.xml` identical to source `tizen/config.xml` | PASS |
| `icon.png` is PNG 128×128 | PASS |
| `index.html` has no absolute asset paths and no `/babustv/` base | PASS |
| `index.html` local references exist (4); `$WEBAPIS/webapis/webapis.js` is runtime-provided on device | PASS |
| bundle `APP_VERSION` is `"1.0.0-rc.1"` | PASS |
| no source maps; no `node_modules`/`test`/`docs`/`tools` content | PASS |
| no rc-browser fixture or synthetic canary strings in bundle | PASS |
| no legacy product identity (`IPTVPlayer`, `EN TV Player`) | PASS |

Staged payload: 8 files, 1,138,716 bytes.

## Signed package

| Item | Value |
| --- | --- |
| Command | `TIZEN_PROFILE=samsung npm run tizen:package` (`tizen package -t wgt -s samsung`) |
| Signing | author certificate and distributor certificate from the controller's local Tizen Studio `samsung` security profile |
| Output | `tizen/build/babustv_beta_v1.0.0-rc.1_c3c9709.wgt` (`beta` channel because the branch is not `main`) |
| Size / SHA-256 | 364,456 bytes / `7601527bde3cdee9639c7c5224d96811826e0d13d0dc81fb482a1985ed99173e` |
| Archive | 10 entries, zip integrity test clean |
| Signatures | `author-signature.xml` (`role-author`), `signature1.xml` (`role-distributor`) |
| Packaged content | same 19/19 checks as staging PASS on the extracted WGT; packaged `config.xml` `version="1.0.0"` |
| Distribution | none — the WGT stays in ignored `tizen/build/`, is not committed, not uploaded, not attached to CI |

`tizen/wgt.mjs` defaults to a `dev` security profile that does not exist on the controller machine (`samsung` and `tizen` do). The package was produced with `TIZEN_PROFILE=samsung` by controller decision. CI has no Tizen CLI or signing material, so this row has local evidence only.

A distributor-signed Samsung WGT normally installs only on devices registered to that certificate. Installability was not tested.

## Upgrade and install notes

- Legacy EN TV Player installs used Tizen package `IPTVPlayer`. Since B0A (#18) the package is `BabusTVApp`, so those installs are a separate application and are unaffected.
- `BabusTVApp` developer/emulator installs staged before #135 carry widget version `1.10.1`. `1.0.0` is lower, so those installs need one uninstall and reinstall. Uninstalling removes app-local data, including WidgetData credentials.

## Open observations (not RC-PACKAGE blockers)

- **Legacy What's New list.** `player/src/main.js` still carries the inherited `CHANGELOG` list, 1.3.0–1.10.1, with no `1.0.0-rc.1` entry. The modal is reachable only from the legacy player shell path, not the M5 boot path. If shown, it would list inherited items under a `v1.0.0-rc.1` heading. Product decision: drop or replace the list.
- **Synthetic last-seen version in SECPAIR fixture.** `tools/rc-browser/fixtures/pack-c-security-pairing.mjs` pins `en_last_seen_version` to `1.10.1`. With `APP_VERSION` `1.0.0-rc.1` all 25 SECPAIR scenarios still pass locally; the pin only matters if a scenario reaches the legacy What's New path.
- **`tizen:package` profile default.** `tizen/wgt.mjs` defaults to `TIZEN_PROFILE=dev`. Consider documenting `samsung` or making the missing profile error explicit.
- Carried from RC-BROWSER: interrupted onboarding reload, phone relay HTTP 500 copy, B06 Search watch.

## Physical Samsung/Tizen — NOT VERIFIED / DEFERRED

Nothing on this board converts a physical-device row to PASS. Building, staging, signing and archive inspection of the WGT do not prove any of the following:

- install of `babustv_beta_v1.0.0-rc.1_c3c9709.wgt` on a real Samsung TV or emulator;
- launch, WidgetData credential persistence, device keystore;
- M3 Live TV runtime matrix, real remote keys, AVPlay fallback, lifecycle, long playback, network loss;
- physical TV + phone pairing;
- final release install/package smoke.

## Controller acceptance checklist

| Condition | State |
| --- | --- |
| Exact-head repository gates GREEN (`test`, `typecheck`, `build`) | CI `34849865998` at `c3c9709` |
| `brand:check` and M7 static audit GREEN | PASS |
| `tizen:build` staging GREEN with numeric widget version | PASS, `1.0.0` |
| Staged identity/icon/privilege/path checks | 19/19 PASS |
| `tizen:package` PASS or honestly NOT-AVAILABLE | PASS locally with `samsung` profile; CI NOT-AVAILABLE by design |
| Browser matrix unaffected by the version change | local 76/76 PASS at `c3c9709`; CI `rc-browser` does not trigger on this branch |
| Zero `player/src/**` changes in the RC-PACKAGE diff | confirmed |
| Clean working tree after gates | `git status` clean; `tizen/build/`, `player/dist/` ignored |
| Physical-device rows untouched | confirmed |

## Browser matrix at the candidate version

The version bump changes `APP_VERSION` in the bundle. The `rc-browser` CI workflow triggers only on RC-BROWSER qualification branches, and its canonical scope check is pinned to production `eaa928c`, so it does not run here. The full suite was run locally instead:

- command: `npx playwright test` with an untracked config that spreads `tools/rc-browser/playwright.config.mjs` and sets `launchOptions.executablePath` to the cached Chromium 1243 (the headless-shell download for Playwright 1.63 is not present locally); the config was deleted after the run;
- build: `npm run build` (`/babustv/` base) at `c3c9709`;
- result: 76 passed (H0 1, BROW-PROV 12, BROW-LIVE 11, BROW-PLAYNAV 12, BROW-STATE 15, BROW-SECPAIR 25), no failure, no retry.

A first local attempt failed all 76 scenarios before any page loaded: `browserType.launch: Executable doesn't exist … chromium_headless_shell-1243`. That is an environment problem, not a product result.
