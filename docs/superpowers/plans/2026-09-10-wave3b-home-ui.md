# BabuşTV V1 Wave 3B HOME-UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the merged `HomeViewModel` as a Turkish-first, TV-distance, remote-first Home surface that emits only explicit injected intents and preserves stable focus without taking ownership of application composition.

**Architecture:** HOME-UI is a DOM presentation adapter over `player/src/home/home-domain.ts`. A focused `HomeView` owns Home-local rendering/focus and accepts an injected `onIntent(HomeActionIntent)` callback; it never reads repositories, switches providers, starts playback, or changes global navigation. Home CSS remains unreferenced by `index.html` until M5-COMP performs final application composition.

**Tech Stack:** TypeScript 5.9, DOM APIs, existing BabuşTV CSS tokens/primitives, Node `node:test`/`tsx` with the repository's DOM test approach; no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-10-wave3b-home-m4-pairing-execution-design.md`

## Global Constraints

- ROLE: `HOME-UI`.
- Branch: `feature/home-ui`.
- Exact implementation base: `b55a01642cd03a555712dd64026f3e22f1a81323`.
- Own production files: `player/src/home/home-view.ts`, `player/src/ui/home.css`; one additional new `player/src/home/*` helper is allowed only if single-responsibility tests require it.
- Own test file: `player/test-ts/home-view.test.ts`.
- Consume `HomeViewModel`, `HomeActionIntent`, and stable provider/channel IDs from `player/src/home/home-domain.ts`; do not duplicate HOME-D projection or WATCH-S/Favorites/EPG logic.
- Forbidden: `player/src/main.js`, `player/index.html`, Live TV controller/view/runtime hot zones, provider runtime, storage/repositories, provider switching implementation, playback/session/recovery, global settings/navigation composition.
- Focus/highlight movement alone must never emit a Home action intent.
- Only explicit Select on an actionable focused item may call `onIntent`.
- Physical Samsung/Tizen runtime remains `NOT VERIFIED` unless real device/emulator evidence exists.

---

### Task 1: Freeze Home presentation and stable-focus contract

**Files:**
- Create: `player/src/home/home-view.ts`
- Create: `player/test-ts/home-view.test.ts`

**Interfaces:**
- Consumes: `HomeViewModel`, `HomeActionIntent`.
- Produces: `HomePresentationState`, `HomeViewCallbacks`, `HomeInputAction`, `HomeView`.

- [ ] **Step 1: Write RED contract/render test**

Add a focused test that imports `HomeView` and proves a ready state renders the conceptual order `provider selector -> Last Watched -> Live TV -> Favorites -> Frequently Watched -> Settings` from a synthetic `HomeViewModel`. Assert provider/channel names are written with DOM `textContent`, not interpolated HTML.

Use the public contract:

```ts
export type HomeInputAction = 'left' | 'right' | 'up' | 'down' | 'select' | 'back';

export type HomePresentationState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly model: HomeViewModel };

export interface HomeViewCallbacks {
  onIntent(intent: HomeActionIntent): void;
  onBack(): void;
}
```

- [ ] **Step 2: Prove RED**

Run:

```bash
npm run test:ts -w player -- --test-name-pattern="HOME-UI"
npm run typecheck -w player
```

Expected: FAIL because `home/home-view.ts` does not exist.

- [ ] **Step 3: Implement minimum safe render shell**

Create `HomeView(document, callbacks)` with `show(state)`, `setState(state)`, `hide()`, `isVisible()`, and `handleAction(action)`. Build DOM nodes through `document.createElement` + `textContent`; do not create a string-HTML renderer for provider/channel data.

Use stable focus keys based on domain IDs:

```ts
type HomeFocusKey =
  | 'home-live-tv'
  | 'home-favorites-view-all'
  | 'home-settings'
  | `home-provider:${string}`
  | `home-last-watched:${string}`
  | `home-favorite:${string}`
  | `home-frequent:${string}`;
```

Store each key in `data-home-focus-key` and each actionable item's `HomeActionIntent` in an internal `Map<HomeFocusKey, HomeActionIntent>`; never serialize the intent into markup.

- [ ] **Step 4: Render loading/error without domain invention**

`loading` shows Turkish copy `Ana sayfa hazırlanıyor…`; `error` shows the supplied sanitized message and no actionable provider/channel rows. Neither state emits actions. `ready` renders only what the provided `HomeViewModel` contains.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="HOME-UI"
npm run typecheck -w player
git add player/src/home/home-view.ts player/test-ts/home-view.test.ts
git commit -m "feat(home): add Home presentation shell"
```

---

### Task 2: Add deterministic remote focus, restoration, and explicit intent dispatch

**Files:**
- Modify: `player/src/home/home-view.ts`
- Modify: `player/test-ts/home-view.test.ts`

**Interfaces:**
- Consumes: HOME-D `defaultFocus` and stable IDs.
- Produces: deterministic Home-local focus navigation; no global routing.

- [ ] **Step 1: Write RED focus/intent tests**

Cover all of these behaviors:

1. first ready render maps HOME-D `defaultFocus` to the matching focus key;
2. rerender restores the previous stable provider/channel key when it still exists;
3. when that key disappears, fallback uses HOME-D `defaultFocus` and then the first available actionable key;
4. left/right move only within the current horizontal row and clamp at edges;
5. up/down move between nearest conceptual rows, preserving a valid column where possible;
6. focus movement emits zero intents;
7. `select` emits exactly the mapped `HomeActionIntent` once;
8. `back` calls only `callbacks.onBack()` and never emits a domain intent.

- [ ] **Step 2: Implement row-based focus model**

During each ready render build an ordered `readonly HomeFocusKey[][]` matrix:

```text
provider row
last-watched row when present
live-tv row
favorites row (+ view all when available)
frequently-watched row
settings row
```

Track `{ row, column, key }` internally. Resolve stable-key restoration before positional fallback. Call `element.focus()` and `scrollIntoView({ block: 'nearest', inline: 'nearest' })` only for the chosen key.

- [ ] **Step 3: Keep action semantics presentation-only**

On `select`, look up the current key in the internal action map and call `onIntent(intent)` once. Do not special-case `PLAY_CHANNEL`, `SELECT_PROVIDER`, or navigation intent types; HOME-UI forwards them unchanged.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="HOME-UI"
npm run test:ts -w player
npm run typecheck -w player
git add player/src/home/home-view.ts player/test-ts/home-view.test.ts
git commit -m "feat(home): add remote-first stable focus"
```

---

### Task 3: Add TV-distance Home styling and reduced-motion contract

**Files:**
- Create: `player/src/ui/home.css`
- Modify: `player/test-ts/home-view.test.ts`

- [ ] **Step 1: Write RED stylesheet acceptance**

Assert the stylesheet exists and contains Home-scoped selectors only (`.home-page`, `.home-*`), visible `:focus`/`:focus-visible` treatment based on existing BabuşTV focus tokens, row/card spacing suitable for a 1920x1080 TV surface, and `@media (prefers-reduced-motion: reduce)` with transitions/animations disabled.

- [ ] **Step 2: Implement scoped stylesheet**

Use only existing `--babu-*` design tokens. Keep main content inside a 1920x1080-safe viewport with large typography, clear section spacing, horizontally readable rows, minimum remote-focus target dimensions, and no hover-only affordance. Do not add the stylesheet to `index.html`.

- [ ] **Step 3: Run GREEN and commit**

```bash
npm run test:ts -w player -- --test-name-pattern="HOME-UI"
npm run typecheck -w player
git add player/src/ui/home.css player/test-ts/home-view.test.ts
git commit -m "style(home): add TV-distance Home presentation"
```

---

### Task 4: Verify exact head and open Draft PR

- [ ] **Step 1: Run canonical final gates**

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
```

- [ ] **Step 2: Audit exact scope**

```bash
git diff --name-only b55a01642cd03a555712dd64026f3e22f1a81323...HEAD
git diff --check b55a01642cd03a555712dd64026f3e22f1a81323...HEAD
git diff b55a01642cd03a555712dd64026f3e22f1a81323...HEAD
```

Expected changed files are exactly `player/src/home/home-view.ts`, `player/src/ui/home.css`, and `player/test-ts/home-view.test.ts`, unless the Controller approved one additional new focused Home helper before implementation.

Confirm no `main.js`, `index.html`, Live TV hot-zone, provider/storage/playback code, repository access, credential/provider URL material, or implicit action dispatch appears.

- [ ] **Step 3: Open Draft PR**

Record ROLE, exact base/head, exact changed files, RED/GREEN evidence, stable-ID focus tests, explicit-select-only intent evidence, loading/error behavior, reduced-motion evidence, canonical exact-head gates, and `Physical Tizen runtime: NOT VERIFIED`. Do not mark Ready or merge.
