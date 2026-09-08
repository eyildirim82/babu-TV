# BabuşTV B0 Brand Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove active ENTV/EN-IPTV product identity from BabuşTV, establish a BabuşTV-owned visual system and packaging identity, and preserve the already-working provider/playback/focus/recovery behavior.

**Architecture:** Keep Provider / Domain / Playback / Focus / Recovery boundaries unchanged and replace identity/presentation around them. Canonical product identity is defined once and consumed by both Tizen packaging paths; UI styling moves into isolated BabuşTV token/theme/primitives files before shell and Live TV presentation are rebuilt on top. The work is delivered as independently reviewable B0A–B0G slices with strict file ownership so the first wave can run in parallel without merge-conflict churn.

**Tech Stack:** Vite 6, vanilla JavaScript/TypeScript, DOM/CSS, Node test runner, `tsx --test`, Samsung Tizen Web app packaging, Tizen CLI, SDB/TV Emulator.

**Spec:** `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`

## Global Constraints

- Product name is `BabuşTV`.
- Preferred TV-facing display form is `BABUŞ TV`. Use `BABUS TV` only if Tizen tooling/runtime rejects the UTF-8 form and that failure is reproduced and recorded.
- Canonical npm workspace names are `@babustv/player` and `@babustv/tizen`.
- Canonical Tizen application identity is `BabusTVApp.BabusTV` with package `BabusTVApp` and widget id `https://babus.tv/babustvapp`.
- Canonical browser/dev base path is `/babustv/`; `/enplayer/` is legacy identity and must disappear from active code/docs.
- Canonical WGT artifact names are `babustv_stable_v<version>_<commit>.wgt` on `main` and `babustv_beta_v<version>_<commit>.wgt` elsewhere.
- Root `package.json` is the canonical application-version source. `player/package.json` must have the same version.
- Tizen compatibility floor stays `required_version="5.0"`.
- Primary UI language is Turkish.
- Primary visual direction is premium/restrained/TV-first, dark charcoal surfaces with violet accent.
- Calico cat branding is selective: boot, empty state, onboarding/status brand surfaces; never a persistent distraction over playback.
- Remote focus is first-class; pointer hover is secondary.
- Provider, playback engine, stream resolution, ChannelIntentCoordinator, PlayerSessionCoordinator recovery, secure credential boundaries, and M3 highlight/playback semantics must not change in B0.
- No M4 EPG/search/favorites behavior is implemented in B0.
- No secrets, provider URLs, credentials, or resolved transient stream material may enter logs, screenshots, fixtures, or docs.
- Legally required upstream license/attribution text remains; active product branding does not.
- Do not introduce an automatic cross-identity data migration. If an installed `IPTVPlayer` population is discovered to be a supported upgrade target, stop B0A before changing its upgrade semantics and escalate that migration as a separate design decision.
- TDD is mandatory for behavioral/build-contract changes: RED -> minimum implementation -> GREEN.
- Every PR requires exact-head tests/typecheck/build and explicit merge approval; every dependent slice starts only after post-merge `main` is GREEN.

---

## File Ownership and Parallelization Rules

The first wave may run as **four parallel branches** after this docs branch is merged and `main` is GREEN:

| Slice | Branch | Exclusive ownership in first wave |
| --- | --- | --- |
| B0A | `refactor/b0a-product-identity` | package metadata, Vite base identity, Tizen identity/packaging, identity scanner, active build docs |
| B0B | `feature/b0b-design-system` | new `player/src/ui/*.css` design-system files and their tests |
| B0C | `feature/b0c-brand-assets` | brand/icon asset files and asset packaging checks |
| B0F | `feature/b0f-settings-copy-cleanup` | runtime-generated user-facing copy in settings/dialog/action code; no layout/CSS redesign |

During that wave:

- B0A must not edit `player/index.html` or presentation CSS.
- B0B must not edit `player/index.html`, `player/src/main.js`, `player/src/settings.js`, package metadata, or Tizen packaging files.
- B0C must not edit application logic or presentation layout; it owns asset files and asset-specific packaging checks only.
- B0F must not edit `player/index.html`, layout CSS, Tizen packaging, npm package names, or design tokens.
- `package-lock.json` is owned by B0A in wave 1.

After B0A/B0B/B0C/B0F are merged and post-merge `main` is GREEN:

1. B0D `feature/b0d-shell-rebrand`
2. B0E `feature/b0e-live-tv-visual-reset`
3. B0G `feature/b0g-brand-hardening`

B0D and B0E are intentionally sequential because both depend on the final shell/presentation DOM contract. Do not parallelize them merely to increase worker count.

---

### Task 0: Establish the B0 execution baseline

**Files:**
- Read: `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`
- Read: `docs/superpowers/plans/2026-09-09-babustv-brand-separation.md`
- Read: `package.json`
- Read: `player/vite.config.js`
- Read: `tizen/config.xml`
- Read: `tizen/package.mjs`

**Interfaces:**
- Consumes: current post-docs-merge `main` head.
- Produces: one recorded GREEN base SHA used by all first-wave branches.

- [ ] **Step 1: Refresh main and record the exact base**

```bash
git checkout main
git pull --ff-only origin main
git status --short
BASE_SHA="$(git rev-parse HEAD)"
printf '%s\n' "$BASE_SHA"
```

Expected: clean worktree. Copy the printed SHA into each first-wave PR body.

- [ ] **Step 2: Run the baseline automated suite**

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run tizen:build
```

Expected: all commands PASS. `tizen:build` must stage a Tizen 5.0+ app with relative asset URLs.

- [ ] **Step 3: Characterize the current identity split**

```bash
grep -n "BabusTVApp.BabusTV\|BabusTVApp" tizen/config.xml
grep -n "IPTVPlayer\|EN-IPTV" tizen/package.mjs
grep -n "enplayer" player/vite.config.js tizen/package.mjs SETUP.md
```

Expected: official `config.xml` already reports the canonical BabuşTV identity; the inherited custom packager and browser base still expose legacy identity.

- [ ] **Step 4: Create first-wave branches from the exact same SHA**

```bash
git branch refactor/b0a-product-identity "$BASE_SHA"
git branch feature/b0b-design-system "$BASE_SHA"
git branch feature/b0c-brand-assets "$BASE_SHA"
git branch feature/b0f-settings-copy-cleanup "$BASE_SHA"
```

Do not base first-wave branches on each other.

---

### Task 1: B0A — Canonical product identity and packaging

**Branch:** `refactor/b0a-product-identity`

**Files:**
- Create: `tizen/product-identity.mjs`
- Create: `tools/check-legacy-brand.mjs`
- Create: `player/test/brand-identity.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `player/package.json`
- Modify: `player/vite.config.js`
- Modify: `tizen/package.json`
- Modify: `tizen/package.mjs`
- Modify: `tizen/wgt.mjs`
- Modify if needed to reach the preferred display form: `tizen/config.xml`
- Modify: `README.md`
- Modify: `tizen/README.md`
- Modify: `SETUP.md`

**Interfaces:**
- Consumes: current `tizen/config.xml` canonical app/package identity.
- Produces:
  - `PRODUCT_IDENTITY` and `artifactName()` from `tizen/product-identity.mjs`.
  - root `npm run brand:check` covering identity/build surfaces.
  - both package pipelines generating the same Tizen identity and canonical artifact naming.
  - browser/dev base `/babustv/`.

Use this exact identity module:

```js
export const PRODUCT_IDENTITY = Object.freeze({
  productName: 'BabuşTV',
  displayName: 'BABUŞ TV',
  widgetId: 'https://babus.tv/babustvapp',
  packageId: 'BabusTVApp',
  applicationId: 'BabusTVApp.BabusTV',
  authorName: 'BABUS',
  authorUrl: 'https://babus.tv',
  browserBase: '/babustv/',
});

export function artifactName({ version, commit, channel }) {
  if (channel !== 'stable' && channel !== 'beta') {
    throw new TypeError(`Unsupported release channel: ${channel}`);
  }
  return `babustv_${channel}_v${version}_${commit}.wgt`;
}
```

- [ ] **Step 1: Write identity tests first**

Create `player/test/brand-identity.test.js`. Assert:

```js
assert.equal(rootPackage.name, 'babustv');
assert.equal(rootPackage.author, 'BabuşTV');
assert.equal(playerPackage.name, '@babustv/player');
assert.equal(tizenPackage.name, '@babustv/tizen');
assert.equal(rootPackage.version, playerPackage.version);
assert.match(configXml, /id="BabusTVApp\.BabusTV"/);
assert.match(configXml, /package="BabusTVApp"/);
assert.match(configXml, /<name>BABUŞ TV<\/name>/);
assert.match(viteConfig, /base:\s*['"]\/babustv\/['"]/);
```

Also import `artifactName()` and assert:

```js
assert.equal(
  artifactName({ version: '1.10.1', commit: 'abc1234', channel: 'stable' }),
  'babustv_stable_v1.10.1_abc1234.wgt',
);
assert.equal(
  artifactName({ version: '1.10.1', commit: 'abc1234', channel: 'beta' }),
  'babustv_beta_v1.10.1_abc1234.wgt',
);
```

- [ ] **Step 2: Run focused identity tests and confirm RED**

```bash
node --test player/test/brand-identity.test.js
```

Expected: FAIL because package names, Vite base, and identity module are not yet canonical.

- [ ] **Step 3: Add canonical package metadata**

Set:

```json
// package.json
"name": "babustv",
"description": "BabuşTV — Samsung Tizen TV player",
"author": "BabuşTV"
```

```json
// player/package.json
"name": "@babustv/player",
"description": "BabuşTV player SPA"
```

```json
// tizen/package.json
"name": "@babustv/tizen",
"description": "BabuşTV Tizen WGT build tools"
```

Keep root/player versions equal. Run:

```bash
npm install --package-lock-only
```

Do not hand-edit lockfile workspace package names.

- [ ] **Step 4: Replace the browser/dev identity path**

In `player/vite.config.js` set:

```js
base: '/babustv/',
```

Update active docs to use:

```text
http://localhost:5173/babustv/
```

- [ ] **Step 5: Make the custom packager consume the canonical manifest**

Remove its locally generated ENTV manifest. Read `tizen/config.xml`, replace only the widget `version` attribute with the root package version, and write that manifest into the temporary package.

Remove the `/enplayer/` rewrite and replace it with `/babustv/` only for the legacy custom packaging path:

```js
html = html.replace(/\/babustv\//g, '/');
```

When a development certificate must be generated, use an ASCII-safe subject owned by BabuşTV:

```text
/CN=BabusTVApp/O=BabusTV/OU=Development
```

Do not remove `widgetdata`, `internet`, or `tv.inputdevice` privileges from the canonical manifest.

- [ ] **Step 6: Normalize custom WGT naming**

Read the version from root `package.json`; derive the channel as:

```js
const channel = branch === 'main' ? 'stable' : 'beta';
```

Use `artifactName({ version, commit: commitHash, channel })` for the custom packager output.

- [ ] **Step 7: Normalize official CLI WGT naming**

In `tizen/wgt.mjs`, after the CLI produces exactly one `.wgt`, obtain root version, short git SHA, and branch name, then rename the package to `artifactName(...)`. Keep the final file under `tizen/build/`.

- [ ] **Step 8: Add the first-stage legacy-brand scanner**

Create `tools/check-legacy-brand.mjs`. Construct markers so the scanner source does not match itself:

```js
const prohibited = [
  ['EN', 'IPTV'].join('-'),
  ['EN', 'IPTV'].join(' '),
  ['IPTV', 'Player'].join(''),
  ['@en', 'iptv'].join('-'),
  ['en', 'tvplayer'].join('-'),
  ['en', 'player'].join(''),
];
```

For B0A, scan only identity/build surfaces that B0A owns:

```text
package.json
package-lock.json
README.md
SETUP.md
player/package.json
player/vite.config.js
tizen/package.json
tizen/config.xml
tizen/package.mjs
tizen/wgt.mjs
tizen/README.md
```

Do **not** scan `player/index.html` or `player/src/` yet; those are deliberately owned by B0D/B0F/B0E. B0G expands the same scanner after those slices are merged.

Add root script:

```json
"brand:check": "node tools/check-legacy-brand.mjs"
```

The checker exits non-zero and prints `path:line: marker` for every finding.

- [ ] **Step 9: Confirm scanner RED, then clean owned surfaces**

```bash
npm run brand:check
```

Expected before cleanup: FAIL on active build/docs identity. Update README/Tizen README/SETUP/package metadata/custom packager until the same command passes. Preserve LICENSE and historical milestone/spec provenance outside the scanner scope.

- [ ] **Step 10: Verify identity and packaging GREEN**

```bash
node --test player/test/brand-identity.test.js
npm run brand:check
npm test
npm run typecheck
npm run build
npm run tizen:build
```

If the Tizen CLI/profile is installed in the execution environment:

```bash
npm run tizen:package
```

Expected on the feature branch: artifact name starts `babustv_beta_`; staged `config.xml` contains `BabusTVApp.BabusTV` and Tizen 5.0 requirement.

- [ ] **Step 11: Apply the explicit upgrade/storage gate before Ready**

Record exactly one outcome in the PR body:

```text
Upgrade target: pre-release/dev only; no supported IPTVPlayer-installed user population. Canonical BabusTVApp identity may proceed.
```

or

```text
Upgrade target includes supported IPTVPlayer installations. STOP: cross-identity storage migration requires a separate approved design before Ready/merge.
```

Do not invent cross-app migration in B0A.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json player/package.json player/vite.config.js \
  tizen/package.json tizen/product-identity.mjs tizen/package.mjs tizen/wgt.mjs tizen/config.xml \
  tools/check-legacy-brand.mjs player/test/brand-identity.test.js README.md tizen/README.md SETUP.md
git commit -m "refactor(b0): own BabuşTV product identity"
```

If `tizen/config.xml` did not change, omit it from `git add`.

---

### Task 2: B0B — BabuşTV design-system foundation

**Branch:** `feature/b0b-design-system`

**Files:**
- Create: `player/src/ui/tokens.css`
- Create: `player/src/ui/theme.css`
- Create: `player/src/ui/primitives.css`
- Create: `player/test/babustv-design-system.test.js`

**Interfaces:**
- Consumes: no B0A/B0C/B0F implementation files.
- Produces: stable CSS custom-property and primitive-class contract consumed by B0D/B0E.

Use these exact B0 tokens:

```css
:root {
  --babu-bg: #0b0b0f;
  --babu-surface: #14141a;
  --babu-surface-raised: #1b1b23;
  --babu-surface-focus: #242331;
  --babu-accent: #8b5cf6;
  --babu-accent-strong: #a78bfa;
  --babu-text-primary: #f5f3f7;
  --babu-text-secondary: #b8b5c0;
  --babu-text-muted: #777381;
  --babu-success: #4ade80;
  --babu-warning: #fbbf24;
  --babu-error: #f87171;
  --babu-radius-sm: 8px;
  --babu-radius-md: 12px;
  --babu-radius-lg: 16px;
  --babu-motion-fast: 120ms;
  --babu-motion-base: 180ms;
  --babu-motion-slow: 220ms;
}
```

- [ ] **Step 1: Write design-contract tests first**

`player/test/babustv-design-system.test.js` must read the three CSS files and assert the semantic token names above, `.babu-focus-ring`, `.babu-surface`, `.babu-surface-raised`, `.babu-pill`, and `prefers-reduced-motion` exist. It must also assert the inherited accent literal is absent from the new files:

```js
const inheritedAccent = ['#ED', '421F'].join('');
assert.equal(css.toUpperCase().includes(inheritedAccent), false);
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --test player/test/babustv-design-system.test.js
```

Expected: FAIL because the design-system files do not exist.

- [ ] **Step 3: Implement `tokens.css`**

Define semantic color, spacing, radii, typography, focus, and motion tokens only. Do not style legacy IDs/classes in this file.

- [ ] **Step 4: Implement `theme.css`**

Apply base `html, body` background/text/font behavior using tokens. Keep the video/playback surface capable of true black independently of shell surfaces.

- [ ] **Step 5: Implement `primitives.css`**

Provide:

```css
.babu-surface { ... }
.babu-surface-raised { ... }
.babu-focus-ring { ... }
.babu-pill { ... }
.babu-muted { ... }
```

Focus must remain visible at TV viewing distance using outline/box-shadow, not hover-only state. Keep transitions within 120–220ms and disable nonessential motion under `prefers-reduced-motion: reduce`.

- [ ] **Step 6: Verify GREEN without shell integration**

```bash
node --test player/test/babustv-design-system.test.js
npm test
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add player/src/ui/tokens.css player/src/ui/theme.css player/src/ui/primitives.css \
  player/test/babustv-design-system.test.js
git commit -m "feat(b0): add BabuşTV design system"
```

---

### Task 3: B0C — Brand asset set

**Branch:** `feature/b0c-brand-assets`

**Files:**
- Create: `player/public/brand/babustv-mark.svg`
- Create: `player/public/brand/babustv-wordmark.svg`
- Create: `player/public/brand/babustv-boot.svg`
- Create or replace: `player/public/favicon.png`
- Replace: `tizen/icons/icon_128.png`
- Create: `player/test/babustv-assets.test.js`

**Interfaces:**
- Consumes: approved brand direction only; no UI layout code.
- Produces: stable asset paths consumed by B0D and Tizen staging.

- [ ] **Step 1: Define asset acceptance tests first**

`player/test/babustv-assets.test.js` must assert these files exist and are non-empty:

```text
player/public/brand/babustv-mark.svg
player/public/brand/babustv-wordmark.svg
player/public/brand/babustv-boot.svg
player/public/favicon.png
tizen/icons/icon_128.png
```

For SVG source assert:

```text
contains BabuşTV-owned mark metadata/title
contains no television-outline or play-triangle legacy mark
contains no EN/ENTV/EN-IPTV product text
```

For PNG files, assert the PNG signature bytes are `89 50 4E 47 0D 0A 1A 0A`.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --test player/test/babustv-assets.test.js
```

Expected: FAIL because the BabuşTV asset set is incomplete.

- [ ] **Step 3: Produce one coherent asset family**

Use the approved calico direction: minimal cat-derived symbol, charcoal/violet system, restrained black/cream/warm-ginger patches. The mark must not contain a television outline, play triangle, inherited red/orange primary palette, or EN/IPTV lettering. The 128×128 Tizen icon uses the mark without wordmark and must remain legible at launcher size.

Use an image-generation/design tool for raster artwork when available; do not substitute unrelated stock imagery. Commit only final exported assets, not source prompts or font files.

- [ ] **Step 4: Verify Tizen staging picks up the new icon**

```bash
npm run tizen:build
cmp tizen/icons/icon_128.png tizen/build/icon.png
```

On Windows PowerShell, use a byte/hash comparison instead of `cmp`:

```powershell
(Get-FileHash tizen/icons/icon_128.png).Hash -eq (Get-FileHash tizen/build/icon.png).Hash
```

Expected: `true`/matching files.

- [ ] **Step 5: Verify GREEN**

```bash
node --test player/test/babustv-assets.test.js
npm test
npm run build
npm run tizen:build
```

- [ ] **Step 6: Commit**

```bash
git add player/public/brand player/public/favicon.png tizen/icons/icon_128.png player/test/babustv-assets.test.js
git commit -m "feat(b0): add BabuşTV brand assets"
```

---

### Task 4: B0F — Turkish-first runtime copy cleanup

**Branch:** `feature/b0f-settings-copy-cleanup`

**Files:**
- Create: `player/src/ui/copy.js`
- Create: `player/src/ui/copy.d.ts`
- Create: `player/test/babustv-copy.test.js`
- Modify: `player/src/settings.js`
- Modify: `player/src/player.js` only for user-visible strings; do not change playback logic
- Modify: `player/src/main.js` only for user-visible strings; do not change startup orchestration
- Do not modify: `player/index.html`, `player/src/styles.css`, `player/src/m3-live-tv.css`

**Interfaces:**
- Produces: `UI_COPY` runtime object and matching declaration so JavaScript and TypeScript presentation code can consume the same labels.

Use this exact JavaScript object:

```js
export const UI_COPY = Object.freeze({
  loading: 'Yükleniyor…',
  preparing: 'Hazırlanıyor…',
  channels: 'Kanallar',
  settings: 'Ayarlar',
  quality: 'Kalite',
  actions: 'İşlemler',
  reloadStream: 'Yayını yeniden yükle',
  refreshChannels: 'Kanalları yenile',
  noChannel: 'Kanal seçilmedi',
  buffering: 'Arabelleğe alınıyor',
  streamOpening: 'Yayın açılıyor…',
  recovering: 'Yayın yeniden deneniyor…',
  streamFailed: 'Yayın açılamadı',
  cancel: 'İptal',
  confirm: 'Onayla',
  close: 'Kapat',
});
```

Use this exact declaration shape in `copy.d.ts`:

```ts
export declare const UI_COPY: Readonly<{
  loading: string;
  preparing: string;
  channels: string;
  settings: string;
  quality: string;
  actions: string;
  reloadStream: string;
  refreshChannels: string;
  noChannel: string;
  buffering: string;
  streamOpening: string;
  recovering: string;
  streamFailed: string;
  cancel: string;
  confirm: string;
  close: string;
}>;
```

- [ ] **Step 1: Write copy tests first**

Assert every key above exists, values equal the approved Turkish copy, and no value contains legacy product names. Add characterization assertions for runtime-generated settings/action labels being replaced.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --test player/test/babustv-copy.test.js
```

- [ ] **Step 3: Replace runtime-generated user-visible copy only**

Import `UI_COPY` into existing JavaScript presentation paths. Replace labels/messages without changing control flow, storage, provider behavior, remote behavior, playback decisions, retry policy, or timers.

- [ ] **Step 4: Preserve the static-shell boundary**

Do not edit `player/index.html`. Record remaining static English shell labels in the PR body under `Deferred to B0D`; that is intentional file ownership, not unfinished B0F work.

- [ ] **Step 5: Verify GREEN**

```bash
node --test player/test/babustv-copy.test.js
npm test
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add player/src/ui/copy.js player/src/ui/copy.d.ts player/test/babustv-copy.test.js \
  player/src/settings.js player/src/player.js player/src/main.js
git commit -m "feat(b0): localize BabuşTV runtime copy"
```

---

## First-Wave Integration Gate

After B0A/B0B/B0C/B0F each pass review:

- [ ] Merge one PR at a time using squash merge.
- [ ] Rebase/refresh each remaining first-wave branch on the new `main` only when needed for mergeability; do not absorb another slice's scope.
- [ ] Require post-merge `main` GREEN before merging the next first-wave PR.
- [ ] After all four merge, run/require:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run brand:check
npm run tizen:build
```

Only then create B0D from fresh GREEN `main`.

---

### Task 5: B0D — Shell, boot, and global presentation rebrand

**Branch:** `feature/b0d-shell-rebrand`

**Dependencies:** B0A + B0B + B0C + B0F merged.

**Files:**
- Modify: `player/index.html`
- Modify: `player/src/styles.css`
- Create: `player/src/ui/shell.css`
- Modify: `player/src/main.js` only for shell asset/copy wiring
- Create: `player/test/babustv-shell.test.js`

**Interfaces:**
- Consumes: B0B tokens/primitives, B0C asset paths, B0F `UI_COPY`.
- Produces: final shell DOM contract that B0E consumes without redefining boot/sidebar/right-panel structure.

- [ ] **Step 1: Write shell presentation tests first**

Assert `player/index.html` contains:

```html
<title>BabuşTV</title>
```

Assert it references BabuşTV brand assets and design-system stylesheets. Assert static user-facing shell no longer contains these inherited labels:

```text
IPTV
EN IPTV
Loading...
Menu
Quality
Actions
Settings
What's New
Got it
Cancel
Confirm
```

Assert the old inline television/play SVG is absent.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --test player/test/babustv-shell.test.js
```

- [ ] **Step 3: Rebuild boot branding**

Replace inherited boot art with `/brand/babustv-boot.svg`, BabuşTV product text, version, and Turkish status. No heavy blur, bounce, long intro, or persistent mascot overlay.

- [ ] **Step 4: Integrate design-system stylesheets in this order**

```html
<link rel="stylesheet" href="/src/ui/tokens.css">
<link rel="stylesheet" href="/src/ui/theme.css">
<link rel="stylesheet" href="/src/ui/primitives.css">
<link rel="stylesheet" href="/src/styles.css">
<link rel="stylesheet" href="/src/ui/shell.css">
<link rel="stylesheet" href="/src/m3-live-tv.css">
```

Do not bulk-delete inherited CSS. Migrate shell surfaces intentionally and remove only rules proven unused by tests/browser smoke.

- [ ] **Step 5: Rebrand shell surfaces**

Use BabuşTV wordmark/mark, charcoal surfaces, violet focus, and Turkish static labels. Preserve runtime IDs used by existing controller/player wiring unless the same change updates every consumer and test.

- [ ] **Step 6: Preserve M3 runtime behavior**

```bash
node --test player/test/m3-live-tv-wiring.test.js
npm run test:ts -w player
```

Do not change M3 state/playback expectations to make a visual test pass.

- [ ] **Step 7: Verify shell GREEN**

```bash
node --test player/test/babustv-shell.test.js
npm run brand:check
npm test
npm run typecheck
npm run build
npm run tizen:build
```

- [ ] **Step 8: Manual browser smoke at 1920×1080**

```bash
npm run dev -w player
```

Open `/babustv/` and verify:

```text
BabuşTV boot branding
charcoal/violet shell
visible remote-style focus
no inherited TV/play mark
no layout overflow
video surface unobstructed when shell closes
```

- [ ] **Step 9: Commit**

```bash
git add player/index.html player/src/styles.css player/src/ui/shell.css player/src/main.js player/test/babustv-shell.test.js
git commit -m "feat(b0): rebrand BabuşTV shell"
```

---

### Task 6: B0E — Live TV visual reset

**Branch:** `feature/b0e-live-tv-visual-reset`

**Dependencies:** B0D merged and post-merge `main` GREEN.

**Files:**
- Modify: `player/src/live-tv/dom-live-tv-view.ts`
- Modify: `player/src/m3-live-tv.css`
- Create: `player/src/ui/live-tv.css`
- Modify: `player/test-ts/dom-live-tv-view.test.ts`
- Create: `player/test/babustv-live-tv-presentation.test.js`

**Interfaces:**
- Consumes: existing `LiveTvState`, `LiveTvViewModel`, B0D shell DOM, B0B tokens/primitives, and typed `UI_COPY` from `../ui/copy.js`.
- Produces: BabuşTV-specific Live TV presentation while preserving M3 interaction behavior.

- [ ] **Step 1: Characterize M3 behavior before edits**

```bash
npm run test:ts -w player
```

Record current pass count in the PR body. Do not rewrite `live-tv-state`, `channel-intent-coordinator`, or `player-session-coordinator` behavior/tests for a visual change.

- [ ] **Step 2: Write presentation RED tests**

Extend `dom-live-tv-view.test.ts` to require distinct presentation state for:

```text
focused channel
playing channel
focused + playing channel
active category
playback status
numeric zap overlay
```

The test must keep rendering downstream-only: no playback invocation, intent creation, retry scheduling, or state mutation.

Add `babustv-live-tv-presentation.test.js` to assert `ui/live-tv.css` uses BabuşTV semantic tokens and contains no inherited red/orange accent literal.

- [ ] **Step 3: Run focused/full presentation tests and confirm RED**

```bash
npm run test:ts -w player
node --test player/test/babustv-live-tv-presentation.test.js
```

Expected: only new presentation requirements fail.

- [ ] **Step 4: Implement the TV-native overlay presentation**

Keep the current behavior model but visually compose categories and channels as one BabuşTV overlay. Focus must be stronger than passive selection; playing state must be distinguishable without color alone. Do not add EPG, Favorite, Search, program detail, new timers, or playback decisions.

- [ ] **Step 5: Use the shared Turkish playback status copy**

Map presentation only:

```text
RESOLVING/PREPARING -> UI_COPY.streamOpening
RECOVERING -> UI_COPY.recovering
FAILED -> UI_COPY.streamFailed
```

A failed target remains highlighted according to M3 state. Presentation must not move focus back to the playing channel.

- [ ] **Step 6: Verify full M3 regression safety**

```bash
npm test
npm run typecheck
npm run build
npm run brand:check
```

Review these invariants explicitly:

```text
highlight != playback
category navigation does not play
CH+/CH- no-wrap
rapid zap last-intent-wins
failed-target rollback semantics
Back layer ownership
numeric zap capability gating
```

- [ ] **Step 7: Manual browser smoke at 1920×1080**

Check categories, channels, focused/playing distinction, long channel names, numeric overlay, failure status, and overlay-close state. Do not treat desktop animation performance as real-TV performance evidence.

- [ ] **Step 8: Commit**

```bash
git add player/src/live-tv/dom-live-tv-view.ts player/src/m3-live-tv.css player/src/ui/live-tv.css \
  player/test-ts/dom-live-tv-view.test.ts player/test/babustv-live-tv-presentation.test.js
git commit -m "feat(b0): reset BabuşTV Live TV presentation"
```

---

### Task 7: B0G — Brand hardening and emulator evidence

**Branch:** `feature/b0g-brand-hardening`

**Dependencies:** all B0 implementation slices merged and post-merge `main` GREEN.

**Files:**
- Modify: `tools/check-legacy-brand.mjs`
- Create: `docs/verification/b0-brand-separation.md`
- Modify tests/code only after a reproduced final-gate failure

**Interfaces:**
- Consumes: completed B0 product/presentation.
- Produces: final full-active-surface legacy-brand gate and runtime evidence.

- [ ] **Step 1: Expand the legacy-brand scanner to all active product surfaces**

Keep the B0A identity/build list and add:

```text
player/index.html
player/src/
player/public/
```

Ignore generated/binary directories/files:

```text
.git/
node_modules/
player/dist/
tizen/build/
*.wgt
*.png
*.jpg
*.jpeg
*.webp
```

The final scanner still excludes LICENSE and historical specs/baselines from product-surface failure; those are reviewed separately as provenance.

- [ ] **Step 2: Run final active legacy-brand gate**

```bash
npm run brand:check
```

Expected: zero findings.

Also run a broad human-review audit:

```bash
rg -ni "EN[- ]?IPTV|IPTVPlayer|@en-iptv|en-tvplayer|enplayer" . \
  -g '!node_modules/**' -g '!player/dist/**' -g '!tizen/build/**' -g '!.git/**'
```

Classify every remaining hit as exactly one of:

```text
LEGAL_ATTRIBUTION
HISTORICAL_SPEC_OR_BASELINE
BUG_ACTIVE_PRODUCT_SURFACE
```

Every `BUG_ACTIVE_PRODUCT_SURFACE` requires root cause -> failing test/check -> minimum fix -> GREEN before B0G can complete.

- [ ] **Step 3: Run the complete automated matrix**

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run brand:check
npm run tizen:build
```

If Tizen CLI/profile is available:

```bash
npm run tizen:package
```

Expected feature-branch artifact prefix: `babustv_beta_`.
Expected staged identity: `BabusTVApp.BabusTV`.

- [ ] **Step 4: Validate staged package contents**

Verify:

```text
tizen/build/config.xml -> canonical BabuşTV identity and required_version 5.0
tizen/build/icon.png -> BabuşTV icon
staged index -> BabuşTV title/assets
staged index -> no absolute asset paths
active staged text -> no ENTV/EN-IPTV legacy product identity
```

- [ ] **Step 5: Emulator smoke when available**

```bash
em-cli launch -n tv-emu
sdb devices
npm run tizen:emu
```

Record PASS/FAIL/NOT-AVAILABLE for:

```text
app installs and launches
launcher/app identity is BabuşTV
boot is BabuşTV
shell is charcoal/violet
remote focus is visible
SELECT/Back still work
Live TV overlay opens without implicit playback
no ENTV/EN-IPTV user-visible text or mark
```

Do not claim physical-TV release acceptance from emulator evidence.

- [ ] **Step 6: Write final verification evidence**

Create `docs/verification/b0-brand-separation.md` with:

```text
exact tested commit SHA
automated command matrix/results
legacy-brand broad-audit classifications
WGT identity/artifact result
browser smoke result
emulator result or NOT-AVAILABLE reason
hardware-only gates deferred to M3G/M8
```

Do not include credentials, provider URLs, or private stream data.

- [ ] **Step 7: Final diff review against scope**

Verify B0 did not introduce:

```text
provider protocol changes
playback policy changes
new AVPlay calls in presentation code
credential fallback/storage behavior
EPG/search/favorites behavior
heavy UI/framework dependencies
```

- [ ] **Step 8: Commit**

```bash
git add tools/check-legacy-brand.mjs docs/verification/b0-brand-separation.md
git commit -m "test(b0): harden BabuşTV brand separation"
```

If a reproduced final-gate bug required code/test changes, add only those specific files to the same or a focused corrective commit.

---

## Merge Order and Dependency Graph

```text
                  ┌─ B0A identity ───────┐
                  ├─ B0B design system ──┤
GREEN main ───────┼─ B0C assets ─────────┼──> GREEN main ──> B0D shell ──> B0E Live TV ──> B0G hardening
                  └─ B0F runtime copy ────┘
```

The first four are parallel only because their file ownership is deliberately disjoint. B0D/B0E are sequential because another parallel presentation branch would create more merge/review risk than elapsed-time benefit.

## Recommended Worker Count

For B0 itself, use **4 parallel workers in wave 1**.

- 2 workers under-use independent identity/design/assets/copy surfaces.
- 3 workers is safe but leaves one independent slice idle.
- 4 workers maps exactly to B0A/B0B/B0C/B0F and is the practical concurrency ceiling.
- 5+ B0 workers would require splitting cohesive slices or allowing shared presentation-file ownership; do not do that.

An optional **fifth non-B0 lane** may run M3G emulator/runtime verification if review bandwidth permits. It is not a B0 branch and must not modify B0 presentation speculatively.

## Final B0 Acceptance

B0 is complete only when all are true:

```text
User-visible name/logo/icon/boot = BabuşTV
Active npm/Tizen/WGT identity = BabuşTV
Browser/dev base = /babustv/
Legacy custom and official Tizen package paths agree
Final active product surfaces pass legacy-brand scanner
Charcoal/violet design system is the presentation base
Calico brand mark is present but non-intrusive during playback
Shell/settings/status copy is Turkish-first
Live TV focused/playing/failed states are visually distinct
M3 playback/provider/focus/recovery regression suite remains GREEN
Tizen 5.0+ package contract remains intact
Emulator result is recorded honestly as PASS/FAIL/NOT-AVAILABLE
Legal/historical upstream provenance is preserved outside active product identity
```
