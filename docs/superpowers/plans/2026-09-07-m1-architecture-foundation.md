# BabuşTV M1 Architecture Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the typed, testable application boundaries that M2–M6 depend on without changing current Live TV behavior: TypeScript contracts, platform/playback/provider/repository seams, focus state, safe logging, and deterministic fake-provider fixtures.

**Architecture:** M1 is split into four bounded PR slices so no single refactor destabilizes the inherited EN TV Player baseline. M1A introduces typed contracts and test tooling without wiring production behavior. M1B moves Tizen/platform concerns behind adapters. M1C introduces playback service/adapters around the inherited Shaka/AVPlay implementation. M1D establishes repository/provider/focus foundations and deterministic test fixtures. Each slice must keep `main` buildable and preserve existing user-visible behavior.

**Tech Stack:** Node 22, npm workspaces, Vite 6 (`es2015` build target), TypeScript 5.x, `tsx` for Node test execution of TypeScript, Shaka Player 5.2, Samsung Tizen Web APIs, Node built-in test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`

## Global Constraints

- Samsung Tizen is the target platform; the generated bundle remains compatible with the current Vite `es2015` target until the mandatory Tizen 5 compatibility spike says otherwise.
- No React migration.
- No user-visible Xtream/M3U onboarding, Home, or Live TV redesign in M1.
- Preserve current Shaka + AVPlay playback behavior unless a task explicitly characterizes and moves it behind a boundary.
- Core navigation must ultimately remain usable with Up, Down, Left, Right, OK, and Back.
- Provider secrets, credential-bearing URLs, tokens, real playlists, real EPG dumps, signing keys, and decrypted pairing payloads must never be committed or logged.
- Tizen APIs belong behind platform/playback adapters once those boundaries exist.
- Stable identity is provider-scoped; focus/favorites must not depend on raw array position.
- No blind upstream merge. Fresh-check `Nur-allhi/en-tvplayer` before each new PR slice.
- Every behavior-changing task follows root cause/characterization -> RED -> minimum implementation -> GREEN -> full verification.
- Every PR requires exact-head CI GREEN before completion or merge claims.

---

## PR Slice M1A — Typed Contracts, Sanitization, and Test Foundation

**Branch:** `refactor/m1a-contracts-foundation`

### Task 1: Add TypeScript Test/Typecheck Tooling

**Files:**
- Modify: `player/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `player/tsconfig.json`
- Modify: `.github/workflows/verify.yml`

**Interfaces:**
- Produces root commands `npm run typecheck` and `npm test` that execute both inherited JS characterization tests and M1 TypeScript tests.
- TypeScript source is ESM and compiled by Vite; `tsc` is validation-only (`noEmit`).

- [ ] **Step 1: Add the failing verification expectation**

Update `.github/workflows/verify.yml` after the existing `npm test` step:

```yaml
      - name: Typecheck
        run: npm run typecheck
```

Run CI or a disposable dependency-install workflow before adding TypeScript tooling. Expected: FAIL because `typecheck` does not exist.

- [ ] **Step 2: Add TypeScript scripts and dev dependencies**

`player/package.json` must contain:

```json
{
  "scripts": {
    "dev": "vite --port 5173 --host",
    "build": "vite build",
    "preview": "vite preview --port 4173 --host",
    "test:ts": "tsx --test test-ts/*.test.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vite": "^6.3.5"
  }
}
```

Root `package.json` must contain:

```json
{
  "scripts": {
    "test": "node --test player/test/*.test.js && npm run test:ts -w player",
    "typecheck": "npm run typecheck -w player"
  }
}
```

Regenerate `package-lock.json` with npm; do not hand-edit package integrity hashes.

- [ ] **Step 3: Add TypeScript configuration**

Create `player/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2015",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2015", "DOM"],
    "strict": true,
    "noEmit": true,
    "allowJs": false,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test-ts/**/*.ts"]
}
```

If `@types/node` is required by `tsc`, add it as a dev dependency in the same npm install so the lockfile remains generated, not manually synthesized.

- [ ] **Step 4: Verify tooling**

Run:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0; inherited 9 JS tests remain GREEN.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json player/package.json player/tsconfig.json .github/workflows/verify.yml
git commit -m "chore(m1): add typed verification foundation"
```

### Task 2: Define Minimal Domain Contracts

**Files:**
- Create: `player/src/domain/models.ts`
- Create: `player/src/domain/actions.ts`
- Test: `player/test-ts/domain-contracts.test.ts`

**Interfaces:**
- Produces `ProviderId`, `ChannelId`, `CategoryId`, `ProviderKind`, `ProviderSummary`, `Category`, `Channel`, `EpgProgram`, `LogicalAction`, `FocusZone`, and `FocusState`.
- IDs are strings and provider-scoped; no array-index identity is exposed.

- [ ] **Step 1: Write the type/runtime test first**

Create `player/test-ts/domain-contracts.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChannelKey } from '../src/domain/models.js';

void test('channel identity is provider scoped', () => {
  assert.equal(makeChannelKey('provider-a', '42'), 'provider-a:42');
  assert.equal(makeChannelKey('provider-b', '42'), 'provider-b:42');
});
```

Run `npm run test:ts -w player`. Expected: FAIL because `models.ts` does not exist.

- [ ] **Step 2: Implement the minimal contracts**

`models.ts` must expose:

```ts
export type ProviderId = string;
export type ChannelId = string;
export type CategoryId = string;
export type ProviderKind = 'xtream' | 'm3u';

export interface ProviderSummary {
  id: ProviderId;
  kind: ProviderKind;
  name: string;
}

export interface Category {
  providerId: ProviderId;
  id: CategoryId;
  name: string;
}

export interface Channel {
  providerId: ProviderId;
  id: ChannelId;
  name: string;
  categoryId: CategoryId | null;
  logoUrl: string | null;
  number: number | null;
}

export interface EpgProgram {
  channelId: ChannelId;
  startMs: number;
  endMs: number;
  title: string;
  description: string | null;
}

export function makeChannelKey(providerId: ProviderId, channelId: ChannelId): string {
  return `${providerId}:${channelId}`;
}
```

`actions.ts` must expose:

```ts
export type LogicalAction =
  | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SELECT' | 'BACK'
  | 'OPTIONS' | 'CHANNEL_UP' | 'CHANNEL_DOWN';

export type FocusZone = 'HOME' | 'CATEGORY' | 'CHANNEL' | 'ACTIONS' | 'SETTINGS';

export interface FocusState {
  screen: 'ONBOARDING' | 'HOME' | 'LIVE_TV' | 'SETTINGS';
  zone: FocusZone;
  itemId: string | null;
  restoreItemId: string | null;
}
```

- [ ] **Step 3: Run tests and typecheck**

```bash
npm run test:ts -w player
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add player/src/domain player/test-ts/domain-contracts.test.ts
git commit -m "feat(domain): define provider scoped core contracts"
```

### Task 3: Add Secret-Safe URL and Log Sanitization

**Files:**
- Create: `player/src/logging/sanitize.ts`
- Test: `player/test-ts/sanitize.test.ts`

**Interfaces:**
- Produces `sanitizeUrlForLog(value: string): string` and `sanitizeLogValue(value: unknown): unknown`.
- Removes URL userinfo and redacts credential/token query keys without destroying benign host/path diagnostics.

- [ ] **Step 1: Write RED tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUrlForLog } from '../src/logging/sanitize.js';

void test('redacts credentials and tokens from URLs', () => {
  const raw = 'https://alice:secret@example.com/live/42?username=alice&password=secret&token=abc&quality=hd';
  assert.equal(
    sanitizeUrlForLog(raw),
    'https://example.com/live/42?username=%5BREDACTED%5D&password=%5BREDACTED%5D&token=%5BREDACTED%5D&quality=hd',
  );
});

void test('returns non URLs without throwing', () => {
  assert.equal(sanitizeUrlForLog('not-a-url'), 'not-a-url');
});
```

Run `npm run test:ts -w player`. Expected: FAIL because sanitizer does not exist.

- [ ] **Step 2: Implement minimum sanitizer**

Redact case-insensitively at least: `username`, `user`, `password`, `pass`, `token`, `auth`, `authorization`, `apikey`, `api_key`, `key`.

Do not log or return URL userinfo. Preserve ordinary query parameters.

- [ ] **Step 3: GREEN and full verification**

```bash
npm test
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add player/src/logging/sanitize.ts player/test-ts/sanitize.test.ts
git commit -m "feat(logging): add credential safe sanitization"
```

### Task 4: Define Boundary Interfaces Without Wiring Production

**Files:**
- Create: `player/src/platform/contracts.ts`
- Create: `player/src/playback/contracts.ts`
- Create: `player/src/providers/contracts.ts`
- Create: `player/src/repository/contracts.ts`
- Test: `player/test-ts/boundary-contracts.test.ts`

**Interfaces:**

`Platform`:

```ts
export interface PlatformCapabilities {
  tizen: boolean;
  optionsKey: boolean;
  channelKeys: boolean;
  numericKeys: boolean;
}

export interface Platform {
  capabilities(): PlatformCapabilities;
  registerOptionalKeys(keys: readonly string[]): void;
  exitApp(): void;
}
```

`Playback`:

```ts
export type PlaybackState = 'IDLE' | 'RESOLVING' | 'PREPARING' | 'PLAYING' | 'BUFFERING' | 'FAILED';
export type PlaybackErrorCode = 'AUTH' | 'NETWORK' | 'TIMEOUT' | 'STREAM_NOT_FOUND' | 'UNSUPPORTED_CODEC' | 'ENGINE_FAILURE' | 'UNKNOWN';

export interface StreamRequest {
  url: string;
  userAgent?: string;
  referer?: string;
  headers?: Readonly<Record<string, string>>;
}

export interface PlaybackResult {
  ok: boolean;
  engine: 'shaka' | 'avplay' | null;
  error: PlaybackErrorCode | null;
}

export interface PlaybackService {
  play(request: StreamRequest): Promise<PlaybackResult>;
  stop(): Promise<void> | void;
}
```

`ProviderAdapter`:

```ts
export interface ProviderAdapter {
  readonly kind: ProviderKind;
  listCategories(providerId: ProviderId): Promise<readonly Category[]>;
  listChannels(providerId: ProviderId): Promise<readonly Channel[]>;
  resolveStream(providerId: ProviderId, channelId: ChannelId): Promise<StreamRequest>;
}
```

`Repository`:

```ts
export interface ChannelRepository {
  replaceProviderChannels(providerId: ProviderId, channels: readonly Channel[]): Promise<void>;
  listChannels(providerId: ProviderId): Promise<readonly Channel[]>;
  getChannel(providerId: ProviderId, channelId: ChannelId): Promise<Channel | null>;
}
```

- [ ] **Step 1: Write compile/runtime contract smoke test**

Create a tiny in-test fake that satisfies each interface and assert one returned value. Run `npm run test:ts -w player`; expected RED until interfaces exist.

- [ ] **Step 2: Add interfaces exactly as above**

Do not modify `main.js`, `player.js`, `avplay.js`, `remote.js`, `ui.js`, or `settings.js` in M1A.

- [ ] **Step 3: Verify M1A**

```bash
npm ci
npm test
npm run typecheck
npm run build
git diff --exit-code
```

Review `git diff main...HEAD` to confirm M1A contains no product-visible wiring.

- [ ] **Step 4: Open Draft PR and wait for exact-head CI**

PR title: `refactor: establish M1 typed architecture contracts`

M1A merges only after explicit approval.

---

## PR Slice M1B — Platform and Focus Foundation

**Branch after M1A merge:** `refactor/m1b-platform-focus`

### Task 5: Introduce Browser/Tizen Platform Implementations

**Files:**
- Create: `player/src/platform/browser-platform.ts`
- Create: `player/src/platform/tizen-platform.ts`
- Create: `player/src/platform/create-platform.ts`
- Test: `player/test-ts/platform.test.ts`
- Modify after RED: `player/src/main.js` only to delegate optional-key registration/exit behavior.

**Produces:** `createPlatform(windowLike)` returning a `Platform`; browser implementation no-ops safely, Tizen implementation owns `tvinputdevice.registerKey` and application exit calls.

Test injected fake Tizen objects; do not require a real TV for unit tests. Characterize current registered key list before moving it.

Full gate: JS tests + TS tests + typecheck + build. Because this touches Tizen integration, perform emulator smoke when available before merge.

---

## PR Slice M1C — Playback Boundary

**Branch after M1B merge:** `refactor/m1c-playback-boundary`

### Task 6: Wrap Inherited Shaka/AVPlay Behind Adapters

**Files:**
- Create: `player/src/playback/shaka-adapter.ts`
- Create: `player/src/playback/avplay-adapter.ts`
- Create: `player/src/playback/playback-service.ts`
- Test: `player/test-ts/playback-service.test.ts`
- Modify minimally: `player/src/main.js`, `player/src/player.js`, `player/src/avplay.js`

**Produces:** UI/main code calls `PlaybackService`; direct `webapis.avplay` ownership stays in AVPlay implementation. Preserve inherited fallback sequence and AVPlay inactive-stop regression guard.

Before changing production wiring, add characterization tests for current fallback selection and failure outcomes. No dual-session/minimum-disruption behavior yet; that remains a mandatory spike before M3.

Tizen-sensitive gate: unit tests + typecheck + build + packaging probe; emulator/RTL/manual smoke when accessible.

---

## PR Slice M1D — Provider/Repository/Fake-Data Foundation

**Branch after M1C merge:** `refactor/m1d-provider-repository-foundation`

### Task 7: Add In-Memory Repository and Stable-ID Reconciliation Primitive

**Files:**
- Create: `player/src/repository/memory-channel-repository.ts`
- Create: `player/src/repository/reconcile.ts`
- Test: `player/test-ts/repository.test.ts`

**Produces:** deterministic provider-scoped storage for tests and a reconciliation result `{ added, updated, removed, retained }` keyed by `providerId + channelId`. No IndexedDB implementation yet; M2 will introduce persistent repositories behind the same contract.

Tests cover duplicate external IDs across two providers, update by stable ID, removal, retained entries, and order changes not changing identity.

### Task 8: Add Fake Provider and Synthetic Fixtures

**Files:**
- Create: `player/src/providers/fake-provider.ts`
- Create: `player/test-ts/fixtures/provider-fixtures.ts`
- Test: `player/test-ts/fake-provider.test.ts`

**Produces:** deterministic fake provider capable of success, 401, 403, 404, 500, timeout, malformed response, duplicate IDs, and large-list scenarios without real credentials or URLs.

Use reserved example domains only (`example.com`, `example.invalid`) and synthetic credentials such as `demo-user`/`demo-pass` that are visibly non-secret.

### Task 9: Add Focus State Reducer

**Files:**
- Create: `player/src/focus/focus-reducer.ts`
- Test: `player/test-ts/focus-reducer.test.ts`

**Produces:** a pure reducer that restores focus by stable item ID, never by raw index. Tests cover current playing channel present, restore target present, fallback to first item, removed item, and no wrap-around at list boundaries.

Do not wire the new reducer into the current UI in M1D; M3 owns user-visible Live TV navigation migration.

### Task 10: M1 Milestone Verification

Run on the exact M1D head:

```bash
npm ci
npm test
npm run typecheck
npm run build
git diff --exit-code
```

Then review all M1 merged diffs against the approved spec. Confirm:

- typed domain and boundary contracts exist;
- Tizen API ownership is behind platform/playback adapters where migrated;
- playback behavior remains characterized and stable;
- provider/repository/focus foundations are testable without TV/provider access;
- sanitization tests prevent credential-bearing URL leakage;
- no real provider data or signing material exists in git;
- M2 can implement Xtream/M3U without UI knowing endpoint/parser details.

M1 is complete only after exact-head CI GREEN for every slice and explicit merge approval for each PR.
