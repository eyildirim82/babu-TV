# BabuşTV M3 Live TV Core Design

Date: 2026-09-08
Status: Design approved in chat; implementation plan not yet written
Milestone: M3 Live TV Core
Base: `main@a76ee639df5b0dfaf0359ced934cd556d9563bda`

## 1. Purpose

M3 turns the architectural foundations from M1 and provider core from M2 into a deterministic Live TV experience without performing a large UI rewrite.

The milestone owns fullscreen Live TV behavior, overlay navigation, channel play intent, direct zapping, numeric zap where supported, playback coordination, bounded recovery, Shaka/AVPlay fallback, Back behavior, and minimum-disruption single-session channel switching.

The central product invariant is:

> Highlight is not playback.

Moving focus, changing categories, refreshing provider data, or reopening the overlay must never start a stream implicitly. Playback starts only from an explicit play intent such as `SELECT`, `CHANNEL_UP`, `CHANNEL_DOWN`, or a valid numeric zap.

M3 deliberately uses incremental strangler migration. Existing DOM/CSS and inherited rendering remain in place where practical while behavior ownership moves into focused TypeScript state/controller/coordinator modules.

## 2. Scope

### In scope

- fullscreen Live TV base state
- semi-transparent Live TV overlay
- `CATEGORY`, `CHANNEL`, and M3-only `ACTIONS` focus zones
- explicit channel play intent
- single source of truth for Live TV state
- stable-ID focus restore
- active-scope CH+/CH- zapping
- numeric channel input when supported by platform capability and provider numbering
- last-intent-wins handling for rapid user input
- single-session minimum-interruption channel switching
- Shaka-first playback with AVPlay fallback when meaningful
- classified bounded recovery
- rollback to the prior working channel when technically possible
- layer-by-layer Back behavior
- deterministic browser/unit tests plus stronger Tizen-sensitive verification
- incremental migration away from Live TV orchestration in legacy JavaScript

### Out of scope

- EPG detail/current-next UI
- favorites behavior and Favorite actions
- search
- program-info panels beyond M3 playback/status needs
- Home redesign
- provider onboarding migration
- pairing
- dual-session production switching
- AVPlayStore-specific optimization
- complete TypeScript rewrite of the inherited UI
- changes to provider parsing/sync except where a narrow playback contract adjustment is required

Favorites is an M4 feature. The M3 state model may remain future-compatible with a Favorites scope, but M3 runtime behavior only needs All Channels and provider category scopes.

## 3. Existing boundaries to preserve

M3 builds on the existing BabuşTV boundaries rather than bypassing them.

- provider stream resolution stays behind `ProviderAdapter.resolveStream(channelId)`
- normalized playback inputs use `StreamRequest`
- playback engine calls stay behind playback adapters
- Tizen APIs stay behind platform adapters
- UI code does not call `webapis.avplay` directly
- UI code does not know Xtream or M3U endpoint details
- focus is application state, not incidental DOM focus
- secrets and credential-bearing URLs are never logged

Current foundations already provide:

- `player/src/providers/contracts.ts`
- `player/src/playback/contracts.ts`
- `player/src/playback/playback-service.ts`
- `player/src/playback/shaka-adapter.ts`
- `player/src/playback/avplay-adapter.ts`
- `player/src/focus/focus-reducer.ts`
- `player/src/platform/contracts.ts`
- `player/src/platform/tizen-platform.ts`

M3 may evolve these contracts where necessary, but should preserve their separation of concerns.

## 4. Recommended architecture

The approved architecture is:

```text
Remote / DOM events
        |
        v
LiveTvController
        |
        v
LiveTvState
        |
        v
ChannelIntentCoordinator
        |
        +--> ProviderAdapter.resolveStream()
        |
        v
PlayerSessionCoordinator
        |
        +--> ShakaAdapter
        |
        +--> AVPlayAdapter
```

Rendering remains downstream of state:

```text
LiveTvState -> legacy-compatible DOM renderer
```

The renderer may update classes, text, visibility, and focus presentation, but it does not decide which channel is playing and does not initiate playback.

## 5. Live TV state ownership

`LiveTvState` is the single source of truth for M3 behavior.

Conceptually it owns at least:

```ts
interface LiveTvState {
  playingChannelId: ChannelId | null;
  highlightedChannelId: ChannelId | null;
  activeScope: LiveTvScope;
  overlayOpen: boolean;
  overlayZone: 'CATEGORY' | 'CHANNEL' | 'ACTIONS';
  playbackStatus:
    | 'IDLE'
    | 'RESOLVING'
    | 'PREPARING'
    | 'PLAYING'
    | 'RECOVERING'
    | 'FAILED';
  pendingIntent: PlaybackIntentState | null;
  playbackError: PlaybackErrorCode | null;
}
```

The exact final type names are implementation-plan details. The behavioral separation is mandatory.

### Playing vs highlighted channel

`highlightedChannelId` means the item selected in the UI.

`playingChannelId` means the channel whose stream is actually active.

They frequently differ and must remain independent.

Examples:

- moving UP/DOWN changes highlight only
- changing category changes filtered list/highlight only
- opening overlay may focus the playing channel but does not restart it
- a failed play attempt leaves highlight on the failed choice while playback may have rolled back to the previous channel

### Active scope

M3 supports:

- All Channels
- provider category

CH+/CH- targets are calculated from the currently active scope. M4 can add the virtual Favorites scope using the same concept without changing the zapping model.

There is no wrap-around at list boundaries in V1.

## 6. First entry and overlay behavior

### First Live TV entry

If there is no currently playing channel:

1. enter Live TV in idle fullscreen state
2. open the overlay
3. select the first valid channel in the active scope
4. do not start playback
5. wait for explicit `SELECT`

This preserves the highlight-is-not-playback invariant from the first interaction.

### Opening the overlay

When the overlay opens, channel focus is restored in this order:

1. currently playing channel, if visible in the active scope
2. last valid highlighted/restore channel for that scope
3. first valid channel

Stable channel IDs are used. Raw array index is never the persistence/restore identity.

### Overlay lifetime

The overlay has no fixed inactivity timeout in M3.

It closes when:

- the user presses Back at the overlay layer, or
- an explicit channel handoff completes successfully

It stays open after a failed channel attempt so the user can immediately choose another channel.

## 7. Focus and navigation

The visible overlay zones are:

- `CATEGORY`
- `CHANNEL`
- `ACTIONS`

The M3 `ACTIONS` zone contains only real M3 playback actions. It must not include placeholders for Favorite, EPG, Search, or program-info features that belong to M4.

### Channel movement

UP/DOWN in the channel list changes `highlightedChannelId` only.

### Category movement

Changing category:

1. changes `activeScope`
2. derives the visible channel IDs for that scope
3. restores/selects a valid highlight by stable ID rules
4. does not start playback

### List boundaries

There is no wrap-around requirement in V1. Movement at the first/last item remains clamped.

### Refresh behavior

When cached/provider channel data refreshes:

- preserve focus by stable channel ID where possible
- if highlighted channel disappears, choose a valid fallback in the current scope
- if the playing channel disappears from the refreshed catalog but its stream remains active, do not immediately terminate playback

## 8. Remote input model

Live TV behavior consumes normalized input, not raw Tizen keycodes.

Core logical actions remain:

- UP
- DOWN
- LEFT
- RIGHT
- SELECT
- BACK
- OPTIONS
- CHANNEL_UP
- CHANNEL_DOWN

Numeric input is progressive enhancement. The platform already exposes a `numericKeys` capability. M3 may extend the normalized input contract with digit events, but raw numeric keycodes must stay in platform/remote adaptation code.

Numeric zap is enabled only when both are true:

1. platform numeric-key capability is available
2. the active provider catalog exposes usable channel numbers

## 9. Direct zapping

### CH+/CH-

Physical Channel Up/Down produces immediate channel-play intent.

The target channel is the previous/next channel inside the active scope.

Examples:

- category selected -> zap within that category
- All Channels selected -> zap within all channels
- M4 Favorites scope in the future -> zap within Favorites

At scope boundaries there is no wrap-around.

### Numeric zap

When numeric input is supported:

1. digits append to a short-lived input buffer
2. a small numeric overlay presents the entered number
3. after approximately 500 ms without another digit, resolve the number against the active provider catalog
4. if exactly one usable target is found, produce normal channel-play intent
5. if no usable target is found, clear the numeric input without changing playback

Numeric zap uses the same intent pipeline as SELECT and CH+/CH-. It does not create a separate playback path.

## 10. Channel intent model

All channel-opening operations converge on `ChannelIntentCoordinator`.

Sources include:

- SELECT on highlighted channel
- CHANNEL_UP
- CHANNEL_DOWN
- valid numeric zap

Each new intent receives a monotonically increasing intent ID/token.

The coordinator enforces:

> Last intent wins.

If a newer intent is created, older unresolved/preparing/recovering work becomes stale.

Where cancellation primitives are available, stale work should be aborted. Where they are not, stale promises may finish but their results must be ignored.

A stale result can never replace the newest user-selected channel.

There is no sequential zap queue.

## 11. Minimum-disruption single-session switching

M3 production behavior defaults to single-session switching.

Dual-session preparation is not assumed safe across the supported Tizen range and is not required for M3 completion.

Approved switching sequence:

1. Channel A is playing.
2. User explicitly requests Channel B.
3. Keep Channel A playing while `ProviderAdapter.resolveStream(B)` runs.
4. If stream resolution fails, keep A and show the failure in the overlay.
5. If resolution succeeds and the intent is still current, enter the real player handoff.
6. Show a short `Yayın açılıyor...` status during the disruptive handoff period.
7. Stop/reconfigure the single active engine as required.
8. Prepare/play B.
9. If B succeeds, set `playingChannelId = B`, clear transient error state, and close the overlay.
10. If B fails after A has been disrupted, attempt bounded rollback to A when technically possible.

No fake screenshot/freeze-frame is used to simulate continuous playback.

The mandatory dual-session capability spike remains separate. If a future spike proves parallel preparation reliable for defined device/engine combinations, it may be added later as a capability-gated optimization without changing the M3 intent/state semantics.

## 12. PlayerSessionCoordinator

`PlayerSessionCoordinator` becomes the owner of engine selection, handoff, retry, fallback, rollback, and stale-operation protection below the channel-intent layer.

The UI never selects Shaka/AVPlay directly.

### Engine priority

Default engine policy:

1. Shaka primary
2. AVPlay fallback only when meaningful

A channel that succeeds via AVPlay does not globally pin later channels to AVPlay.

A new channel begins from the normal Shaka-first policy unless stream metadata or a narrowly defined capability explicitly requires native playback.

### Relationship to current PlaybackService

The existing `PlaybackServiceFacade` is a migration boundary, not something to delete in one step.

M3 should evolve it incrementally so legacy callers continue to work while the new coordinator becomes the owner of the new Live TV channel-intent path.

The implementation plan should avoid a big-bang replacement of `player.js`, `main.js`, or the whole playback layer.

## 13. Playback states

The normalized M3 state vocabulary is:

- `IDLE`
- `RESOLVING`
- `PREPARING`
- `PLAYING`
- `BUFFERING`
- `RECOVERING`
- `FAILED`

`RECOVERING` may be added to the current playback contracts during M3.

User-visible text remains simple. Examples:

- `Yayın açılıyor...`
- `Yayın açılamadı`

Detailed engine/provider failure data belongs in sanitized developer diagnostics, not normal UI.

## 14. Error classification and bounded recovery

Recovery is classified. There is no generic infinite retry/fallback chain.

### AUTH

Behavior:

1. re-resolve provider stream/session
2. retry playback once

Maximum automatic retry: 1.

### NETWORK / TIMEOUT

Behavior:

- short bounded backoff
- maximum 2 retries
- stale-intent checks before every retry/handoff

### ENGINE_FAILURE / UNSUPPORTED_CODEC

Behavior:

- if alternate engine is meaningful for that request/device, attempt one Shaka<->AVPlay fallback
- no repeated engine ping-pong

### STREAM_NOT_FOUND

Behavior:

- fail fast
- no automatic retry

### UNKNOWN

Behavior:

- no unbounded automatic recovery
- show sanitized generic failure
- allow user to select another channel

## 15. Rollback behavior

If Channel A was working and the disruptive handoff to B fails, the coordinator should restore A when technically possible.

Rollback must not rely on permanently retaining credential-bearing URLs longer than necessary.

Preferred sequence:

1. identify prior working channel by provider-scoped channel ID
2. obtain a fresh stream request through the provider boundary when needed
3. reopen it through normal engine policy
4. update playback state only if the original failed intent is still current

If rollback succeeds:

- `playingChannelId` returns/remains A
- overlay stays open
- `highlightedChannelId` remains B
- show `Yayın açılamadı`

If rollback also fails:

- enter `FAILED`
- overlay stays open
- user can immediately choose another channel

If the user issues a newer intent during recovery/rollback, the old recovery chain becomes stale and cannot overwrite the newer intent.

## 16. Failed channel UX

A failed explicit selection does not kick the user out of the channel chooser.

Expected behavior:

- keep/recover previous playback when possible
- keep overlay open
- keep highlight on the failed requested channel
- show a short failure state
- accept another selection immediately

This makes failure recovery user-driven rather than modal or blocking.

## 17. Back behavior

Back closes one UI layer at a time.

Order:

1. channel option/detail layer, if any M3 layer is open
2. Live TV overlay
3. fullscreen Live TV/app layer

At fullscreen with no child UI layer, M3 does not add a custom `Çıkmak istiyor musunuz?` confirmation dialog.

Application exit follows the platform/Tizen behavior already exposed through the platform boundary.

## 18. Incremental strangler migration

M3 must not rewrite the inherited Live TV application in one PR.

Preferred migration strategy:

1. characterize current relevant remote/playback/UI behavior
2. add deterministic TypeScript state primitives
3. add channel-intent coordinator with fakes
4. add player-session coordination under the playback boundary
5. adapt normalized remote input, including optional digit events
6. connect the new controller to the existing DOM
7. move bounded pieces of orchestration out of legacy `main.js`/player paths
8. delete legacy branches only when equivalent behavior is covered and no longer referenced

Existing CSS and DOM structure may be reused where it does not violate state ownership.

The DOM must gradually become a renderer of application state rather than a source of truth.

## 19. Security and privacy constraints

M3 must preserve the existing security rules.

Never log:

- Xtream usernames/passwords
- M3U provider URLs containing credentials/tokens
- resolved credential-bearing stream URLs
- request headers containing secrets
- DRM clear keys

Playback errors exposed to the UI are sanitized codes/messages.

Stale-operation diagnostics may log intent IDs, provider IDs, channel IDs, engine names, and safe error codes, but not secret stream material.

Rollback/retry must obtain stream data through the same provider/credential boundary rather than creating a new plaintext persistence path.

## 20. Testing strategy

M3 is behavior-heavy and Tizen-sensitive. Unit/browser coverage is necessary but not sufficient for the final milestone gate.

### State tests

Cover deterministic transitions for:

- first entry with no playing channel
- overlay open restore order
- highlight vs playing independence
- category/scope change without playback
- successful play transition
- failed play transition
- overlay close on successful handoff
- overlay remains open on failure
- refresh stable-ID restoration
- no-wrap list boundaries

### ChannelIntentCoordinator tests

Cover:

- SELECT produces explicit play intent
- CH+/CH- resolves target inside active scope
- numeric zap uses same pipeline
- rapid successive intents are last-intent-wins
- stale resolve result is ignored
- stale prepare result is ignored
- stale recovery result is ignored
- no queued replay of obsolete zaps

A critical assertion is not merely that the final channel is correct; tests must prove a stale operation cannot become active after a newer user intent exists.

### PlayerSessionCoordinator tests

Use injected fake provider/playback adapters to cover:

- Shaka success
- Shaka engine failure -> AVPlay success
- unsupported codec -> alternate engine where meaningful
- AUTH re-resolve + one retry
- NETWORK retry bounds
- TIMEOUT retry bounds
- STREAM_NOT_FOUND no retry
- failed B -> successful rollback to A
- failed B -> failed rollback -> FAILED
- new intent cancels/invalidates an in-progress recovery chain
- AVPlay success on one channel does not globally pin the next channel to AVPlay

### Remote/focus tests

Cover:

- logical action mapping stays outside Live TV domain logic
- playing -> restore -> first focus priority
- category movement changes highlight only
- Back closes one layer
- numeric capability disabled -> digit input ignored/unavailable
- invalid numeric channel -> no playback change

### Regression tests

Preserve and extend existing characterization coverage for:

- inherited playback safety
- AVPlay boundary behavior
- remote normalization
- packaging/build behavior
- legacy UI paths not intentionally migrated in the current slice

## 21. Tizen-sensitive verification

Every M3 implementation PR requires normal exact-head CI.

Before M3 is called fully complete, perform stronger Tizen-sensitive verification where practical using Emulator and/or Samsung Remote Test Lab.

Minimum M3 runtime smoke should include:

- enter Live TV with no auto-play
- open/close overlay
- category navigation
- explicit SELECT play
- rapid CH+/CH- zapping
- last-intent-wins under repeated input
- Back layer behavior
- Shaka playback path
- AVPlay fallback where testable
- failed channel with overlay staying open
- rollback to previous channel where testable
- numeric zap on a device/runtime exposing numeric support

The dual-session spike is not an M3 completion requirement because M3 intentionally selects safe single-session production behavior. The spike remains a future capability investigation.

Physical-TV acceptance remains a release gate rather than a daily development prerequisite.

## 22. Milestone acceptance criteria

M3 is functionally ready when all of the following are true:

1. Live TV can enter without implicit playback.
2. Overlay focus restore is deterministic and stable-ID-based.
3. Highlight changes never start playback implicitly.
4. SELECT starts the highlighted channel.
5. CH+/CH- zaps only inside the active scope and does not wrap.
6. Numeric zap works only when platform/provider capability permits it.
7. Rapid channel intents are last-intent-wins.
8. Stale async results cannot override a newer intent.
9. Stream resolution keeps the old channel playing until disruptive handoff begins.
10. Shaka is primary; AVPlay fallback is bounded and non-sticky.
11. Recovery is classified and bounded.
12. Failed channel attempts leave the overlay usable.
13. Prior playback is restored when technically possible after a failed handoff.
14. Back closes one UI layer at a time with no custom fullscreen exit modal.
15. M4 features are not shipped as placeholders in M3.
16. Legacy orchestration is reduced incrementally rather than rewritten wholesale.
17. Exact-head CI is green for each merge candidate.
18. Applicable Tizen-sensitive runtime smoke is recorded before claiming M3 fully complete.

## 23. Known open gates and dependencies

### M2 WidgetData runtime gate

M2 Provider Core code is merged, but the Samsung WidgetData runtime verification gate remains pending. That does not change the M3 architecture, but BabuşTV must not describe M2 as fully complete until that runtime probe is recorded.

M3 must not add an insecure credential fallback to work around the open M2 gate.

### Dual-session capability spike

The V1 architecture still requires a focused dual-session/minimum-disruption spike as a capability investigation. M3 does not block on a positive dual-session result because the approved production strategy is single-session minimum-interruption.

A future optimization must remain capability-gated and preserve all M3 state/intent semantics.

## 24. Implementation planning guidance

The implementation plan should split M3 into small PR-sized slices rather than one milestone branch.

Likely boundaries are:

- state/focus model
- channel-intent coordination
- player-session coordination/recovery
- remote/numeric input extension
- Live TV controller + legacy DOM integration
- final Tizen-sensitive verification/hardening

Exact task ordering, files, tests, and RED/GREEN checkpoints belong in the separate M3 implementation plan and are not approved merely by this design document.

## 25. Design summary

M3 makes Live TV deterministic by separating four responsibilities:

- UI highlight/focus state
- channel intent arbitration
- provider stream resolution
- playback session execution/recovery

The implementation keeps the inherited UI shell where useful, but removes behavioral authority from the DOM and legacy event orchestration step by step.

The product favors predictable single-session behavior over speculative dual-session speed. It keeps the previous channel alive through stream resolution, uses last-intent-wins for rapid zapping, uses Shaka first with bounded AVPlay fallback, and leaves the user in a usable channel overlay after failures.

This design intentionally stops before EPG, Favorites, Search, Home, and pairing so M3 remains a focused Live TV/playback milestone.