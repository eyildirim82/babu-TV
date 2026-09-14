# RC FIX: Live TV Search Text Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user type a Live TV Search query with a remote/keyboard, and requalify Search with real key input instead of direct value assignment.

**Architecture:** `DomLiveTvView` keeps one persistent Search section and input while the Search layer stays open. It updates value and results in place, and gives the input DOM focus only while the logical focus zone is `input`. `remote.js` stops routing text-editing keys to the app while that input owns DOM focus; Up/Down/Enter/Back still reach the app. RC-BROWSER specs switch B06/B07/P10 from `fill` to keyboard typing.

**Tech Stack:** TypeScript + plain DOM (no UI framework), `node:test` via `tsx`, Playwright RC-BROWSER harness.

## Global Constraints

- Base: exact `main@0eb86cf81f2b7611fbd7cbb899495d1bd59183e4`; branch `fix/rc-search-text-entry`.
- Do not introduce React or another UI framework.
- Hot-zone grant for this plan only: `player/src/live-tv/dom-live-tv-view.ts`, `player/src/remote.js`. No other production file.
- Preserve playback, channel navigation, numeric zap and settings key behaviour outside a focused Live TV Search input.
- Highlight ≠ playback: typing or result highlight must never start playback.
- Physical Tizen IME behaviour (on-screen keyboard open/close, Done/Cancel keys) stays NOT VERIFIED / DEFERRED; do not claim it.
- Never log or persist query text beyond existing behaviour.
- Bugs follow root cause → RED → minimum fix → GREEN → full verification.

## Root cause (established)

1. `.live-tv-search-input` is never DOM-focused (no `.focus()` in `player/src/live-tv` or `player/src/search`), so keystrokes and an IME cannot reach it.
2. `renderFeatures()` creates a new input on every render, and every `input` event re-renders (`onSearchQuery` → `controller.updateSearchQuery` → `render`), so focus would be lost after each character. Re-inserting the same node via `replaceChildren` also blurs it.
3. `remote.js` `handleKeyDown` calls `preventDefault()` for `Backspace`, space and `r`/`R`, and maps digits, space, `r` and Backspace to app actions (`number`/`digit`, `playpause`, `reload`, `back`).

## File structure

- Modify `player/src/live-tv/dom-live-tv-view.ts`: persistent Search section/input, in-place results, focus ownership, section sync that never moves a kept Search section.
- Create `player/test-ts/live-tv-search-text-entry.test.ts`: focus-aware fake DOM plus view tests.
- Modify `player/test-ts/m4-live-tv-dom.test.ts`, `player/test-ts/rc-browser-live-search-entry.test.ts`: add no-op `focus()`/`blur()` to their fake elements (the view now focuses the input).
- Modify `player/src/remote.js`: focused-Search-input branch.
- Modify `player/test/remote.test.js`: focused Search input key routing tests.
- After merge, on `verification/v1-rc-browser-h2`: modify `tools/rc-browser/specs/pack-b-live.spec.mjs`, `tools/rc-browser/specs/pack-b-play-nav.spec.mjs`, `docs/verification/rc-browser-execution.md`, `.github/workflows/rc-browser.yml`.

---

### Task 1: View owns a persistent, focused Search input

**Files:**
- Modify: `player/src/live-tv/dom-live-tv-view.ts` (`renderFeatures`, new private helpers)
- Create: `player/test-ts/live-tv-search-text-entry.test.ts`
- Modify: `player/test-ts/m4-live-tv-dom.test.ts`, `player/test-ts/rc-browser-live-search-entry.test.ts` (fake `focus`/`blur`)

**Interfaces:**
- Consumes: `LiveTvFeatureComposition` (`refresh`, `openSearch`, `updateSearchQuery`, `handleSearchKeyboard`) from `player/src/live-tv/live-tv-feature-composition.ts`; `DomLiveTvViewCallbacks.onSearchQuery(query)`.
- Produces: DOM contract. While `features.layer === 'search'`, the same `input.live-tv-search-input` element instance persists across renders and is `document.activeElement` iff `features.search.focusZone === 'input'`. Results stay direct children of `[data-feature-section="search"]` after the input.

- [ ] **Step 1: Write the failing tests** in `player/test-ts/live-tv-search-text-entry.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel } from '../src/domain/models.js';
import type { LiveTvState } from '../src/live-tv/contracts.js';
import { DomLiveTvView } from '../src/live-tv/dom-live-tv-view.js';
import {
  createLiveTvFeatureComposition,
  type LiveTvFeatureState,
} from '../src/live-tv/live-tv-feature-composition.js';

class FakeClassList {
  private readonly values = new Set<string>();
  add(...names: string[]): void { for (const name of names) this.values.add(name); }
  remove(...names: string[]): void { for (const name of names) this.values.delete(name); }
  toggle(name: string, force?: boolean): boolean {
    const next = force ?? !this.values.has(name);
    if (next) this.values.add(name); else this.values.delete(name);
    return next;
  }
  contains(name: string): boolean { return this.values.has(name); }
}

// Models the browser rules the fix depends on: detaching a node that holds
// focus blurs it, and replaceChildren detaches every existing child first.
class FakeElement {
  textContent = '';
  className = '';
  value = '';
  type = '';
  autocomplete = '';
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList();
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(private readonly owner: FakeDocument) {}

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) { node.detach(); node.parentElement = this; this.children.push(node); }
  }
  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of [...this.children]) child.detach();
    this.append(...nodes);
  }
  insertBefore(node: FakeElement, reference: FakeElement | null): FakeElement {
    node.detach();
    const index = reference === null ? -1 : this.children.indexOf(reference);
    node.parentElement = this;
    if (index === -1) this.children.push(node); else this.children.splice(index, 0, node);
    return node;
  }
  remove(): void { this.detach(); }
  contains(node: FakeElement | null): boolean {
    for (let current = node; current !== null; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }
  focus(): void { this.owner.activeElement = this; }
  blur(): void { if (this.owner.activeElement === this) this.owner.activeElement = this.owner.body; }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  dispatch(type: string): void { for (const listener of this.listeners.get(type) ?? []) listener(); }

  private detach(): void {
    const parent = this.parentElement;
    if (parent === null) return;
    if (this.contains(this.owner.activeElement)) this.owner.activeElement = this.owner.body;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

class FakeDocument {
  readonly body: FakeElement;
  activeElement: FakeElement | null;
  private readonly elements = new Map<string, FakeElement>();

  constructor(ids: readonly string[]) {
    this.body = new FakeElement(this);
    this.activeElement = this.body;
    for (const id of ids) {
      const element = new FakeElement(this);
      this.body.append(element);
      this.elements.set(id, element);
    }
  }
  getElementById(id: string): FakeElement | null { return this.elements.get(id) ?? null; }
  createElement(): FakeElement { return new FakeElement(this); }
}

function channel(id: string, name: string): Channel {
  return { providerId: 'provider-a', id, name, categoryId: null, logoUrl: null, number: null };
}

const channels = [channel('1', 'Şeker'), channel('2', 'Spor'), channel('3', 'Haber')];
const refreshInput = {
  providerId: 'provider-a',
  channels,
  visibleChannels: channels,
  categories: [],
  highlightedChannelId: '1',
};

function liveState(): LiveTvState {
  return {
    providerId: 'provider-a',
    playingChannelId: null,
    highlightedChannelId: '1',
    activeScope: { kind: 'all' },
    restoreChannelIdByScope: {},
    overlayOpen: true,
    overlayZone: 'CHANNEL',
    playbackStatus: 'IDLE',
    pendingIntent: null,
    playbackError: null,
    numericInput: '',
  };
}

async function fixture() {
  const composition = createLiveTvFeatureComposition({
    epg: { async getCurrent() { return null; }, async getNext() { return null; } },
    favorites: {
      async isFavorite() { return false; },
      async toggle() { return true; },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 0,
  });
  await composition.refresh(refreshInput);
  const document = new FakeDocument(['sidebar', 'channel-list', 'group-list', 'channel-name', 'live-tv-status', 'numeric-zap']);
  const queries: string[] = [];
  const view = new DomLiveTvView(document as unknown as Document, {
    onSearchQuery(query) { queries.push(query); },
  });
  const render = (features: LiveTvFeatureState) => view.render(liveState(), {
    categories: [], channels, visibleChannels: channels, features,
  });
  const searchSection = () => document.getElementById('sidebar')!.children
    .find((element) => element.dataset.featureRoot === 'm4')!.children
    .find((element) => element.dataset.featureSection === 'search') ?? null;
  const searchInput = () => searchSection()?.children
    .find((element) => element.className === 'live-tv-search-input') ?? null;
  const resultKeys = () => searchSection()?.children
    .filter((element) => element.dataset.resultKey !== undefined)
    .map((element) => element.dataset.resultKey) ?? [];
  return { composition, document, queries, render, searchInput, resultKeys };
}

void test('Search input takes DOM focus when Search opens on the input zone', async () => {
  const { composition, document, render, searchInput } = await fixture();

  render(composition.openSearch(refreshInput));

  assert.ok(searchInput());
  assert.equal(document.activeElement, searchInput());
});

void test('typing re-renders keep the same focused Search input and update results in place', async () => {
  const { composition, document, queries, render, searchInput, resultKeys } = await fixture();
  render(composition.openSearch(refreshInput));
  const input = searchInput()!;

  input.value = 'ş';
  input.dispatch('input');
  const typed = composition.updateSearchQuery(refreshInput, queries.at(-1)!);
  render(typed);

  assert.deepEqual(queries, ['ş']);
  assert.equal(searchInput(), input);
  assert.equal(document.activeElement, input);
  assert.equal(input.value, 'ş');
  assert.ok(typed.search.items.length > 0);
  assert.deepEqual(resultKeys(), typed.search.items.map((item) => item.key));

  const changed = composition.updateSearchQuery(refreshInput, 'haber');
  render(changed);
  assert.equal(searchInput(), input);
  assert.equal(document.activeElement, input);
  assert.deepEqual(resultKeys(), changed.search.items.map((item) => item.key));
});

void test('moving into results releases input focus and returning to the input restores it', async () => {
  const { composition, document, render, searchInput } = await fixture();
  render(composition.openSearch(refreshInput, 's'));
  const input = searchInput()!;

  render(composition.handleSearchKeyboard({ key: 'ArrowDown', keyCode: 40 }).state);
  assert.equal(searchInput(), input);
  assert.notEqual(document.activeElement, input);

  render(composition.handleSearchKeyboard({ key: 'ArrowUp', keyCode: 38 }).state);
  assert.equal(searchInput(), input);
  assert.equal(document.activeElement, input);
});

void test('closing Search drops the input and a reopened Search starts focused with the new query', async () => {
  const { composition, document, render, searchInput } = await fixture();
  const opened = composition.openSearch(refreshInput, 'ş');
  render(opened);
  const first = searchInput()!;

  render({ ...opened, layer: 'none' });
  assert.equal(searchInput(), null);
  assert.notEqual(document.activeElement, first);

  render(composition.openSearch(refreshInput, 'h'));
  const reopened = searchInput()!;
  assert.notEqual(reopened, first);
  assert.equal(reopened.value, 'h');
  assert.equal(document.activeElement, reopened);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd player && npx tsx --test test-ts/live-tv-search-text-entry.test.ts`
Expected: FAIL. `activeElement` stays `body` (no focus), and after the typing re-render `searchInput()` is a different element instance.

- [ ] **Step 3: Implement** in `player/src/live-tv/dom-live-tv-view.ts`

Add fields next to `featureRoot`:

```ts
  private searchSection: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private searchResults: HTMLElement[] = [];
```

In `renderFeatures`, reset the Search refs in the `features === undefined` branch before returning:

```ts
      this.releaseSearch();
```

Replace the whole `if (features.layer === 'search') { ... }` block with:

```ts
    if (features.layer === 'search') {
      sections.push(this.renderSearch(features.search));
    } else {
      this.releaseSearch();
    }
```

Replace `this.featureRoot.replaceChildren(...sections);` with:

```ts
    this.syncFeatureSections(sections);
```

and after `this.featureRoot.dataset.activeLayer = features.layer;` add:

```ts
    this.syncSearchFocus(features.layer === 'search' && features.search.focusZone === 'input');
```

Add the helpers (import `SearchViewModel` type from `../search/search-view-model.js`):

```ts
  // The Search layer keeps one section and input while it stays open. Every
  // input event re-renders, and recreating or re-inserting the input would
  // drop DOM focus (and a TV IME) after each character.
  private renderSearch(search: SearchViewModel): HTMLElement {
    let section = this.searchSection;
    let input = this.searchInput;
    if (section === null || input === null) {
      section = this.document.createElement('div');
      section.className = 'live-tv-search';
      section.dataset.featureSection = 'search';
      const created = this.document.createElement('input');
      created.className = 'live-tv-search-input';
      created.type = 'search';
      created.autocomplete = 'off';
      created.addEventListener('input', () => {
        this.callbacks.onSearchQuery?.(created.value);
      });
      section.append(created);
      input = created;
      this.searchSection = section;
      this.searchInput = input;
    }

    section.dataset.presentationState = search.status;
    if (input.value !== search.query) input.value = search.query;
    input.dataset.presentationState = search.focusZone === 'input' ? 'focused' : 'idle';

    for (const result of this.searchResults) result.remove();
    this.searchResults = search.items.map((item) => {
      const result = this.document.createElement('div');
      result.className = 'live-tv-search-result';
      result.dataset.resultKey = item.key;
      result.dataset.presentationState = item.key === search.focusedResultKey ? 'focused' : 'idle';
      result.textContent = item.numberText === null
        ? item.primaryText
        : `${item.numberText} ${item.primaryText}`;
      return result;
    });
    section.append(...this.searchResults);
    return section;
  }

  private releaseSearch(): void {
    this.searchSection = null;
    this.searchInput = null;
    this.searchResults = [];
  }

  // Keeps an already attached Search section in place: siblings are removed or
  // inserted around it, so its focused input is never detached.
  private syncFeatureSections(sections: readonly HTMLElement[]): void {
    const kept = this.searchSection;
    if (kept === null || !sections.includes(kept) || kept.parentElement !== this.featureRoot) {
      this.featureRoot.replaceChildren(...sections);
      return;
    }
    for (const child of Array.from(this.featureRoot.children)) {
      if (!sections.includes(child as HTMLElement)) child.remove();
    }
    sections.forEach((section, index) => {
      const current = this.featureRoot.children[index] ?? null;
      if (current !== section) this.featureRoot.insertBefore(section, current);
    });
  }

  private syncSearchFocus(inputOwnsFocus: boolean): void {
    const input = this.searchInput;
    if (input === null) return;
    if (inputOwnsFocus) {
      if (this.document.activeElement !== input) input.focus();
    } else if (this.document.activeElement === input) {
      input.blur();
    }
  }
```

Add no-op fake focus methods to the `FakeElement` classes in `player/test-ts/m4-live-tv-dom.test.ts` and `player/test-ts/rc-browser-live-search-entry.test.ts`:

```ts
  focus(): void {}
  blur(): void {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd player && npx tsx --test test-ts/live-tv-search-text-entry.test.ts test-ts/m4-live-tv-dom.test.ts test-ts/rc-browser-live-search-entry.test.ts test-ts/dom-live-tv-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add player/src/live-tv/dom-live-tv-view.ts player/test-ts/live-tv-search-text-entry.test.ts player/test-ts/m4-live-tv-dom.test.ts player/test-ts/rc-browser-live-search-entry.test.ts
git commit -m "fix(live-tv): keep a focused Search input across renders"
```

---

### Task 2: Remote routing leaves text editing to a focused Search input

**Files:**
- Modify: `player/src/remote.js` (`handleKeyDown`, new helper)
- Modify: `player/test/remote.test.js`

**Interfaces:**
- Consumes: Task 1 DOM contract (`document.activeElement` is the `.live-tv-search-input` while the input zone owns focus).
- Produces: while that input is focused, only `up`/`down`/`select`/`back` are dispatched (with `preventDefault`); every other key is left to the input with no action and no `preventDefault`.

- [ ] **Step 1: Write the failing tests** (append to `player/test/remote.test.js`)

```js
function focusLiveTvSearchInput() {
  globalThis.document.activeElement = {
    tagName: 'INPUT',
    classList: { contains: (name) => name === 'live-tv-search-input' },
  };
}

function pressTracked(fake, key, keyCode = 0) {
  let prevented = false;
  fake.pressEvent({ key, keyCode, preventDefault() { prevented = true; }, stopPropagation() {} });
  return prevented;
}

test('a focused Live TV Search input keeps text-editing keys', () => {
  const fake = installFakeDocument();
  const actions = [];
  init((...args) => actions.push(args), { numericMode: 'digits' });
  focusLiveTvSearchInput();

  const prevented = [
    pressTracked(fake, 'r', 82),
    pressTracked(fake, 'R', 82),
    pressTracked(fake, '5', 53),
    pressTracked(fake, ' ', 32),
    pressTracked(fake, 'Backspace', 8),
    pressTracked(fake, 'ArrowLeft', 37),
    pressTracked(fake, 'ArrowRight', 39),
    pressTracked(fake, 'ş', 0),
  ];

  assert.deepEqual(actions, []);
  assert.deepEqual(prevented, [false, false, false, false, false, false, false, false]);
});

test('a focused Live TV Search input still routes Search navigation keys to the app', () => {
  const fake = installFakeDocument();
  const actions = [];
  init((...args) => actions.push(args));
  focusLiveTvSearchInput();

  const prevented = [
    pressTracked(fake, 'ArrowUp', 38),
    pressTracked(fake, 'ArrowDown', 40),
    pressTracked(fake, 'Enter', 13),
    pressTracked(fake, 'GoBack', 10009),
    pressTracked(fake, 'Escape', 27),
  ];

  assert.deepEqual(actions, [['up'], ['down'], ['select'], ['back'], ['back']]);
  assert.deepEqual(prevented, [true, true, true, true, true]);
});
```

Extend `installFakeDocument()`'s returned object with a raw event sender:

```js
    pressEvent(event) {
      keydownHandler(event);
    },
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test player/test/remote.test.js`
Expected: FAIL. `r` dispatches `['reload']`, `5` dispatches `['digit', 5]`, space `['playpause']`, Backspace `['back']`, Left/Right `['left']`/`['right']`, and several are `preventDefault`ed.

- [ ] **Step 3: Implement** in `player/src/remote.js`

Add above `handleKeyDown`:

```js
function isLiveTvSearchInputFocused() {
  const active = document.activeElement;
  return Boolean(active && active.classList && active.classList.contains('live-tv-search-input'));
}
```

Insert at the start of `handleKeyDown`, right after `const key = e.key || e.keyCode;`:

```js
  // Live TV Search owns text entry while its input has DOM focus. Only Search
  // navigation reaches the app; letters, digits, space, Backspace and caret
  // movement stay with the input.
  if (isLiveTvSearchInputFocused()) {
    let action = null;
    if (key === 'ArrowUp' || e.keyCode === 38) action = 'up';
    else if (key === 'ArrowDown' || e.keyCode === 40) action = 'down';
    else if (key === 'Enter' || e.keyCode === 13) action = 'select';
    else if (key === 'Escape' || key === 'GoBack' || e.keyCode === 27 || e.keyCode === 10009) action = 'back';
    if (action !== null) {
      e.preventDefault();
      onKeyAction(action);
    }
    return;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test player/test/remote.test.js`
Expected: PASS, including the pre-existing remote tests.

- [ ] **Step 5: Full verification and commit**

Run: `npm test`, `npm run typecheck`, `npm run build`, `node tools/check-m7-security-privacy.mjs`, `git diff --check`.
Expected: exit 0 in Linux CI. On the Windows checkout, only the known CRLF-only failures (`copy.d.ts matches the exact UI_COPY declaration shape`, three `PAIR-I-WIRE` tests) may appear, identical on an untouched checkout.

```bash
git add player/src/remote.js player/test/remote.test.js
git commit -m "fix(remote): leave text editing to a focused Live TV Search input"
```

Open a Draft PR against `main` with RED/GREEN evidence and the local browser counterfactual from Task 3 Step 2.

---

### Task 3: Requalify Search with real key input (after merge, on H2)

**Files:**
- Modify: `tools/rc-browser/specs/pack-b-live.spec.mjs` (`openSearch`, B06, B07)
- Modify: `tools/rc-browser/specs/pack-b-play-nav.spec.mjs` (P10)
- Modify: `.github/workflows/rc-browser.yml` (`RC_PRODUCTION_SHA`), `docs/verification/rc-browser-execution.md`

**Interfaces:**
- Consumes: Task 1 DOM contract and Task 2 key routing, in the built bundle.
- Produces: RC evidence that Search text is entered with keyboard events and that the input holds DOM focus.

- [ ] **Step 1: Switch specs to keyboard typing**

In `pack-b-live.spec.mjs`, `openSearch()` ends with:

```js
  await expect(page.locator('.live-tv-search-input')).toBeFocused();
```

B06 loop body becomes:

```js
    let previous = '';
    for (const [query, expected] of cases) {
      const input = page.locator('.live-tv-search-input');
      await expect(input).toBeFocused();
      for (let index = 0; index < previous.length; index += 1) await page.keyboard.press('Backspace');
      await page.keyboard.type(query);
      await expect(input).toHaveValue(query);
      await expect(page.locator(SEARCH_RESULT).first()).toContainText(expected);
      const keys = await page.locator(SEARCH_RESULT).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-result-key')));
      expect(keys.every((key) => key?.startsWith(`${providerA}:`))).toBe(true);
      previous = query;
    }
```

B07 replaces `input.fill('şeker')` + `dispatchEvent('input')` with:

```js
    await expect(input).toBeFocused();
    await page.keyboard.type('şeker');
    await expect(input).toHaveValue('şeker');
```

(`şeker` contains `r`, which `remote.js` previously swallowed as reload.)

In `pack-b-play-nav.spec.mjs` P10, after the Search layer opens, add before Back:

```js
  await expect(page.locator('.live-tv-search-input')).toBeFocused();
  await page.keyboard.type('4');
  await expect(page.locator('.live-tv-search-input')).toHaveValue('4');
  expect(await status(page).getAttribute('data-playback-status')).toBe(playbackBefore);
```

(`4` would otherwise be a numeric zap.)

- [ ] **Step 2: Local counterfactual before merge**

Build `player` at `fix/rc-search-text-entry` into the H2 worktree (copy the two production files, do not commit), run `pack-b-live` and `pack-b-play-nav`.
Expected: the updated B06/B07/P10 PASS with the fix. With `main@0eb86cf` production files restored, the same specs FAIL at `toBeFocused()` / `toHaveValue()`.

- [ ] **Step 3: After the fix PR merges**

Merge exact post-merge `main` into `verification/v1-rc-browser-h2`, set `RC_PRODUCTION_SHA` to that SHA, commit the spec changes, push, and require the integrated `rc-browser` run to be SUCCESS.

- [ ] **Step 4: Update the evidence board**

In `docs/verification/rc-browser-execution.md`: move the Search text-entry defect to resolved (PR, root cause, requalified rows), set production/head SHAs and run IDs from Step 3, and restore the acceptance checklist row only if the run is GREEN. Keep the physical Tizen IME row under NOT VERIFIED / DEFERRED.

```bash
git add tools/rc-browser/specs/pack-b-live.spec.mjs tools/rc-browser/specs/pack-b-play-nav.spec.mjs .github/workflows/rc-browser.yml docs/verification/rc-browser-execution.md
git commit -m "test(rc-browser): requalify Search with keyboard text entry"
```
