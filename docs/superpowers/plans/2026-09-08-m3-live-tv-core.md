# BabuşTV M3 Live TV Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, remote-first Live TV core that separates highlight from playback, arbitrates rapid channel intents with last-intent-wins semantics, performs safe single-session Shaka-first playback with bounded AVPlay fallback/recovery, and integrates incrementally with the inherited Tizen UI.

**Architecture:** M3 adds a framework-free TypeScript Live TV state/controller layer above provider stream resolution and a new player-session coordinator. The production path remains incremental: normalized Provider Core data uses the new M3 path when an active secure provider exists, while the inherited playlist UI remains available as a transitional fallback until the later onboarding migration; legacy provider credentials are never auto-imported into Provider Core. Engine ownership moves behind playback adapters/coordinator without a big-bang rewrite of `player.js`, `main.js`, or the DOM shell.

**Tech Stack:** TypeScript 5.9, Vite 6, Node test runner through `tsx`, existing Shaka Player 5.2, Samsung AVPlay adapter, IndexedDB-backed Provider Core, Samsung WidgetData credential boundary, framework-free DOM/CSS.

**Spec:** `docs/superpowers/specs/2026-09-08-m3-live-tv-core-design.md`

## Global Constraints

- Target remains Samsung Tizen 5.0+; generated JavaScript/CSS must stay compatible with that floor.
- Do not add React or another UI framework.
- `Highlight is not playback`: focus movement, category changes, refresh, and overlay open never start a stream.
- Explicit play intents are `SELECT`, `CHANNEL_UP`, `CHANNEL_DOWN`, and a valid capability-gated numeric zap.
- M3 production switching is single-session minimum-interruption. Keep the old channel playing through target stream resolution; disruption begins only after resolution succeeds and the intent is still current.
- Last intent wins. A stale resolve, prepare, retry, fallback, or rollback result must never replace a newer user intent.
- Shaka is primary. AVPlay is bounded fallback for meaningful engine/codec/native cases and is not sticky across channels.
- Recovery bounds are exact: AUTH re-resolve + one retry; NETWORK/TIMEOUT maximum two retries; engine/codec maximum one alternate-engine fallback; STREAM_NOT_FOUND no retry.
- Overlay has no inactivity auto-hide in the M3 path. Successful handoff closes it; Back closes it; failure leaves it usable.
- CH+/CH- stay inside the active scope and do not wrap at boundaries.
- Numeric zap waits approximately 500 ms after the last digit, resolves only an unambiguous exact `Channel.number`, and changes nothing when no unique target exists.
- M3 `ACTIONS` contains only real M3 playback actions. No Favorite, EPG, Search, or program-info placeholders.
- Back closes one UI layer at a time. Do not add a custom fullscreen exit confirmation.
- Tizen API calls remain behind established adapter boundaries; AVPlay calls remain behind playback adapters.
- Never log provider credentials, credential-bearing URLs, resolved stream URLs, secret headers, DRM clear keys, or decrypted provider material.
- Do not create a plaintext credential fallback. The M2 Samsung WidgetData runtime gate remains pending until real Tizen evidence exists.
- Do not auto-migrate inherited `localStorage` playlist settings into Provider Core. New M3 Provider Core playback is used only when a valid active Provider Core record/credential exists.
- Preserve the inherited legacy path for users who have not yet migrated to the new provider/onboarding flow; remove it only in a later approved milestone.
- Every implementation slice starts from a fresh GREEN `main`, uses a new branch, follows RED -> minimum implementation -> GREEN -> review -> exact-head CI, and requires explicit user approval before merge.
- After each merge, require post-merge `main` verify GREEN before creating the next implementation branch.
- Before every slice, fresh-check `main`, open PRs, exact-head CI, and `Nur-allhi/en-tvplayer` upstream. Never blindly merge upstream.

---

## Baseline and file map

Planning baseline on 2026-09-08:

- `main`: `a76ee639df5b0dfaf0359ced934cd556d9563bda`
- upstream `Nur-allhi/en-tvplayer/main`: `58bc12f755b731cad540d50a8e16cf8bb8708738` (`release: v2.0.0`)
- design branch head before this plan: `3306275c2a69addeb3dc30697db03021e1f1c827`
- design exact-head verify: run `34210143461`, SUCCESS

Important existing behavior that M3 deliberately changes only on the new M3 path:

- `player/src/main.js:360-460` initializes `ui` and playback callbacks.
- `player/src/main.js:470-525` currently auto-selects channel 0 at startup; this indirectly auto-plays through the legacy UI callback.
- `player/src/main.js:555-590` `handleChannelSelect()` directly calls the legacy playback façade.
- `player/src/main.js:650-910` remote handling currently wraps CH+/CH-, uses a custom exit confirmation, and sends buffered numeric values directly to legacy UI.
- `player/src/ui.js:1-260` owns legacy channel/group DOM state and `selectChannel()` couples selection to playback callback.
- `player/src/ui.js:260-420` legacy UP/DOWN wrap, numeric jump directly selects/plays, and the sidebar uses inactivity auto-close.
- `player/src/remote.js` currently buffers digits internally for 500 ms and emits `number`.
- `player/src/player.js` still contains inherited automatic Shaka retry/native-fallback logic. M3 must expose an externally coordinated Shaka-attempt seam while preserving legacy behavior for the fallback path.

Target files and responsibilities:

| File | Responsibility |
| --- | --- |
| `player/src/live-tv/contracts.ts` | M3 Live TV state, intent, view, resolver, and session port contracts |
| `player/src/live-tv/live-tv-state.ts` | Pure state transitions, scope filtering, stable-ID restore, no-wrap movement |
| `player/src/live-tv/provider-stream-resolver.ts` | Secure Provider Core record/credential -> `ProviderAdapter.resolveStream()` |
| `player/src/live-tv/channel-intent-coordinator.ts` | Monotonic intent IDs, last-intent-wins, stale result suppression |
| `player/src/live-tv/numeric-zap-buffer.ts` | 500 ms digit accumulation with injectable timers |
| `player/src/live-tv/live-tv-controller.ts` | Logical input -> state transitions / channel intents / Back behavior |
| `player/src/live-tv/dom-live-tv-view.ts` | Render `LiveTvState` into the existing DOM shell without owning playback |
| `player/src/live-tv/create-live-tv-runtime.ts` | Compose Provider Core + resolver + controller for an active secure provider |
| `player/src/playback/contracts.ts` | Playback state/error/result plus explicit engine/session interfaces |
| `player/src/playback/shaka-error-classifier.ts` | Pure mapping from inherited Shaka failures to normalized M3 errors |
| `player/src/playback/shaka-adapter.ts` | Existing legacy façade plus explicit Shaka-only M3 engine attempt |
| `player/src/playback/avplay-adapter.ts` | Existing AVPlay compatibility API plus normalized M3 engine `open()` |
| `player/src/playback/player-session-coordinator.ts` | Single-session handoff, bounded retries/fallback, rollback |
| `player/src/player.js` | Preserve legacy behavior; add a narrow externally-managed Shaka attempt seam |
| `player/src/remote.js` | Preserve legacy buffered numeric mode; add raw digit emission mode for M3 |
| `player/src/main.js` | Composition and guarded M3-vs-legacy startup; no new domain logic |
| `player/index.html` | Reuse existing shell and add only M3 status/numeric presentation nodes if missing |
| `player/src/styles.css` | Minimal M3 overlay/status/focus styling using existing visual shell |

Implementation slices below are intentionally PR-sized. Do not combine them into one milestone branch.

---

### Task 1: M3A — Deterministic Live TV state and stable-ID focus

**Branch:** `feature/m3a-live-tv-state`

**Files:**
- Create: `player/src/live-tv/contracts.ts`
- Create: `player/src/live-tv/live-tv-state.ts`
- Create: `player/test-ts/live-tv-state.test.ts`
- Modify only if needed for type reuse: `player/src/domain/actions.ts`
- Reuse without changing behavior unless a test exposes a gap: `player/src/focus/focus-reducer.ts`

**Interfaces:**
- Consumes: `Channel`, `ChannelId`, `CategoryId`, `ProviderId`, `PlaybackErrorCode`.
- Produces:

```ts
export type LiveTvScope =
  | { kind: 'all' }
  | { kind: 'category'; categoryId: CategoryId };

export type LiveTvOverlayZone = 'CATEGORY' | 'CHANNEL' | 'ACTIONS';

export interface PlaybackIntentState {
  id: number;
  channelId: ChannelId;
  previousChannelId: ChannelId | null;
}

export interface LiveTvState {
  providerId: ProviderId;
  playingChannelId: ChannelId | null;
  highlightedChannelId: ChannelId | null;
  activeScope: LiveTvScope;
  restoreChannelIdByScope: Readonly<Record<string, ChannelId | null>>;
  overlayOpen: boolean;
  overlayZone: LiveTvOverlayZone;
  playbackStatus: 'IDLE' | 'RESOLVING' | 'PREPARING' | 'PLAYING' | 'BUFFERING' | 'RECOVERING' | 'FAILED';
  pendingIntent: PlaybackIntentState | null;
  playbackError: PlaybackErrorCode | null;
  numericInput: string;
}

export function scopeKey(scope: LiveTvScope): string;
export function channelsForScope(channels: readonly Channel[], scope: LiveTvScope): readonly Channel[];
export function createInitialLiveTvState(providerId: ProviderId): LiveTvState;
export function reduceLiveTv(state: LiveTvState, action: LiveTvAction): LiveTvState;
```

- Later tasks rely on these exact names. If implementation discovers a type-level blocker, update this plan/spec before changing public names.

- [ ] **Step 1: Add RED tests for first entry, highlight/playback separation, restore priority, scope changes, refresh, and no-wrap movement**

Add cases like:

```ts
void test('first entry opens overlay and highlights first channel without playing it', () => {
  const initial = createInitialLiveTvState('provider-1');
  const next = reduceLiveTv(initial, {
    type: 'ENTER',
    channels: [channel('a'), channel('b')],
  });

  assert.equal(next.overlayOpen, true);
  assert.equal(next.highlightedChannelId, 'a');
  assert.equal(next.playingChannelId, null);
  assert.equal(next.playbackStatus, 'IDLE');
});

void test('opening overlay restores playing then saved then first by stable id', () => {
  const base = state({
    playingChannelId: 'b',
    highlightedChannelId: 'x',
    restoreChannelIdByScope: { all: 'c' },
    overlayOpen: false,
  });

  assert.equal(reduceLiveTv(base, {
    type: 'OPEN_OVERLAY',
    channels: [channel('a'), channel('b'), channel('c')],
  }).highlightedChannelId, 'b');
});

void test('moving at a list boundary does not wrap', () => {
  const base = state({ highlightedChannelId: 'c' });
  const next = reduceLiveTv(base, {
    type: 'MOVE_HIGHLIGHT',
    direction: 'NEXT',
    channels: [channel('a'), channel('b'), channel('c')],
  });
  assert.equal(next.highlightedChannelId, 'c');
});
```

Also assert that `SET_SCOPE`, `MOVE_HIGHLIGHT`, and `SYNC_CHANNELS` never mutate `playingChannelId`.

- [ ] **Step 2: Run RED**

Run:

```bash
npm run test:ts -w player
```

Expected: the new suite fails because `live-tv/contracts.ts` / `live-tv-state.ts` do not exist.

- [ ] **Step 3: Implement the state contracts and pure reducer**

Use stable IDs and one deterministic helper for restore:

```ts
export function scopeKey(scope: LiveTvScope): string {
  return scope.kind === 'all' ? 'all' : `category:${scope.categoryId}`;
}

export function channelsForScope(
  channels: readonly Channel[],
  scope: LiveTvScope,
): readonly Channel[] {
  return scope.kind === 'all'
    ? channels
    : channels.filter((channel) => channel.categoryId === scope.categoryId);
}

function firstExisting(
  candidates: readonly (ChannelId | null)[],
  visibleIds: readonly ChannelId[],
): ChannelId | null {
  for (const candidate of candidates) {
    if (candidate !== null && visibleIds.includes(candidate)) return candidate;
  }
  return visibleIds[0] ?? null;
}
```

Reducer rules must encode:

```ts
case 'OPEN_OVERLAY': {
  const visible = channelsForScope(action.channels, state.activeScope);
  const ids = visible.map((channel) => channel.id);
  const restore = state.restoreChannelIdByScope[scopeKey(state.activeScope)] ?? null;
  return {
    ...state,
    overlayOpen: true,
    highlightedChannelId: firstExisting(
      [state.playingChannelId, restore, state.highlightedChannelId],
      ids,
    ),
  };
}
```

For `MOVE_HIGHLIGHT`, clamp the target index with `Math.max(0, Math.min(last, index + delta))`; never modulo-wrap.

- [ ] **Step 4: Run GREEN and full regression**

Run:

```bash
npm run test:ts -w player
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0; existing focus tests remain green.

- [ ] **Step 5: Review state invariants**

Check the diff directly against the spec. Confirm no reducer action other than successful playback/rollback state transitions changes `playingChannelId`, and no test uses array index as persistent identity.

- [ ] **Step 6: Commit and open the M3A PR**

```bash
git add player/src/live-tv player/test-ts/live-tv-state.test.ts player/src/domain/actions.ts
git commit -m "feat(m3): add deterministic Live TV state"
```

Open a bounded PR to `main`, require exact-head CI, and stop for explicit merge approval. After approved squash-merge, require post-merge `main` verify GREEN before Task 2.

---

### Task 2: M3B — Secure provider stream resolver and last-intent-wins arbitration

**Branch:** `feature/m3b-channel-intent`

**Files:**
- Modify: `player/src/live-tv/contracts.ts`
- Create: `player/src/live-tv/provider-stream-resolver.ts`
- Create: `player/src/live-tv/channel-intent-coordinator.ts`
- Create: `player/test-ts/provider-stream-resolver.test.ts`
- Create: `player/test-ts/channel-intent-coordinator.test.ts`

**Interfaces:**
- Consumes: `ProviderRepository`, `CredentialStore`, `ProviderAdapterFactory`, `ProviderError`, `StreamRequest`, Task 1 state/ID types.
- Produces:

```ts
export interface ChannelStreamResolver {
  resolve(providerId: ProviderId, channelId: ChannelId): Promise<StreamRequest>;
}

export interface SessionSwitchRequest {
  intentId: number;
  targetChannelId: ChannelId;
  previousChannelId: ChannelId | null;
  initialRequest: StreamRequest;
  reResolveTarget(): Promise<StreamRequest>;
  resolvePrevious: (() => Promise<StreamRequest>) | null;
  isCurrent(): boolean;
  onRecovering(): void;
}

export type SessionSwitchResult =
  | { status: 'playing'; engine: 'shaka' | 'avplay' }
  | { status: 'failed'; error: PlaybackErrorCode; rollback: 'not-needed' | 'restored' | 'failed' };

export interface PlayerSessionPort {
  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult>;
  stop(): Promise<void> | void;
}

export type ChannelIntentEvent =
  | { type: 'RESOLVING'; intent: PlaybackIntentState }
  | { type: 'PREPARING'; intent: PlaybackIntentState }
  | { type: 'RECOVERING'; intent: PlaybackIntentState }
  | { type: 'PLAYING'; intent: PlaybackIntentState; engine: 'shaka' | 'avplay' }
  | { type: 'FAILED'; intent: PlaybackIntentState; error: PlaybackErrorCode; rollback: 'not-needed' | 'restored' | 'failed' };

export class ChannelIntentCoordinator {
  requestChannel(input: {
    providerId: ProviderId;
    channelId: ChannelId;
    previousChannelId: ChannelId | null;
  }): Promise<'playing' | 'failed' | 'stale'>;
  isCurrent(intentId: number): boolean;
}
```

- [ ] **Step 1: Write RED resolver tests proving credentials remain behind `CredentialStore`**

Use memory fakes; never include real provider data:

```ts
void test('resolver loads provider and credential then delegates by channel id', async () => {
  const resolver = new ProviderStreamResolver(providers, credentials, factory);
  const request = await resolver.resolve('provider-1', 'channel-9');

  assert.equal(factoryCalls[0]?.provider.id, 'provider-1');
  assert.equal(factoryCalls[0]?.credential.kind, 'xtream');
  assert.deepEqual(resolveCalls, ['channel-9']);
  assert.equal(request.url, 'https://stream.example.test/live/9');
});
```

Also test missing provider -> sanitized `ProviderError('NOT_FOUND')` and missing credential -> sanitized `ProviderError('UNAVAILABLE')`; assert errors do not contain username/password/playlist URL fixtures.

- [ ] **Step 2: Run RED for resolver**

```bash
npm run test:ts -w player
```

Expected: fail only because `ProviderStreamResolver` is absent.

- [ ] **Step 3: Implement `ProviderStreamResolver` minimally**

```ts
export class ProviderStreamResolver implements ChannelStreamResolver {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly credentials: CredentialStore,
    private readonly adapters: ProviderAdapterFactory,
  ) {}

  async resolve(providerId: ProviderId, channelId: ChannelId): Promise<StreamRequest> {
    const provider = await this.providers.getProvider(providerId);
    if (provider === null) {
      throw new ProviderError('NOT_FOUND', null, 'Provider configuration was not found.');
    }
    const credential = await this.credentials.load(providerId);
    if (credential === null) {
      throw new ProviderError('UNAVAILABLE', null, 'Provider credential is unavailable.');
    }
    return this.adapters.create(provider, credential).resolveStream(channelId);
  }
}
```

Do not cache or serialize the returned `StreamRequest`.

- [ ] **Step 4: Write RED last-intent-wins tests before implementing the coordinator**

Use deferred promises:

```ts
void test('a stale resolve can never reach the session after a newer intent exists', async () => {
  const first = deferred<StreamRequest>();
  const second = deferred<StreamRequest>();
  resolver.enqueue(first.promise, second.promise);

  const p1 = coordinator.requestChannel({ providerId: 'p', channelId: 'a', previousChannelId: null });
  const p2 = coordinator.requestChannel({ providerId: 'p', channelId: 'b', previousChannelId: null });

  second.resolve(stream('b'));
  await p2;
  first.resolve(stream('a'));
  assert.equal(await p1, 'stale');
  assert.deepEqual(sessionTargets, ['b']);
});
```

Add tests for stale session completion and stale recovery completion, not just stale resolution.

- [ ] **Step 5: Implement `ChannelIntentCoordinator` with monotonic tokens**

Core pattern:

```ts
private nextIntentId = 0;
private currentIntentId = 0;

isCurrent(intentId: number): boolean {
  return intentId === this.currentIntentId;
}

async requestChannel(input: RequestInput): Promise<'playing' | 'failed' | 'stale'> {
  const intent: PlaybackIntentState = {
    id: ++this.nextIntentId,
    channelId: input.channelId,
    previousChannelId: input.previousChannelId,
  };
  this.currentIntentId = intent.id;
  this.emit({ type: 'RESOLVING', intent });

  let initialRequest: StreamRequest;
  try {
    initialRequest = await this.resolver.resolve(input.providerId, input.channelId);
  } catch (error) {
    if (!this.isCurrent(intent.id)) return 'stale';
    this.emit({ type: 'FAILED', intent, error: mapProviderFailure(error), rollback: 'not-needed' });
    return 'failed';
  }
  if (!this.isCurrent(intent.id)) return 'stale';

  this.emit({ type: 'PREPARING', intent });
  const result = await this.session.switchTo({
    intentId: intent.id,
    targetChannelId: intent.channelId,
    previousChannelId: intent.previousChannelId,
    initialRequest,
    reResolveTarget: () => this.resolver.resolve(input.providerId, intent.channelId),
    resolvePrevious: intent.previousChannelId === null
      ? null
      : () => this.resolver.resolve(input.providerId, intent.previousChannelId!),
    isCurrent: () => this.isCurrent(intent.id),
    onRecovering: () => {
      if (this.isCurrent(intent.id)) this.emit({ type: 'RECOVERING', intent });
    },
  });

  if (!this.isCurrent(intent.id)) return 'stale';
  // Emit PLAYING or FAILED from `result` and return the matching terminal string.
}
```

Map provider failures without serializing the thrown object:

```ts
function mapProviderFailure(error: unknown): PlaybackErrorCode {
  if (!(error instanceof ProviderError)) return 'UNKNOWN';
  if (error.code === 'AUTH') return 'AUTH';
  if (error.code === 'NETWORK') return 'NETWORK';
  if (error.code === 'TIMEOUT') return 'TIMEOUT';
  if (error.code === 'NOT_FOUND') return 'STREAM_NOT_FOUND';
  return 'UNKNOWN';
}
```

- [ ] **Step 6: Run GREEN and full regression**

```bash
npm run test:ts -w player
npm test
npm run typecheck
npm run build
```

- [ ] **Step 7: Security/diff review and commit**

Verify no fixture secret appears in thrown messages/logs and no `StreamRequest` is persisted.

```bash
git add player/src/live-tv player/test-ts/provider-stream-resolver.test.ts player/test-ts/channel-intent-coordinator.test.ts
git commit -m "feat(m3): add channel intent arbitration"
```

Open the M3B PR, require exact-head CI and explicit merge approval, then post-merge `main` GREEN.

---

### Task 3: M3C — Explicit Shaka/AVPlay engine boundary without breaking legacy playback

**Branch:** `feature/m3c-playback-engine-boundary`

**Files:**
- Modify: `player/src/playback/contracts.ts`
- Create: `player/src/playback/shaka-error-classifier.ts`
- Modify: `player/src/playback/shaka-adapter.ts`
- Modify: `player/src/playback/avplay-adapter.ts`
- Modify: `player/src/player.js`
- Modify: `player/test-ts/playback-service.test.ts`
- Create: `player/test-ts/shaka-error-classifier.test.ts`
- Extend: `player/test/avplay-fallback.test.js`
- Extend if needed: `player/test/playback-boundary-wiring.test.js`

**Interfaces:**
- Consumes: existing `StreamRequest`, `PlaybackResult`, inherited `player.js` and `avplay.js` ports.
- Produces:

```ts
export type PlaybackEngineName = 'shaka' | 'avplay';

export interface PlaybackEnginePort {
  readonly name: PlaybackEngineName;
  isAvailable(): boolean;
  open(request: StreamRequest): Promise<PlaybackResult>;
  stop(): Promise<void> | void;
}

export interface LegacyShakaAttemptResult {
  ok: boolean;
  error: PlaybackErrorCode | null;
}
```

`PlaybackState` gains `RECOVERING`.

`ShakaAdapter` keeps existing legacy façade methods for old callers, but adds M3 engine methods. `AvplayAdapter` keeps `play(url, options)` for compatibility and adds `open(request)`.

- [ ] **Step 1: Characterize existing legacy playback before changing `player.js`**

Run the current legacy suites first and record the exact green baseline in the PR body:

```bash
node --test player/test/avplay-fallback.test.js player/test/avplay.test.js player/test/playback-boundary-wiring.test.js
npm run test:ts -w player
```

Expected before changes: GREEN. Do not edit production code if this baseline is not green.

- [ ] **Step 2: Add RED normalized error-classification tests**

Create pure tests for the inherited Shaka error shapes:

```ts
assert.equal(classifyShakaFailure({ code: 1001, data: [null, 401] }), 'AUTH');
assert.equal(classifyShakaFailure({ code: 1001, data: [null, 403] }), 'AUTH');
assert.equal(classifyShakaFailure({ code: 1001, data: [null, 404] }), 'STREAM_NOT_FOUND');
assert.equal(classifyShakaFailure({ code: 1001, data: [null, 408] }), 'TIMEOUT');
assert.equal(classifyShakaFailure({ code: 1002 }), 'NETWORK');
assert.equal(classifyShakaFailure({ code: 1003 }), 'TIMEOUT');
assert.equal(classifyShakaFailure({ code: 4032 }), 'UNSUPPORTED_CODEC');
assert.equal(classifyShakaFailure({ code: 3018 }), 'ENGINE_FAILURE');
assert.equal(classifyShakaFailure({ code: 3014 }), 'ENGINE_FAILURE');
assert.equal(classifyShakaFailure(new TypeError('native player crash')), 'ENGINE_FAILURE');
```

- [ ] **Step 3: Implement the pure classifier**

```ts
export function classifyShakaFailure(error: unknown): PlaybackErrorCode {
  const value = error as { code?: unknown; data?: unknown[]; name?: unknown } | null;
  if (error instanceof TypeError) return 'ENGINE_FAILURE';
  if (!value || typeof value.code !== 'number') return 'UNKNOWN';

  if (value.code === 1001) {
    const status = Array.isArray(value.data) ? value.data[1] : null;
    if (status === 401 || status === 403) return 'AUTH';
    if (status === 404) return 'STREAM_NOT_FOUND';
    if (status === 408) return 'TIMEOUT';
    return 'NETWORK';
  }
  if (value.code === 1002) return 'NETWORK';
  if (value.code === 1003) return 'TIMEOUT';
  if (value.code === 4032) return 'UNSUPPORTED_CODEC';
  if ([3014, 3015, 3016, 3018].includes(value.code)) return 'ENGINE_FAILURE';
  return 'UNKNOWN';
}
```

- [ ] **Step 4: Add RED adapter tests for an explicit Shaka-only attempt and normalized AVPlay open**

Extend the fake legacy player port with `playShakaAttempt` and assert that M3 `open()` uses it while old `PlaybackServiceFacade.play()` still uses the legacy compatibility path.

```ts
const shakaResult = await shaka.open(streamRequest);
assert.deepEqual(shakaResult, { ok: false, engine: null, error: 'UNSUPPORTED_CODEC' });
assert.equal(loadChannelCalls, 0);
assert.equal(shakaAttemptCalls, 1);
```

For AVPlay:

```ts
assert.deepEqual(
  await adapter.open({ url: 'https://example.test/live', userAgent: 'UA', referer: 'https://ref.test' }),
  { ok: true, engine: 'avplay', error: null },
);
```

- [ ] **Step 5: Add a narrow externally-managed Shaka attempt seam in `player.js` while keeping `loadChannel()` legacy behavior intact**

Do not delete the inherited path. Introduce an internal policy and two public wrappers:

```js
const LEGACY_PLAYBACK_POLICY = Object.freeze({
  allowNativeFallback: true,
  allowAutomaticRecovery: true,
  allowAutoAdvance: true,
});

const M3_SHAKA_ATTEMPT_POLICY = Object.freeze({
  allowNativeFallback: false,
  allowAutomaticRecovery: false,
  allowAutoAdvance: false,
});

export async function loadChannel(channel) {
  const result = await loadChannelWithPolicy(channel, LEGACY_PLAYBACK_POLICY);
  return result.ok;
}

export async function playShakaAttempt(channel) {
  return loadChannelWithPolicy(channel, M3_SHAKA_ATTEMPT_POLICY);
}
```

Refactor the existing function body into `loadChannelWithPolicy(channel, policy)` with these non-negotiable guards:

```js
if (policy.allowNativeFallback && avplayPreferredUrls.has(channel.url) && avplay.isAvailable()) {
  return { ok: await loadViaAvplay(channel, myToken), error: null };
}
```

Every inherited `scheduleReconnect()`, automatic `loadChannel(currentChannel)` recovery, native fallback, and auto-advance branch must be conditioned on the matching policy flag. In M3 policy, return `{ ok: false, error: classify... }` instead of scheduling hidden recovery.

Keep internal one-time format sniffing as a Shaka preparation compatibility mechanism only if it remains token-guarded and cannot invoke AVPlay or an unbounded reconnect loop.

- [ ] **Step 6: Make adapters implement the explicit engine port**

`ShakaAdapter.open()` converts `StreamRequest` to the legacy channel shape and calls `playShakaAttempt`; its `name` is `shaka` and `isAvailable()` returns true after the inherited player has initialized.

`AvplayAdapter.open()` calls the existing native `play()` and maps false to `ENGINE_FAILURE`:

```ts
async open(request: StreamRequest): Promise<PlaybackResult> {
  if (!this.isAvailable()) return { ok: false, engine: null, error: 'ENGINE_FAILURE' };
  const ok = await this.play(request.url, {
    userAgent: request.userAgent ?? null,
    referer: request.referer ?? null,
  });
  return ok
    ? { ok: true, engine: 'avplay', error: null }
    : { ok: false, engine: null, error: 'ENGINE_FAILURE' };
}
```

Do not pass arbitrary secret headers to AVPlay because the inherited native API currently supports only User-Agent/Referer.

- [ ] **Step 7: Verify legacy and M3 paths together**

```bash
node --test player/test/avplay-fallback.test.js player/test/avplay.test.js player/test/playback-boundary-wiring.test.js
npm run test:ts -w player
npm test
npm run typecheck
npm run build
```

The old legacy `loadChannel()` tests must remain green. New tests must prove `ShakaAdapter.open()` cannot internally select AVPlay.

- [ ] **Step 8: Review AVPlay boundary and commit**

Search the M3 diff: no new `webapis.avplay` call may appear outside `player/src/avplay.js` / playback adapters, and no new engine-selection branch may appear in UI/controller code.

```bash
git add player/src/playback player/src/player.js player/test-ts player/test
git commit -m "refactor(m3): expose explicit playback engine boundary"
```

Open M3C PR, exact-head CI, explicit approval, post-merge `main` GREEN.

---

### Task 4: M3D — Single-session `PlayerSessionCoordinator`, bounded recovery, and rollback

**Branch:** `feature/m3d-session-recovery`

**Files:**
- Create: `player/src/playback/player-session-coordinator.ts`
- Create: `player/test-ts/player-session-coordinator.test.ts`
- Modify: `player/src/live-tv/contracts.ts` only if imports need to move to `playback/contracts.ts`

**Interfaces:**
- Consumes: Task 2 `SessionSwitchRequest`/`SessionSwitchResult`, Task 3 `PlaybackEnginePort`.
- Produces:

```ts
export interface SessionTimers {
  sleep(delayMs: number): Promise<void>;
}

export class PlayerSessionCoordinator implements PlayerSessionPort {
  constructor(
    shaka: PlaybackEnginePort,
    avplay: PlaybackEnginePort,
    timers?: SessionTimers,
  );
  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult>;
  stop(): Promise<void>;
}
```

- [ ] **Step 1: Write RED tests for Shaka-first and non-sticky AVPlay fallback**

```ts
void test('starts each new channel with Shaka even after prior AVPlay success', async () => {
  shaka.enqueue(fail('UNSUPPORTED_CODEC'), ok('shaka'));
  avplay.enqueue(ok('avplay'));

  assert.equal((await coordinator.switchTo(req('a'))).status, 'playing');
  assert.equal((await coordinator.switchTo(req('b'))).status, 'playing');
  assert.deepEqual(engineOpenOrder, ['shaka:a', 'avplay:a', 'shaka:b']);
});
```

- [ ] **Step 2: Add RED exact retry-bound tests**

Test call counts, not only terminal result:

```ts
assert.equal(targetResolveCountForAuth, 1);       // one re-resolve after initial resolved request
assert.equal(shakaNetworkOpenCount, 3);           // initial + maximum two retries
assert.equal(shakaTimeoutOpenCount, 3);           // initial + maximum two retries
assert.equal(notFoundOpenCount, 1);               // no retry
assert.equal(avplayFallbackCount, 1);              // no engine ping-pong
```

Use injected `SessionTimers` that records delays and resolves immediately; never sleep in unit tests.

- [ ] **Step 3: Add RED rollback and stale-recovery tests**

```ts
void test('failed target restores previous channel but keeps target failure terminal result', async () => {
  shaka.enqueue(fail('STREAM_NOT_FOUND'), ok('shaka'));
  const result = await coordinator.switchTo(req('b', { previousChannelId: 'a' }));
  assert.deepEqual(result, {
    status: 'failed',
    error: 'STREAM_NOT_FOUND',
    rollback: 'restored',
  });
});

void test('new intent invalidates old rollback before it can reopen the previous channel', async () => {
  current = false;
  const result = await coordinator.switchTo(req('b', { isCurrent: () => current }));
  assert.equal(previousResolveCalls, 0);
  assert.equal(result.status, 'failed');
});
```

- [ ] **Step 4: Implement one reusable target-attempt function with explicit budgets**

Keep retry logic centralized:

```ts
private async playTarget(input: {
  request: StreamRequest;
  reResolve(): Promise<StreamRequest>;
  isCurrent(): boolean;
}): Promise<{ ok: true; engine: PlaybackEngineName } | { ok: false; error: PlaybackErrorCode }> {
  let request = input.request;
  let authRetries = 0;
  let transientRetries = 0;

  while (input.isCurrent()) {
    const result = await this.openShakaThenMeaningfulFallback(request);
    if (result.ok) return { ok: true, engine: result.engine! };

    if (result.error === 'AUTH' && authRetries < 1) {
      authRetries += 1;
      request = await input.reResolve();
      continue;
    }
    if ((result.error === 'NETWORK' || result.error === 'TIMEOUT') && transientRetries < 2) {
      transientRetries += 1;
      await this.timers.sleep(250 * transientRetries);
      continue;
    }
    return { ok: false, error: result.error ?? 'UNKNOWN' };
  }

  return { ok: false, error: 'UNKNOWN' };
}
```

`openShakaThenMeaningfulFallback()` may call AVPlay exactly once only for `ENGINE_FAILURE` or `UNSUPPORTED_CODEC`, and only when AVPlay is available.

- [ ] **Step 5: Implement disruptive handoff and rollback ordering**

The coordinator is called only after target stream resolution has completed, so this is the first point allowed to disrupt current playback:

```ts
await this.stopActiveEngine();
if (!request.isCurrent()) return staleFailure();

const target = await this.playTarget({
  request: request.initialRequest,
  reResolve: request.reResolveTarget,
  isCurrent: request.isCurrent,
});
if (target.ok) return { status: 'playing', engine: target.engine };

if (request.previousChannelId === null || request.resolvePrevious === null || !request.isCurrent()) {
  return { status: 'failed', error: target.error, rollback: 'not-needed' };
}

request.onRecovering();
const previousRequest = await request.resolvePrevious();
if (!request.isCurrent()) {
  return { status: 'failed', error: target.error, rollback: 'not-needed' };
}
const rollback = await this.openShakaThenMeaningfulFallback(previousRequest);
return {
  status: 'failed',
  error: target.error,
  rollback: rollback.ok ? 'restored' : 'failed',
};
```

Rollback must not recursively trigger another rollback and must not persist either stream request.

- [ ] **Step 6: Run GREEN/full verification**

```bash
npm run test:ts -w player
npm test
npm run typecheck
npm run build
```

- [ ] **Step 7: Structured review and commit**

Check retry counts, stale checks before every retry/fallback/rollback state mutation, and absence of secret data in errors.

```bash
git add player/src/playback/player-session-coordinator.ts player/test-ts/player-session-coordinator.test.ts player/src/live-tv/contracts.ts
git commit -m "feat(m3): coordinate bounded playback recovery"
```

Open M3D PR, exact-head CI, explicit approval, post-merge `main` GREEN.

---

### Task 5: M3E — Remote normalization and capability-gated numeric zap

**Branch:** `feature/m3e-remote-numeric`

**Files:**
- Modify: `player/src/domain/actions.ts`
- Modify: `player/src/remote.js`
- Modify: `player/src/platform/create-platform.ts`
- Create: `player/src/live-tv/numeric-zap-buffer.ts`
- Create: `player/test-ts/numeric-zap-buffer.test.ts`
- Modify: `player/test/remote.test.js`
- Modify: `player/test-ts/platform.test.ts`

**Interfaces:**
- Consumes: existing `LogicalAction`, platform `numericKeys` capability.
- Produces:

```ts
export type LogicalInput =
  | { type: 'ACTION'; action: LogicalAction }
  | { type: 'DIGIT'; digit: number };

export interface NumericZapTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export class NumericZapBuffer {
  constructor(input: {
    timers: NumericZapTimers;
    delayMs?: number;
    onChange(value: string): void;
    onCommit(value: number): void;
  });
  push(digit: number): void;
  clear(): void;
}
```

Legacy `remote.init(callback)` keeps its current buffered `number` behavior by default. M3 uses `remote.init(callback, { numericMode: 'digits' })`, which emits `digit` immediately and performs no internal 500 ms buffering.

- [ ] **Step 1: Add RED fake-timer tests for `NumericZapBuffer`**

```ts
buffer.push(1);
buffer.push(2);
assert.deepEqual(changes, ['1', '12']);
assert.deepEqual(commits, []);

timers.fireLatest();
assert.deepEqual(commits, [12]);
assert.equal(changes.at(-1), '');
```

Assert every new digit cancels/replaces the previous timer.

- [ ] **Step 2: Implement `NumericZapBuffer` with an exact default of 500 ms**

```ts
const DEFAULT_NUMERIC_ZAP_DELAY_MS = 500;

push(digit: number): void {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;
  this.value += String(digit);
  this.onChange(this.value);
  if (this.handle !== null) this.timers.clearTimeout(this.handle);
  this.handle = this.timers.setTimeout(() => {
    const value = Number.parseInt(this.value, 10);
    this.value = '';
    this.handle = null;
    this.onChange('');
    if (Number.isFinite(value)) this.onCommit(value);
  }, this.delayMs);
}
```

- [ ] **Step 3: Add RED remote tests for digit mode while preserving legacy mode**

Keep the existing test that expects `['number', 124]` after 500 ms with default init. Add:

```js
test('digit mode emits each digit immediately without legacy buffering', () => {
  const actions = [];
  init((...args) => actions.push(args), { numericMode: 'digits' });
  fake.press({ key: '1', keyCode: 49 });
  fake.press({ key: '2', keyCode: 50 });
  assert.deepEqual(actions, [['digit', 1], ['digit', 2]]);
});
```

- [ ] **Step 4: Implement dual remote numeric modes without moving raw keycodes into domain code**

```js
let numericMode = 'buffered';

export function init(callback, options = {}) {
  onKeyAction = callback;
  numericMode = options.numericMode === 'digits' ? 'digits' : 'buffered';
  document.addEventListener('keydown', handleKeyDown, true);
}

function handleNumberInput(num) {
  if (numericMode === 'digits') {
    if (onKeyAction) onKeyAction('digit', Number(num));
    return;
  }
  // Preserve the existing buffered legacy implementation here.
}
```

Reset numeric mode/buffer/timer in `destroy()` so tests and lifecycle restarts cannot leak a pending number.

- [ ] **Step 5: Extend optional Tizen key registration conservatively**

Add a separate exported numeric key list rather than changing legacy semantics silently:

```ts
export const M3_NUMERIC_TIZEN_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
```

M3 composition registers these only when `platform.capabilities().numericKeys` is true. `TizenPlatform.registerOptionalKeys()` already catches unsupported registration failures.

- [ ] **Step 6: Run GREEN/full verification**

```bash
node --test player/test/remote.test.js
npm run test:ts -w player
npm test
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit and PR checkpoint**

```bash
git add player/src/domain/actions.ts player/src/remote.js player/src/platform/create-platform.ts player/src/live-tv/numeric-zap-buffer.ts player/test/remote.test.js player/test-ts/numeric-zap-buffer.test.ts player/test-ts/platform.test.ts
git commit -m "feat(m3): add normalized numeric remote input"
```

Open M3E PR, exact-head CI, explicit approval, post-merge `main` GREEN.

---

### Task 6: M3F — Live TV controller, Provider Core runtime composition, and legacy DOM integration

**Branch:** `feature/m3f-live-tv-integration`

**Files:**
- Create: `player/src/live-tv/live-tv-controller.ts`
- Create: `player/src/live-tv/dom-live-tv-view.ts`
- Create: `player/src/live-tv/create-live-tv-runtime.ts`
- Create: `player/test-ts/live-tv-controller.test.ts`
- Create: `player/test-ts/live-tv-runtime.test.ts`
- Create: `player/test-ts/dom-live-tv-view.test.ts` using lightweight fake DOM objects; do not add jsdom.
- Modify: `player/src/main.js`
- Modify: `player/index.html` only for M3 status/numeric nodes that do not already exist.
- Modify: `player/src/styles.css`
- Leave legacy `player/src/ui.js` behavior intact for the fallback path except for tiny shared presentation helpers that are proven safe by characterization tests.

**Interfaces:**
- Consumes: Tasks 1-5, `ProviderCoreService`, `ProviderRepository`, structured catalog/repositories, `SamsungWidgetDataCredentialStore`, `ProviderAdapterFactoryImpl`, `FetchProviderHttpClient`, `Platform`.
- Produces:

```ts
export interface LiveTvViewModel {
  categories: readonly Category[];
  channels: readonly Channel[];
  visibleChannels: readonly Channel[];
}

export interface LiveTvView {
  render(state: LiveTvState, model: LiveTvViewModel): void;
}

export class LiveTvController {
  enter(snapshot: ProviderSnapshot): void;
  syncCatalog(snapshot: ProviderSnapshot): void;
  handleInput(input: LogicalInput): Promise<void> | void;
  state(): LiveTvState;
}

export type LiveTvRuntimeStart =
  | { mode: 'm3'; controller: LiveTvController; refresh: Promise<void> }
  | { mode: 'legacy' };

export async function createLiveTvRuntime(deps: LiveTvRuntimeDependencies): Promise<LiveTvRuntimeStart>;
```

- [ ] **Step 1: Write RED controller tests for all approved UX rules**

Use fake view, fake intent coordinator, fake platform and normalized `Channel` fixtures. Cover at minimum:

```ts
void test('category movement changes highlight/scope but never requests playback', async () => {
  controller.enter(snapshot);
  await controller.handleInput({ type: 'ACTION', action: 'LEFT' });
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  assert.equal(intentRequests.length, 0);
});

void test('select plays highlighted channel and success closes overlay', async () => {
  controller.enter(snapshot);
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  intent.emitPlaying('channel-a', 'shaka');
  assert.equal(controller.state().playingChannelId, 'channel-a');
  assert.equal(controller.state().overlayOpen, false);
});

void test('failed selected channel stays highlighted and overlay stays open after rollback', async () => {
  // Start with A playing, highlight B, fail B with rollback restored.
  assert.equal(controller.state().playingChannelId, 'a');
  assert.equal(controller.state().highlightedChannelId, 'b');
  assert.equal(controller.state().overlayOpen, true);
  assert.equal(controller.state().playbackError, 'ENGINE_FAILURE');
});
```

Also test CH+/CH- uses the active scope and clamps at boundaries.

- [ ] **Step 2: Add RED numeric capability/uniqueness tests**

```ts
void test('numeric commit requires platform capability and exactly one matching channel number', () => {
  controllerWithoutNumeric.handleInput({ type: 'DIGIT', digit: 1 });
  timers.fireLatest();
  assert.equal(intentRequests.length, 0);

  controllerWithNumeric.handleInput({ type: 'DIGIT', digit: 4 });
  controllerWithNumeric.handleInput({ type: 'DIGIT', digit: 2 });
  timers.fireLatest();
  assert.deepEqual(intentRequests.at(-1)?.channelId, 'channel-42');
});
```

If two channels expose the same `number`, clear the numeric overlay and produce no play intent.

- [ ] **Step 3: Implement `LiveTvController` as the only owner of M3 interaction state**

Key target selection for direct zap is deterministic:

```ts
private zapTarget(direction: 'PREVIOUS' | 'NEXT'): ChannelId | null {
  const visible = channelsForScope(this.snapshot.channels, this.current.activeScope);
  if (visible.length === 0) return null;
  const anchorId = this.current.playingChannelId ?? this.current.highlightedChannelId;
  const anchorIndex = anchorId === null ? -1 : visible.findIndex((channel) => channel.id === anchorId);
  const start = anchorIndex < 0 ? 0 : anchorIndex;
  const delta = direction === 'NEXT' ? 1 : -1;
  const target = Math.max(0, Math.min(visible.length - 1, start + delta));
  if (target === start && anchorIndex >= 0) return null;
  return visible[target]?.id ?? null;
}
```

Every intent event is translated to a reducer action; the view receives state after each transition. `FAILED` with `rollback: 'restored'` keeps `playingChannelId` on the previous channel while leaving highlight on the failed target.

- [ ] **Step 4: Implement Back layering with no custom confirmation**

Controller behavior:

```ts
if (action === 'BACK') {
  if (this.optionLayerOpen) {
    this.optionLayerOpen = false;
    this.render();
    return;
  }
  if (this.current.overlayOpen) {
    this.dispatch({ type: 'CLOSE_OVERLAY' });
    return;
  }
  this.platform.exitApp();
}
```

Do not call `ui.showConfirmDialog('Exit the app?')` from the M3 path.

- [ ] **Step 5: Write RED runtime-composition tests that forbid insecure legacy credential migration**

Test these exact branches:

1. no active Provider Core ID -> `{ mode: 'legacy' }` and no CredentialStore save.
2. active provider with cached snapshot -> `{ mode: 'm3' }` immediately from cache and background refresh started.
3. secure credential unavailable -> safe failure/fallback decision without copying legacy localStorage secrets into Provider Core.

```ts
assert.equal(await providers.getActiveProviderId(), null);
assert.equal(credentialSaveCalls.length, 0);
assert.deepEqual(await createLiveTvRuntime(deps), { mode: 'legacy' });
```

- [ ] **Step 6: Implement Provider Core runtime composition**

The composition function receives concrete dependencies for testability; the browser/Tizen bootstrap constructs them. Production wiring follows the already-merged M2 components:

```ts
const structuredStore = new IndexedDbStructuredStore(globalThis.indexedDB ?? null);
const providers = new StructuredProviderRepository(structuredStore);
const catalog = new StructuredCatalogRepository(structuredStore);
const credentials = new SamsungWidgetDataCredentialStore(widgetDataOrNull);
const http = new FetchProviderHttpClient(fetch.bind(globalThis));
const adapters = new ProviderAdapterFactoryImpl(http);
const sync = new ProviderSyncService(providers, catalog, credentials, adapters);
const core = new ProviderCoreService(providers, catalog, credentials, sync);
const resolver = new ProviderStreamResolver(providers, credentials, adapters);
```

Then:

```ts
const providerId = await providers.getActiveProviderId();
if (providerId === null) return { mode: 'legacy' };
const load = await core.loadCacheFirst(providerId);
controller.enter(load.cached);
return {
  mode: 'm3',
  controller,
  refresh: load.refresh.then(async () => {
    const refreshed = await core.loadCacheFirst(providerId);
    controller.syncCatalog(refreshed.cached);
    // Do not await or recursively chain the second refresh promise.
  }),
};
```

Avoid the recursive second refresh shown by `loadCacheFirst()` by adding/using a cache-only read helper if necessary. Preferred fix is a narrow `ProviderCoreService.loadCached(providerId)` method with tests, rather than calling `loadCacheFirst()` twice.

- [ ] **Step 7: Add RED DOM-view tests proving render is downstream of state**

With a lightweight fake document, assert:

- renderer highlights `state.highlightedChannelId` but never invokes channel playback;
- playing and highlighted classes may be on different channel items;
- status text is `Yayın açılıyor...` for RESOLVING/PREPARING and `Yayın açılamadı` for FAILED;
- numeric overlay reflects `state.numericInput`;
- overlay visibility follows `state.overlayOpen` and has no inactivity timer.

- [ ] **Step 8: Implement `DomLiveTvView` using the inherited shell, not a framework rewrite**

Create/update channel nodes with stable IDs:

```ts
item.dataset.channelId = channel.id;
item.classList.toggle('focused', channel.id === state.highlightedChannelId);
item.classList.toggle('playing', channel.id === state.playingChannelId);
```

Display provider channel number when present, otherwise a presentation-only list position. Never use presentation number/index as state identity.

Use existing sidebar containers where practical. Add only small status nodes to `player/index.html` if no suitable existing node exists:

```html
<div id="live-tv-status" class="live-tv-status hidden" aria-live="polite"></div>
<div id="numeric-zap" class="numeric-zap hidden"></div>
```

- [ ] **Step 9: Guard the new path in `main.js` and preserve legacy fallback**

Startup shape:

```js
const runtime = await tryStartM3LiveTv();
if (runtime.mode === 'm3') {
  remote.init(handleM3RemoteAction, { numericMode: 'digits' });
  if (platform.capabilities().numericKeys) {
    platform.registerOptionalKeys(M3_NUMERIC_TIZEN_KEYS);
  }
  return;
}

// Existing legacy startPlayer/ui.init/remote handling remains below.
startLegacyPlayer();
```

The M3 branch must not call `ui.selectChannel(0, true)`. First entry is overlay-open, first-highlighted, no playback.

Translate existing legacy remote names to normalized input at this composition edge only:

```js
const actionMap = {
  up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
  select: 'SELECT', back: 'BACK',
  channelUp: 'CHANNEL_UP', channelDown: 'CHANNEL_DOWN',
};
```

`digit` becomes `{ type: 'DIGIT', digit: value }`. Do not send color/media/reload legacy-only actions into M3 unless a later approved M3 action explicitly needs them.

- [ ] **Step 10: Verify the M3 path does not inherit legacy wrap/auto-hide/exit modal behavior**

Add characterization/static wiring assertions where practical:

- M3 controller no modulo navigation.
- M3 path does not invoke `ui.startInactivityTimer()`.
- M3 Back does not invoke `ui.showConfirmDialog('Exit the app?')`.
- M3 first entry does not invoke channel intent.

- [ ] **Step 11: Run complete automated verification**

```bash
npm ci
npm test
npm run typecheck
npm run build
git diff --exit-code
```

If `git diff --exit-code` is run after generated build output changes tracked files, investigate the build pipeline rather than deleting evidence blindly.

- [ ] **Step 12: Security and architecture review**

Check the cumulative M3 diff for:

- no credential-bearing `console.*` output;
- no `StreamRequest` persistence;
- no new `localStorage` provider credential path;
- no direct Provider API details in controller/view;
- no direct AVPlay call in controller/view/main;
- no M4 Favorite/EPG/Search placeholders;
- legacy path remains isolated and clearly transitional.

- [ ] **Step 13: Commit and PR checkpoint**

```bash
git add player/src/live-tv player/src/main.js player/index.html player/src/styles.css player/test-ts
git commit -m "feat(m3): integrate deterministic Live TV core"
```

Open M3F PR, require exact-head CI and explicit merge approval. After merge, require post-merge `main` verify GREEN before runtime hardening.

---

### Task 7: M3G — Tizen-sensitive runtime verification and milestone hardening

**Branch:** `feature/m3g-tizen-hardening` only if code/test fixes are required; otherwise use `docs/m3-live-tv-verification` for evidence-only updates.

**Files:**
- Create: `docs/verification/m3-live-tv-runtime.md`
- Modify tests/code only in response to a reproduced runtime failure using root cause -> RED -> minimum fix -> GREEN.
- Do not modify the M2 credential ADR to claim WidgetData runtime success unless that separate probe is actually performed.

**Interfaces:**
- Consumes: merged M3A-F behavior.
- Produces: recorded runtime matrix/evidence and, only where required, bounded regression fixes.

- [ ] **Step 1: Fresh final milestone gate**

Fresh-check:

```text
main head
open PRs
latest main verify
upstream main
M2 WidgetData runtime-gate status
```

If upstream moved, inspect relevant playback/Tizen/security changes before continuing. Do not merge upstream wholesale.

- [ ] **Step 2: Run the complete clean automated suite on the exact candidate**

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Record exact test counts and build warnings in `docs/verification/m3-live-tv-runtime.md`. Warnings inherited from baseline may be recorded as non-blocking only after confirming M3 did not introduce them.

- [ ] **Step 3: Package WGT only in a secret-safe signing environment**

```bash
npm run tizen
```

Run this only where signing material remains uncommitted. Record package success/failure and the exact commit SHA; never commit certificates/private keys.

- [ ] **Step 4: Perform the minimum Tizen runtime smoke on Emulator and/or Samsung Remote Test Lab**

Record PASS/FAIL/NOT-AVAILABLE for each item with runtime/model/version:

```text
1. Enter Live TV: overlay opens, no implicit playback.
2. SELECT: highlighted channel starts.
3. Category movement: highlight/filter changes, playback unchanged.
4. Overlay reopen: playing -> saved restore -> first priority.
5. CH+/CH-: active-scope zap, no boundary wrap.
6. Rapid repeated zap: last intent wins; stale channel never takes over afterward.
7. Successful handoff: short "Yayın açılıyor..." state, overlay closes on success.
8. Failed target: previous channel preserved/restored when possible; overlay stays open; failed target stays highlighted.
9. Back: option layer -> overlay -> platform exit, no custom exit modal.
10. Shaka primary path.
11. AVPlay fallback for a safe synthetic/testable unsupported-engine case where runtime permits.
12. Numeric zap only when numeric capability exists; 500 ms entry and invalid-number no-op.
13. Background provider refresh does not terminate a still-working playing channel removed from refreshed catalog.
```

Use synthetic/test provider data only. Do not record provider URLs or credentials in evidence.

- [ ] **Step 5: Treat any runtime failure as a new RED bug cycle**

For each failure:

```text
reproduce -> identify root cause -> add the narrowest automated regression test possible -> verify RED -> minimum fix -> verify GREEN -> rerun affected runtime smoke
```

Do not apply speculative Tizen fixes without reproduction/evidence.

- [ ] **Step 6: Record explicit open gates**

The verification document must state:

```markdown
## Open gates

- M2 WidgetData runtime probe: pending unless separately completed with real Tizen evidence.
- Dual-session capability spike: not required for M3 production completion; remains a future capability investigation.
- Physical-TV release acceptance: deferred to release/RC gate unless performed now.
```

Do not call M2 fully complete while its WidgetData probe is pending.

- [ ] **Step 7: Final cumulative review against all 18 M3 acceptance criteria**

Create a checklist in the PR body mapping each criterion from the spec to automated or runtime evidence. A criterion with no evidence remains open; do not infer success from unrelated tests.

- [ ] **Step 8: Final exact-head CI and user merge gate**

Require exact candidate head verify SUCCESS. If the branch contains only runtime evidence/docs, it still needs exact-head CI. Stop for explicit merge approval.

After merge, require post-merge `main` verify SUCCESS before saying the M3 code slice is merged. Call the M3 milestone fully complete only if the applicable Tizen-sensitive runtime smoke in the spec has actually been recorded as satisfied.

---

## Plan self-review checklist

Before executing Task 1, re-read the approved spec and confirm this plan still covers every requirement:

- first entry no auto-play;
- stable-ID focus restore;
- highlight independent from playback;
- category scope and no-wrap navigation;
- active-scope CH+/CH-;
- capability-gated exact numeric zap;
- last-intent-wins across resolve/prepare/recovery;
- keep prior playback through stream resolution;
- single-session disruptive handoff only after resolution;
- Shaka-first, one meaningful AVPlay fallback, non-sticky engine policy;
- AUTH/NETWORK/TIMEOUT/STREAM_NOT_FOUND bounds;
- rollback with fresh provider stream resolution;
- failed-target overlay remains usable and target remains highlighted;
- layer-by-layer Back with no custom fullscreen confirmation;
- M4 feature exclusion;
- incremental legacy migration, no big-bang rewrite;
- security/log hygiene and no plaintext credential fallback;
- exact-head CI and Tizen-sensitive runtime evidence.

If implementation uncovers a requirement that conflicts with this plan, stop and update/approve the design/plan instead of silently changing product behavior.
