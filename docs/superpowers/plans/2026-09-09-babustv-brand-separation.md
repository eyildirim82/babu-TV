# BabuşTV B0 Brand Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove active ENTV/EN-IPTV product identity from BabuşTV, establish a BabuşTV-owned visual system and packaging identity, and preserve the already-working provider/playback/focus/recovery behavior.

**Architecture:** Keep Provider / Domain / Playback / Focus / Recovery boundaries unchanged and replace identity/presentation around them. Canonical product identity is defined once and consumed by both Tizen packaging paths; UI styling moves toward isolated BabuşTV token/theme/primitives files before shell and Live TV presentation are rebuilt on top. The work is delivered as independently reviewable B0A–B0G slices with strict file ownership so the first wave can run in parallel without merge-conflict churn.

**Tech Stack:** Vite 6, vanilla JavaScript/TypeScript, DOM/CSS, Node test runner, `tsx --test`, Samsung Tizen Web app packaging, Tizen CLI, SDB/TV Emulator.

**Spec:** `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`

## Global Constraints

- Product name is `BabuşTV`.
- TV-facing display form is `BABUŞ TV`, using an ASCII-safe equivalent only where a platform restriction makes that necessary.
- Canonical npm workspace names are `@babustv/player` and `@babustv/tizen`.
- Canonical Tizen application identity is `BabusTVApp.BabusTV` with package `BabusTVApp` and widget id `https://babus.tv/babustvapp`.
- Canonical WGT artifact names are `babustv_stable_v<version>_<commit>.wgt` on `main` and `babustv_beta_v<version>_<commit>.wgt` elsewhere.
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
| B0A | `refactor/b0a-product-identity` | package metadata, Tizen identity/packaging, legacy-brand scanner |
| B0B | `feature/b0b-design-system` | new `player/src/ui/*.css` design-system files and their tests |
| B0C | `feature/b0c-brand-assets` | brand/icon asset files and asset packaging checks |
| B0F | `feature/b0f-settings-copy-cleanup` | user-facing copy in settings/dialog/action code; no layout/CSS redesign |

During that wave:

- B0A must not edit `player/index.html` or presentation CSS except if a test proves a package metadata requirement cannot be met otherwise.
- B0B must not edit `player/index.html`, `player/src/main.js`, `player/src/settings.js`, or Tizen packaging files.
- B0C must not edit application logic or presentation layout; it owns asset files and asset-specific packaging checks only.
- B0F must not edit layout CSS, Tizen packaging, npm package names, or design tokens.
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
- Read: `tizen/config.xml`
- Read: `tizen/package.mjs`

**Interfaces:**
- Consumes: current post-docs-merge `main` head.
- Produces: a recorded GREEN base SHA used by all first-wave branches.

- [ ] **Step 1: Refresh main and verify no unrelated open implementation PR must land first**

```bash
git checkout main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
```

Expected: clean worktree. Record the exact SHA in each branch PR body.

- [ ] **Step 2: Run the baseline automated suite**

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run tizen:build
```

Expected: all commands PASS. `tizen:build` must stage a Tizen 5.0+ app with relative asset URLs.

- [ ] **Step 3: Verify current packaging split before changing it**

```bash
grep -n "BabusTVApp.BabusTV\|BabusTVApp" tizen/config.xml
grep -n "IPTVPlayer\|EN-IPTV" tizen/package.mjs
```

Expected: official `config.xml` already reports the canonical BabuşTV identity while the inherited custom packager still exposes legacy identity. This is the characterized RED condition B0A will remove.

- [ ] **Step 4: Create first-wave branches only from the same GREEN base SHA**

```bash
git branch refactor/b0a-product-identity <GREEN_SHA>
git branch feature/b0b-design-system <GREEN_SHA>
git branch feature/b0c-brand-assets <GREEN_SHA>
git branch feature/b0f-settings-copy-cleanup <GREEN_SHA>
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
- Modify: `tizen/package.json`
- Modify: `tizen/package.mjs`
- Modify: `tizen/stage.mjs`
- Modify: `tizen/wgt.mjs`
- Verify only unless a failing identity test requires correction: `tizen/config.xml`
- Modify: `README.md`
- Modify: `tizen/README.md`

**Interfaces:**
- Consumes: current `tizen/config.xml` canonical identity.
- Produces:
  - `PRODUCT_IDENTITY` exported by `tizen/product-identity.mjs`.
  - root `npm run brand:check`.
  - both package pipelines generating the same Tizen identity and canonical artifact naming.

Use this exact identity module shape:

```js
export const PRODUCT_IDENTITY = Object.freeze({
  productName: 'BabuşTV',
  displayName: 'BABUŞ TV',
  widgetId: 'https://babus.tv/babustvapp',
  packageId: 'BabusTVApp',
  applicationId: 'BabusTVApp.BabusTV',
  authorName: 'BABUS',
  authorUrl: 'https://babus.tv',
});

export function artifactName({ version, commit, channel }) {
  if (channel !== 'stable' && channel !== 'beta') {
    throw new TypeError(`Unsupported release channel: ${channel}`);
  }
  return `babustv_${channel}_v${version}_${commit}.wgt`;
}
```

- [ ] **Step 1: Write identity tests first**

Add `player/test/brand-identity.test.js` with tests that load root/player/tizen package JSON plus `tizen/config.xml` and assert:

```js
assert.equal(rootPackage.name, 'babustv');
assert.equal(playerPackage.name, '@babustv/player');
assert.equal(tizenPackage.name, '@babustv/tizen');
assert.match(configXml, /id="BabusTVApp\.BabusTV"/);
assert.match(configXml, /package="BabusTVApp"/);
assert.match(configXml, /<name>BABUŞ TV<\/name>/);
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

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
node --test player/test/brand-identity.test.js
```

Expected: FAIL because package names and `tizen/product-identity.mjs` are not yet canonical.

- [ ] **Step 3: Add the canonical identity module and update package metadata**

Set:

```json
// package.json
"name": "babustv",
"description": "BabuşTV — Samsung Tizen TV player",
```

```json
// player/package.json
"name": "@babustv/player",
"description": "BabuşTV player SPA",
```

```json
// tizen/package.json
"name": "@babustv/tizen",
"description": "BabuşTV Tizen WGT build tools",
```

Run `npm install --package-lock-only` after package metadata changes so the lockfile workspace names are regenerated instead of hand-edited.

- [ ] **Step 4: Make the inherited custom packager consume canonical identity**

Remove local `IPTVPlayer`/EN-IPTV constants from `tizen/package.mjs`. Import `PRODUCT_IDENTITY` and `artifactName`.

The generated `<tizen:application>` must be:

```xml
<tizen:application id="BabusTVApp.BabusTV" package="BabusTVApp" required_version="5.0"/>
```

The generated author/name must be:

```xml
<author href="https://babus.tv">BABUS</author>
<name>BABUŞ TV</name>
```

The custom packager must preserve the existing WidgetData privilege if it generates its own `config.xml`:

```xml
<tizen:privilege name="http://developer.samsung.com/privilege/widgetdata"/>
```

Do not generate a second identity template that drifts from `tizen/config.xml`; where practical, read the canonical config and only replace its version.

- [ ] **Step 5: Normalize official CLI artifact naming**

In `tizen/wgt.mjs`, after `tizen package` succeeds, rename the single produced `.wgt` to `artifactName(...)` using root version, short git commit, and branch-derived channel.

Branch mapping is exact:

```js
const channel = branch === 'main' ? 'stable' : 'beta';
```

The final output remains under `tizen/build/` for the official CLI pipeline.

- [ ] **Step 6: Add a repo-active legacy-brand scanner**

Create `tools/check-legacy-brand.mjs`. Build prohibited markers from fragments so the scanner source does not fail itself:

```js
const prohibited = [
  ['EN', 'IPTV'].join('-'),
  ['EN', 'IPTV'].join(' '),
  ['IPTV', 'Player'].join(''),
  ['@en', 'iptv'].join('-'),
  ['en', 'tvplayer'].join('-'),
];
```

Scan these active surfaces recursively:

```text
package.json
package-lock.json
README.md
player/index.html
player/package.json
player/src/
player/public/
tizen/package.json
tizen/config.xml
tizen/package.mjs
tizen/stage.mjs
tizen/wgt.mjs
tizen/README.md
```

Ignore generated/binary paths such as `node_modules`, `player/dist`, `tizen/build`, `.git`, `.wgt`, `.png`, `.jpg`, `.webp`. Do not scan historical specs/license provenance as product surfaces.

Add root script:

```json
"brand:check": "node tools/check-legacy-brand.mjs"
```

The checker exits non-zero and prints `path:line: marker` for every finding.

- [ ] **Step 7: Run the scanner while legacy active surfaces still exist and confirm RED**

```bash
npm run brand:check
```

Expected: FAIL until README/Tizen README/package metadata/custom packager legacy product references are cleaned.

- [ ] **Step 8: Clean active technical/docs identity without deleting legal provenance**

Update active README/package instructions to BabuşTV artifact names and commands. Preserve LICENSE/copyright provenance. Do not rewrite historical milestone specs merely to make the scanner quiet; they are outside the active scan set.

- [ ] **Step 9: Verify identity and packaging GREEN**

```bash
node --test player/test/brand-identity.test.js
npm run brand:check
npm test
npm run typecheck
npm run build
npm run tizen:build
```

If Tizen CLI/profile exists in the environment:

```bash
npm run tizen:package
```

Expected: generated official WGT name starts `babustv_beta_` on the feature branch and staged `config.xml` contains `BabusTVApp.BabusTV`.

- [ ] **Step 10: Explicit storage/upgrade gate before PR Ready**

Document in the PR body one of these exact outcomes:

```text
Upgrade target: pre-release/dev only; no supported IPTVPlayer-installed user population. Canonical BabusTVApp identity may proceed.
```

or

```text
Upgrade target includes supported IPTVPlayer installations. STOP: cross-identity storage migration requires a separate approved design before Ready/merge.
```

Do not invent a migration inside B0A.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json player/package.json tizen/package.json \
  tizen/product-identity.mjs tizen/package.mjs tizen/stage.mjs tizen/wgt.mjs \
  tools/check-legacy-brand.mjs player/test/brand-identity.test.js README.md tizen/README.md
git commit -m "refactor(b0): own BabuşTV product identity"
```

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

Use these baseline tokens unless the approved spec has a stricter value for the same semantic token:

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

`player/test/babustv-design-system.test.js` must read the three CSS files and assert the semantic token names above, `.babu-focus-ring`, `.babu-surface`, `.babu-pill`, and `prefers-reduced-motion` support exist. It must also assert the inherited accent literal is absent from the new files by constructing the old value dynamically:

```js
const inheritedAccent = ['#ED', '421F'].join('');
assert.equal(css.includes(inheritedAccent), false);
```

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --test player/test/babustv-design-system.test.js
```

Expected: FAIL because the design-system files do not exist.

- [ ] **Step 3: Implement `tokens.css`**

Define only semantic variables: color, spacing, radii, typography scale, focus ring, and motion durations. Do not style legacy IDs/classes here.

- [ ] **Step 4: Implement `theme.css`**

Apply base `html, body` background/text/font behavior using tokens. Keep playback surface capable of true black independently of shell surfaces.

- [ ] **Step 5: Implement `primitives.css`**

Provide reusable primitives:

```css
.babu-surface { ... }
.babu-surface-raised { ... }
.babu-focus-ring { ... }
.babu-pill { ... }
.babu-muted { ... }
```

Focus must remain visible at TV viewing distance; use outline/box-shadow rather than hover-only state. Keep transitions within the 120–220ms token range and disable nonessential motion under `prefers-reduced-motion: reduce`.

- [ ] **Step 6: Verify GREEN without integrating into the shell yet**

```bash
node --test player/test/babustv-design-system.test.js
npm test
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add player/src/ui player/test/babustv-design-system.test.js
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

`player/test/babustv-assets.test.js` must assert:

```text
player/public/brand/babustv-mark.svg
player/public/brand/babustv-wordmark.svg
player/public/brand/babustv-boot.svg
player/public/favicon.png
tizen/icons/icon_128.png
```

exist, are non-empty, and the SVG source does not contain inherited TV/play branding terms.

For PNG files, assert the PNG signature bytes `89 50 4E 47 0D 0A 1A 0A`.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --test player/test/babustv-assets.test.js
```

Expected: FAIL because the BabuşTV asset set is incomplete.

- [ ] **Step 3: Produce the approved asset family**

The family must share one mark: a minimal calico-cat-derived symbol plus BabuşTV wordmark, readable on dark charcoal at TV distance. The cat mark must not contain a television outline, play triangle, inherited red/orange palette, or the letters `EN`/`IPTV`.

Use the approved charcoal/violet system plus restrained calico patches (black/cream/warm ginger). Keep the small Tizen icon legible without wordmark at 128×128.

- [ ] **Step 4: Verify Tizen staging picks up the new icon**

```bash
npm run tizen:build
```

Then verify `tizen/build/icon.png` byte-for-byte matches `tizen/icons/icon_128.png`.

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

### Task 4: B0F — Turkish-first copy and settings/action cleanup

**Branch:** `feature/b0f-settings-copy-cleanup`

**Files:**
- Create: `player/src/ui/copy.js`
- Create: `player/test/babustv-copy.test.js`
- Modify: `player/src/settings.js`
- Modify: `player/src/player.js` only for user-visible strings owned by legacy UI; do not change playback logic
- Modify: `player/src/main.js` only for user-visible strings, not startup orchestration
- Do not modify in this slice: `player/index.html`, `player/src/styles.css`, `player/src/m3-live-tv.css`

**Interfaces:**
- Produces: `UI_COPY` object consumed by B0D/B0E where practical.

Use an explicit flat copy contract so strings are searchable and stable:

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
  cancel: 'İptal',
  confirm: 'Onayla',
  close: 'Kapat',
});
```

- [ ] **Step 1: Write copy tests first**

Assert the keys above exist and no value contains inherited product names. Add characterization assertions around any existing settings/action labels being replaced.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --test player/test/babustv-copy.test.js
```

- [ ] **Step 3: Add `UI_COPY` and replace runtime-generated user-visible English strings**

Do not refactor control flow. Replace only copy at its existing decision points. Preserve technical log/error codes that are not user-facing.

- [ ] **Step 4: Leave static `player/index.html` copy for B0D**

This is an explicit conflict-avoidance boundary. Record remaining static English shell strings in the PR body; do not edit them in B0F.

- [ ] **Step 5: Verify GREEN**

```bash
node --test player/test/babustv-copy.test.js
npm test
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add player/src/ui/copy.js player/test/babustv-copy.test.js player/src/settings.js player/src/player.js player/src/main.js
git commit -m "feat(b0): localize BabuşTV product copy"
```

---

## First-Wave Integration Gate

After B0A/B0B/B0C/B0F each pass review:

- [ ] Merge one PR at a time using squash merge.
- [ ] Rebase/refresh each remaining first-wave branch on the new `main` only if required for mergeability; do not absorb another branch's scope.
- [ ] After every merge run/observe `main` verification before merging the next.
- [ ] After all four are merged, run:

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
- Consumes: design tokens/primitives, brand asset paths, `UI_COPY`.
- Produces: final shell DOM contract that B0E styles/renders without redefining boot/sidebar/right-panel structure.

- [ ] **Step 1: Write shell presentation tests first**

The test must read `player/index.html` and assert:

```html
<title>BabuşTV</title>
```

It must assert the page references BabuşTV brand assets and new CSS files, and that static shell text no longer contains `IPTV`, `EN IPTV`, `Loading...`, `Menu`, `Quality`, `Actions`, `Settings`, `What's New`, `Got it`, `Cancel`, or `Confirm` as user-facing static labels.

The test must also assert the old inline TV/play SVG is absent.

- [ ] **Step 2: Run focused test and confirm RED**

```bash
node --test player/test/babustv-shell.test.js
```

- [ ] **Step 3: Rebuild boot branding**

Replace the inherited EN IPTV boot mark with `babustv-boot.svg`, BabuşTV text, version, and Turkish status. Keep boot visually simple; no heavy blur, bounce, or full-screen mascot animation.

- [ ] **Step 4: Integrate design-system stylesheets**

Load in deterministic order:

```html
<link rel="stylesheet" href="/src/ui/tokens.css">
<link rel="stylesheet" href="/src/ui/theme.css">
<link rel="stylesheet" href="/src/ui/primitives.css">
<link rel="stylesheet" href="/src/styles.css">
<link rel="stylesheet" href="/src/ui/shell.css">
<link rel="stylesheet" href="/src/m3-live-tv.css">
```

Do not delete legacy CSS rules in bulk in this slice. Override/migrate the shell surface intentionally and remove only rules proven unused by the new shell.

- [ ] **Step 5: Rebrand left/right shell surfaces**

Static shell must use BabuşTV wordmark/mark, charcoal surfaces, violet focus, Turkish labels, and remote-visible focus states. Maintain existing IDs needed by runtime wiring unless tests and dependent code are updated in the same commit.

- [ ] **Step 6: Preserve M3 runtime contract**

Run existing wiring/controller/view tests without modifying their state/playback expectations:

```bash
node --test player/test/m3-live-tv-wiring.test.js
npm run test:ts -w player -- --test-name-pattern="Live TV|DomLiveTvView"
```

If the second command is not accepted by the current `tsx --test` version, run `npm run test:ts -w player` in full; do not change the test runner merely for filtering.

- [ ] **Step 7: Verify shell GREEN**

```bash
node --test player/test/babustv-shell.test.js
npm run brand:check
npm test
npm run typecheck
npm run build
npm run tizen:build
```

- [ ] **Step 8: Manual browser smoke**

```bash
npm run dev -w player
```

Check at 1920×1080 viewport:

```text
BabuşTV boot branding
charcoal/violet shell
visible remote-style focus
no ENTV logo/play mark
no layout overflow
video surface remains unobstructed when shell closes
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
- Consumes: existing `LiveTvState`, `LiveTvViewModel`, B0D shell DOM, B0B tokens/primitives, B0F `UI_COPY` where TypeScript/JS boundary permits without coupling core state to copy.
- Produces: BabuşTV-specific Live TV presentation while preserving M3 interaction behavior.

- [ ] **Step 1: Characterize M3 behavior that must not change**

Before modifying presentation, run:

```bash
npm run test:ts -w player
```

Record current pass count in the PR body. Do not rewrite `live-tv-state`, `channel-intent-coordinator`, or `player-session-coordinator` tests to accommodate a visual change.

- [ ] **Step 2: Write presentation RED tests**

Extend `dom-live-tv-view.test.ts` to require distinct classes/data state for:

```text
focused channel
playing channel
focused + playing channel
active category
playback status
numeric zap overlay
```

The test must preserve the invariant that rendering classes never calls playback or mutates intent/state.

Add `babustv-live-tv-presentation.test.js` to assert `ui/live-tv.css` uses BabuşTV semantic tokens and does not contain the inherited red/orange accent literal.

- [ ] **Step 3: Run focused tests and confirm RED**

```bash
npm run test:ts -w player
node --test player/test/babustv-live-tv-presentation.test.js
```

Expected: only the new presentation expectations fail.

- [ ] **Step 4: Implement the TV-native overlay presentation**

Keep the existing behavior model but present category/channel information as one coherent BabuşTV overlay. Focus must be visually stronger than passive selection; playing state must be distinguishable without relying on color alone.

Do not add EPG data, Favorite action, Search, program detail, new timers, or playback decisions.

- [ ] **Step 5: Turkish status surfaces**

Use these exact core statuses:

```text
RESOLVING/PREPARING -> Yayın açılıyor…
RECOVERING -> Yayın yeniden deneniyor…
FAILED -> Yayın açılamadı
```

A failed target remains highlighted according to M3 behavior; presentation must not force focus back to the playing channel.

- [ ] **Step 6: Verify full M3 regression safety**

```bash
npm test
npm run typecheck
npm run build
npm run brand:check
```

Pay special attention to:

```text
highlight != playback
category navigation does not play
CH+/CH- no-wrap behavior
rapid zap last-intent-wins
failed target rollback semantics
Back layer ownership
numeric zap capability gating
```

- [ ] **Step 7: Manual 1920×1080 browser smoke**

Check categories, channels, focused/playing distinction, long channel names, numeric overlay, failure status, and overlay-close state. Do not judge real TV performance from desktop animation smoothness.

- [ ] **Step 8: Commit**

```bash
git add player/src/live-tv/dom-live-tv-view.ts player/src/m3-live-tv.css player/src/ui/live-tv.css \
  player/test-ts/dom-live-tv-view.test.ts player/test/babustv-live-tv-presentation.test.js
git commit -m "feat(b0): reset BabuşTV Live TV presentation"
```

---

### Task 7: B0G — Brand hardening and emulator evidence

**Branch:** `feature/b0g-brand-hardening`

**Dependencies:** B0A–B0F/B0E all merged and post-merge `main` GREEN.

**Files:**
- Modify: `tools/check-legacy-brand.mjs` only for reproduced scanner gaps
- Create: `docs/verification/b0-brand-separation.md`
- Modify tests only for reproduced gaps; do not perform speculative refactors

**Interfaces:**
- Consumes: completed B0 product/presentation.
- Produces: final active-brand audit and emulator/runtime evidence.

- [ ] **Step 1: Run the active legacy-brand gate**

```bash
npm run brand:check
```

Expected: PASS with zero findings in active product/build surfaces.

Also run a broad manual audit for review only:

```bash
rg -ni "EN[- ]?IPTV|IPTVPlayer|@en-iptv|en-tvplayer" . \
  -g '!node_modules/**' -g '!player/dist/**' -g '!tizen/build/**' -g '!.git/**'
```

Classify every remaining hit as one of:

```text
LEGAL_ATTRIBUTION
HISTORICAL_SPEC_OR_BASELINE
BUG_ACTIVE_PRODUCT_SURFACE
```

Any `BUG_ACTIVE_PRODUCT_SURFACE` is a B0G failure and needs root-cause -> RED -> minimum fix -> GREEN.

- [ ] **Step 2: Run the complete automated matrix**

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

Expected package identity: `BabusTVApp.BabusTV`.
Expected feature-branch artifact prefix: `babustv_beta_`.

- [ ] **Step 3: Validate staged package contents**

Verify:

```text
tizen/build/config.xml -> BabuşTV canonical identity
tizen/build/icon.png -> BabuşTV icon
staged index -> BabuşTV title/assets
no absolute asset paths
no active ENTV product strings
```

- [ ] **Step 4: Emulator smoke when the Windows hypervisor path is available**

```bash
em-cli launch -n tv-emu
sdb devices
npm run tizen:emu
```

Record PASS/FAIL/NOT-AVAILABLE for:

```text
app installs and launches
launcher/app identity is BabuşTV
boot screen is BabuşTV
shell is charcoal/violet
remote focus is visible
SELECT/Back navigation still works
Live TV overlay opens without implicit playback
no ENTV/EN-IPTV user-visible text or mark
```

Do not claim real-TV acceptance from emulator evidence.

- [ ] **Step 5: Write final verification document**

`docs/verification/b0-brand-separation.md` must contain:

```text
exact tested commit SHA
automated command matrix and result
legacy-brand broad audit classification
WGT identity/artifact result
browser smoke result
emulator smoke result or NOT-AVAILABLE reason
known hardware-only gates deferred to M3G/M8
```

Do not include credentials, provider URLs, or private stream data.

- [ ] **Step 6: Final diff review against the spec**

Verify B0 did not introduce:

```text
provider protocol changes
playback policy changes
new AVPlay calls in presentation code
new credential fallback/storage behavior
EPG/search/favorites behavior
heavy dependencies/frameworks
```

- [ ] **Step 7: Commit**

```bash
git add docs/verification/b0-brand-separation.md tools/check-legacy-brand.mjs player/test player/test-ts
git commit -m "test(b0): harden BabuşTV brand separation"
```

Only include scanner/test files in the commit if they actually changed because of a reproduced B0G gap.

---

## Merge Order and Dependency Graph

```text
                  ┌─ B0A identity ───────┐
                  ├─ B0B design system ──┤
GREEN main ───────┼─ B0C assets ─────────┼──> GREEN main ──> B0D shell ──> B0E Live TV ──> B0G hardening
                  └─ B0F copy ───────────┘
```

The first four are parallel only because their file ownership is intentionally disjoint. B0D/B0E are sequential because the value of another parallel branch is lower than the merge/review risk once the same presentation DOM becomes shared state.

## Recommended Worker Count

For B0 itself, use **4 parallel workers in wave 1**. This is the practical concurrency ceiling before merge-conflict and review overhead start outweighing elapsed-time gains.

- 2 workers under-use the genuinely independent identity/design/assets/copy surfaces.
- 3 workers is safe but leaves one independent slice idle.
- 4 workers maps exactly to B0A/B0B/B0C/B0F.
- 5+ B0 workers would require splitting cohesive slices or letting two workers touch shared presentation files; do not do that.

An optional **fifth non-B0 lane** can run M3G emulator/runtime verification independently if review bandwidth allows, but it should not be counted as a B0 implementation branch and must not modify B0 presentation speculatively.

## Final B0 Acceptance

B0 is complete only when all are true:

```text
User-visible name/logo/icon/boot = BabuşTV
Active npm/Tizen/WGT identity = BabuşTV
Legacy custom and official Tizen package paths agree
Active product surfaces pass legacy-brand scanner
Charcoal/violet design system is the presentation base
Calico brand mark is present but non-intrusive during playback
Shell/settings/status copy is Turkish-first
Live TV focus/playing/failed states are visually distinct
M3 playback/provider/focus/recovery regression suite remains GREEN
Tizen 5.0+ package contract remains intact
Emulator result is recorded honestly as PASS/FAIL/NOT-AVAILABLE
Legal/historical upstream provenance is preserved outside active product identity
```
