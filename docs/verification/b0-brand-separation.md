# B0G — BabuşTV Brand Separation Final Gate

Date: 2026-09-09
Role: B0G worker
Branch: `feature/b0g-brand-hardening`

## Scope and baseline

B0G is limited to Task 7 final brand hardening/gate. No provider, stream-resolution, playback, AVPlay/Shaka, recovery, credential/storage semantics, M4 feature, or framework migration is part of this slice.

- Exact GREEN `main` baseline: `0ccf8c3c3a32ec709ee60e10e380e458d5f04e8d`
- Baseline post-checkpoint `verify`: run `34403623125` — SUCCESS on that exact `main` SHA
- Exact tested B0G product revision: `37d667192859b45fbfe66ba522949064bc80058a`
- Final exact-head verification with ripgrep installed: run `34405102402` — SUCCESS
- Broad audit capture run: `34405022117` — SUCCESS on a temporary verification ref derived from the tested product tree; temporary workflow/output files were explicitly excluded from the audit glob
- No Draft PR was opened and no merge was performed by B0G.

## TDD defect found and repaired

Expanding the active-surface gate exposed a real inherited product-identity leak in the update path:

- `player/src/update.js` still fetched version metadata from the legacy upstream repository.
- root `version.json` still routed releases to the legacy upstream repository.

Classification: `BUG_ACTIVE_PRODUCT_SURFACE`.

RED evidence:

- RED commit: `811066f347ec19079506f2f0629f2e5fd92a88df`
- Focused acceptance: `node --test player/test/b0-brand-hardening.test.js`
- Exact RED proof run: `34405210273` — the workflow succeeds only if the focused acceptance exits non-zero at the RED revision; result SUCCESS confirms the intended RED was reproduced.

Minimum repair:

- `player/src/update.js`: version metadata now resolves through `eyildirim82/babu-TV@main/version.json`.
- `version.json`: release URL now resolves to `https://github.com/eyildirim82/babu-TV/releases/latest`.
- Existing consent/cache storage keys and update-flow semantics were intentionally left unchanged.

GREEN evidence is included in the exact-head full regression run `34405102402`.

## Active-surface gate

`tools/check-legacy-brand.mjs` now scans the original B0A identity/build surfaces plus:

- `player/index.html`
- all text files recursively under `player/src/`
- all text files recursively under `player/public/`

The scanner ignores only generated/vendor/binary surfaces required by Task 7:

- `.git/`
- `node_modules/`
- `player/dist/`
- `tizen/build/`
- `*.wgt`, `*.png`, `*.jpg`, `*.jpeg`, `*.webp`

Result at tested revision: `npm run brand:check` — PASS in run `34405102402`.

## Full exact-head automated matrix

Run `34405102402` explicitly checked out product SHA `37d667192859b45fbfe66ba522949064bc80058a` and completed:

| Check | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm test` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run brand:check` | PASS |
| `npm run tizen:build` | PASS |
| staged identity/icon/index validation | PASS |
| staged legacy-brand text scan with installed `ripgrep` | PASS — zero active matches |
| tracked-file clean-diff check after verification | PASS |

## Broad legacy-marker audit and classification

Plan-required audit expression:

```bash
rg -ni "EN[- ]?IPTV|IPTVPlayer|@en-iptv|en-tvplayer|enplayer" . \
  -g '!node_modules/**' -g '!player/dist/**' -g '!tizen/build/**' -g '!.git/**'
```

The exact captured audit output contains no `player/src/` hit and no `version.json` hit after the repair.

### LEGAL_ATTRIBUTION

- `LICENSE` — inherited MIT copyright attribution. It must remain intact.

### HISTORICAL_SPEC_OR_BASELINE

- `CHANGELOG.md` — historical compatibility wording; the case-insensitive pattern also matches the tail of `Tizen IPTV`.
- `docs/PACKAGING_BASELINE.md`
- `docs/REPO_RULES.md`
- `docs/STATS.md`
- `docs/UPSTREAM_BASELINE.md`
- `docs/decisions/0001-controlled-upstream-divergence.md`
- `docs/superpowers/plans/2026-09-07-m0-baseline-and-fork-bootstrap.md`
- `docs/superpowers/plans/2026-09-07-m1-architecture-foundation.md`
- `docs/superpowers/plans/2026-09-07-m2-provider-core.md`
- `docs/superpowers/plans/2026-09-08-m3-live-tv-core.md`
- `docs/superpowers/plans/2026-09-09-babustv-brand-separation.md`
- `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`
- `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`
- `docs/verification/b0-execution-status.md` — controller-owned execution history/status; not edited by B0G.
- `player/test/b0-brand-hardening.test.js` — negative acceptance fixture.
- `player/test/babustv-assets.test.js` — negative/legacy asset acceptance fixture.
- `player/test/babustv-copy.test.js` — negative copy acceptance fixture.
- `player/test/babustv-shell.test.js` — negative shell acceptance fixture.
- `tizen/config.xml.bak` — historical packaging baseline retained as provenance, not an active package input.

### BUG_ACTIVE_PRODUCT_SURFACE

Resolved during B0G:

- `player/src/update.js` — legacy upstream version-metadata route; fixed.
- `version.json` — legacy upstream release route; fixed.

No unresolved `BUG_ACTIVE_PRODUCT_SURFACE` match remains in the Task 7 audit.

## Tizen staged identity and assets

At exact product SHA `37d667192859b45fbfe66ba522949064bc80058a`, run `34405102402` verified the staged output after `npm run tizen:build`:

- application id: `BabusTVApp.BabusTV`
- package: `BabusTVApp`
- required Tizen version: `5.0`
- display name: `BABUŞ TV`
- `tizen/build/icon.png` is byte-for-byte equal to `tizen/icons/icon_128.png`
- staged `index.html` title is `BabuşTV`
- staged `index.html` has no absolute `src`/`href` asset path
- staged text contains no active legacy product-identity marker from the Task 7 expression

## Package, browser, emulator, and hardware availability

- `npm run tizen:package`: **NOT-AVAILABLE** in the worker execution environment because the Tizen CLI/signing profile is not installed. No WGT artifact PASS is claimed. The source packaging contract remains BabuşTV-owned and uses the `babustv_<channel>_...wgt` naming path, but no package artifact was produced in this B0G verification.
- Browser smoke on the exact B0G head: **NOT-AVAILABLE / NOT-RUN** in this connector execution environment. No browser-runtime PASS is claimed. The exact automated build and Tizen staging gates are recorded above.
- Tizen Emulator smoke: **NOT-AVAILABLE**. `em-cli`, `sdb`, and `tizen` are absent from the worker environment; no emulator PASS is claimed.
- Physical TV / hardware-only acceptance: **DEFERRED** to the runtime verification track. No physical-device PASS is claimed.

## Scope review

Before adding this evidence document, `main@0ccf8c3c...` versus tested B0G product head changed only:

- `tools/check-legacy-brand.mjs`
- `player/test/b0-brand-hardening.test.js`
- `player/src/update.js`
- `version.json`

The production change is limited to BabuşTV-owned update metadata routing. No provider/playback/recovery/credential/storage behavior, Tizen identity contract, M4 feature, or presentation system was broadened.

B0G worker conclusion: final active-product brand gate and staged identity checks are GREEN at tested product SHA `37d667192859b45fbfe66ba522949064bc80058a`; runtime/package checks that require unavailable Tizen/browser tooling remain explicitly NOT-AVAILABLE/DEFERRED rather than being promoted to PASS.
