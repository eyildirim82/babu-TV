import { expect, test } from '@playwright/test';
import {
  assertNoUnexplainedConsoleErrors,
  findSecretLeaks,
  installBrowserHarness,
  openFreshApp,
  pressRemote,
  snapshotOrdinaryBrowserStorage,
} from '../lib/harness.mjs';
import { createEvidenceRecord, writeEvidence } from '../lib/evidence.mjs';
import { RC_PRODUCTION_SHA, RC_SECRET_CANARIES } from '../fixtures/common.mjs';
import {
  PLAYNAV_CHANNEL_IDS,
  PLAYNAV_PROVIDER_A,
  PLAYNAV_PROVIDER_B,
  dispatchSpecialRemoteKey,
  installPlayNavNetwork,
  playNavCredentialDocument,
  readPlayNavWatchState,
  seedPlayNavState,
} from '../fixtures/pack-b-play-nav.mjs';

const featureRoot = (page) => page.locator('[data-feature-root="m4"]');
const channel = (page, channelId) => page.locator(`.channel-item[data-channel-id="${channelId}"]`);
const status = (page) => page.locator('#live-tv-status');
const sidebar = (page) => page.locator('#sidebar.babu-live-tv-overlay');

async function writeScenario(harness, input) {
  const evidence = createEvidenceRecord({
    scenarioId: input.scenarioId,
    productionSha: RC_PRODUCTION_SHA,
    startingState: input.startingState,
    actions: input.actions,
    expectedState: input.expectedState,
    observedState: input.observedState,
    console: harness.events.console,
    pageErrors: harness.events.pageErrors,
    requestFailures: harness.events.requestFailures,
    reloadPersistence: input.reloadPersistence ?? 'not exercised',
    leakage: input.leakage ?? (harness.events.leakageEvents.length === 0 ? 'clean' : 'detected'),
    artifacts: [],
    status: input.status ?? 'PASS',
  });
  return writeEvidence(evidence);
}

async function setup(page, context, options = {}) {
  const harness = await installBrowserHarness(context, {
    widgetData: { initialValue: playNavCredentialDocument() },
  });
  const network = await installPlayNavNetwork(context);

  if (options.reducedMotion === true) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }

  if (options.providerACatalog !== undefined) {
    network.setCatalog(PLAYNAV_PROVIDER_A, options.providerACatalog);
  }
  if (options.providerBCatalog !== undefined) {
    network.setCatalog(PLAYNAV_PROVIDER_B, options.providerBCatalog);
  }

  await openFreshApp(page);
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });

  await seedPlayNavState(page, {
    activeProviderId: options.activeProviderId ?? PLAYNAV_PROVIDER_A,
    providerAChannels: options.providerAChannels ?? PLAYNAV_CHANNEL_IDS,
    providerBChannels: options.providerBChannels ?? PLAYNAV_CHANNEL_IDS,
    seedEpg: options.seedEpg !== false,
    seedWatchState: options.seedWatchState === true,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 10_000 });
  return { harness, network };
}

async function openLiveTv(page) {
  const live = page.locator('[data-home-focus-key="home-live-tv"]');
  await expect(live).toBeFocused();
  await pressRemote(page, 'SELECT');
  await expect(sidebar(page)).toBeVisible({ timeout: 10_000 });
  await expect(sidebar(page)).not.toHaveClass(/closed/);
}

async function waitForRefresh(network, providerId) {
  await expect.poll(() => network.streamListCallCount(providerId), {
    timeout: 10_000,
    message: `background catalog refresh for ${providerId}`,
  }).toBeGreaterThan(0);
}

async function expectPlaying(page, channelId, expectedName) {
  await expect(status(page)).toHaveAttribute('data-playback-status', 'PLAYING', { timeout: 15_000 });
  await expect(channel(page, channelId)).toHaveAttribute(
    'data-presentation-state',
    /playing/,
  );
  if (expectedName !== undefined) {
    await expect(page.locator('#channel-name')).toHaveText(expectedName);
  }
}

async function openOverlayAfterPlayback(page) {
  await expect(sidebar(page)).toHaveClass(/closed/);
  await pressRemote(page, 'SELECT');
  await expect(sidebar(page)).not.toHaveClass(/closed/);
}

async function switchHomeProvider(page, providerId) {
  await expect(page.locator('#home-page')).toBeVisible();
  await pressRemote(page, 'UP');
  const target = page.locator(`[data-home-focus-key="home-provider:${providerId}"]`);
  if (!(await target.evaluate((element) => element === document.activeElement))) {
    await pressRemote(page, providerId === PLAYNAV_PROVIDER_B ? 'RIGHT' : 'LEFT');
  }
  await expect(target).toBeFocused();
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#home-page')).toBeVisible();
}

test('P01/P02 highlight is inert and explicit Select alone starts playback intent', async ({ context, page }) => {
  const { harness, network } = await setup(page, context);
  await openLiveTv(page);
  await waitForRefresh(network, PLAYNAV_PROVIDER_A);

  await expect(channel(page, '42')).toHaveAttribute('data-presentation-state', 'focused');
  const streamListsBefore = network.streamListCallCount(PLAYNAV_PROVIDER_A);
  const manifestsBefore = network.calls.filter((entry) => entry.kind === 'manifest').length;

  await pressRemote(page, 'DOWN');
  await expect(channel(page, '43')).toHaveAttribute('data-presentation-state', 'focused');
  await page.waitForTimeout(100);

  expect(network.streamListCallCount(PLAYNAV_PROVIDER_A)).toBe(streamListsBefore);
  expect(network.calls.filter((entry) => entry.kind === 'manifest')).toHaveLength(manifestsBefore);
  await expect(status(page)).toHaveAttribute('data-playback-status', 'IDLE');

  await pressRemote(page, 'SELECT');
  await expect(status(page)).toHaveAttribute(
    'data-playback-status',
    /RESOLVING|PREPARING/,
    { timeout: 5_000 },
  );
  await expectPlaying(page, '43', 'A Şampiyon Spor');

  expect(harness.events.pageErrors).toEqual([]);
  expect(harness.events.leakageEvents).toEqual([]);
  expect(await findSecretLeaks(page, RC_SECRET_CANARIES)).toEqual([]);
  assertNoUnexplainedConsoleErrors(harness.events);

  await writeScenario(harness, {
    scenarioId: 'P01-P02-explicit-play',
    startingState: 'provider A Home -> Live TV all scope; channel 42 focused; no playback',
    actions: ['DOWN highlight to channel 43', 'SELECT channel 43'],
    expectedState: 'highlight movement emits no playback request; SELECT emits RESOLVING/PREPARING then PLAYING',
    observedState: 'network counters stayed unchanged during highlight; channel 43 became PLAYING only after SELECT',
  });
});

test('P03/P04 rapid overlapping zap keeps the newest intent and ignores stale completion', async ({ context, page }) => {
  const { harness, network } = await setup(page, context);
  await openLiveTv(page);
  await waitForRefresh(network, PLAYNAV_PROVIDER_A);

  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
  await expectPlaying(page, '43', 'A Şampiyon Spor');
  await openOverlayAfterPlayback(page);

  const older = network.holdNextCatalog(PLAYNAV_PROVIDER_A, PLAYNAV_CHANNEL_IDS);
  await dispatchSpecialRemoteKey(page, 'ChannelDown');
  await expect(status(page)).toHaveAttribute('data-playback-status', 'RESOLVING');

  await dispatchSpecialRemoteKey(page, 'ChannelUp');
  await expectPlaying(page, '42', 'A İstanbul Haber');

  older.release();
  await page.waitForTimeout(150);
  await expect(status(page)).toHaveAttribute('data-playback-status', 'PLAYING');
  await expect(channel(page, '42')).toHaveClass(/playing/);
  await expect(page.locator('#channel-name')).toHaveText('A İstanbul Haber');
  expect(harness.events.pageErrors).toEqual([]);
  expect(harness.events.leakageEvents).toEqual([]);

  await writeScenario(harness, {
    scenarioId: 'P03-P04-last-intent-wins',
    startingState: 'provider A channel 43 playing',
    actions: [
      'hold older ChannelDown resolution toward 44',
      'issue newer ChannelUp toward 42',
      'allow 42 to play',
      'release stale 44 resolution',
    ],
    expectedState: 'newest intended channel wins; stale earlier completion cannot replace it',
    observedState: 'channel 42 remained PLAYING after the older held resolution completed',
  });
});

test('P05 stream-resolution failure presents FAILED and preserves the prior usable playback state', async ({ context, page }) => {
  const { harness, network } = await setup(page, context);
  await openLiveTv(page);
  await waitForRefresh(network, PLAYNAV_PROVIDER_A);

  await pressRemote(page, 'SELECT');
  await expectPlaying(page, '42', 'A İstanbul Haber');
  await openOverlayAfterPlayback(page);
  await pressRemote(page, 'DOWN');
  await expect(channel(page, '43')).toHaveAttribute('data-presentation-state', 'focused');

  network.queueNextCatalog(PLAYNAV_PROVIDER_A, ['42', '44']);
  await pressRemote(page, 'SELECT');

  await expect(status(page)).toHaveAttribute('data-playback-status', 'FAILED', { timeout: 10_000 });
  await expect(channel(page, '42')).toHaveClass(/playing/);
  await expect(page.locator('#channel-name')).toHaveText('A İstanbul Haber');
  await expect(sidebar(page)).not.toHaveClass(/closed/);
  expect(harness.events.pageErrors).toEqual([]);
  expect(harness.events.leakageEvents).toEqual([]);

  await writeScenario(harness, {
    scenarioId: 'P05-resolution-failure-preservation',
    startingState: 'provider A channel 42 successfully playing',
    actions: ['open overlay', 'highlight channel 43', 'resolve catalog without channel 43', 'SELECT'],
    expectedState: 'safe FAILED presentation with prior usable playback preserved',
    observedState: 'FAILED was shown while channel 42 stayed marked playing and retained the now-playing label',
  });
});

test('P06/P13 successful A -> B playback keeps provider identity despite the same channelId', async ({ context, page }) => {
  const { harness, network } = await setup(page, context);
  await openLiveTv(page);
  await waitForRefresh(network, PLAYNAV_PROVIDER_A);

  await pressRemote(page, 'SELECT');
  await expectPlaying(page, '42', 'A İstanbul Haber');

  await pressRemote(page, 'BACK');
  await switchHomeProvider(page, PLAYNAV_PROVIDER_B);
  await openLiveTv(page);
  await waitForRefresh(network, PLAYNAV_PROVIDER_B);

  await expect(channel(page, '42')).toContainText('B İstanbul Haber');
  await pressRemote(page, 'SELECT');
  await expectPlaying(page, '42', 'B İstanbul Haber');

  const manifests = network.calls.filter((entry) => entry.kind === 'manifest');
  expect(manifests.some((entry) => entry.providerId === PLAYNAV_PROVIDER_A && entry.channelId === '42')).toBe(true);
  expect(manifests.some((entry) => entry.providerId === PLAYNAV_PROVIDER_B && entry.channelId === '42')).toBe(true);
  expect(harness.events.pageErrors).toEqual([]);
  expect(harness.events.leakageEvents).toEqual([]);

  await writeScenario(harness, {
    scenarioId: 'P06-P13-cross-provider-success',
    startingState: 'provider A channelId 42 playing; provider B also owns channelId 42',
    actions: ['Back to Home', 'switch active provider to B', 'open Live TV', 'SELECT B channelId 42'],
    expectedState: 'explicit B playback succeeds without provider/channel identity collision',
    observedState: 'provider-specific B channel name and B manifest request own the same channelId 42 after the switch',
  });
});

test('P07 failed A -> B resolution keeps A media session and does not create B watch state', async ({ context, page }) => {
  const { harness, network } = await setup(page, context, { seedWatchState: true });

  const lastWatched = page.locator(`[data-home-focus-key="home-last-watched:${PLAYNAV_PROVIDER_A}:42"]`);
  await expect(lastWatched).toBeFocused();
  await pressRemote(page, 'SELECT');
  await expectPlaying(page, '42', 'A İstanbul Haber');
  await waitForRefresh(network, PLAYNAV_PROVIDER_A);

  const mediaBefore = await page.locator('#video').evaluate((video) => ({
    currentSrc: video.currentSrc,
    readyState: video.readyState,
  }));

  await pressRemote(page, 'BACK');
  await switchHomeProvider(page, PLAYNAV_PROVIDER_B);
  await openLiveTv(page);
  await waitForRefresh(network, PLAYNAV_PROVIDER_B);

  const watchBefore = await readPlayNavWatchState(page);
  network.queueNextCatalog(PLAYNAV_PROVIDER_B, ['43', '44']);
  await pressRemote(page, 'SELECT');
  await expect(status(page)).toHaveAttribute('data-playback-status', 'FAILED', { timeout: 10_000 });

  const mediaAfter = await page.locator('#video').evaluate((video) => ({
    currentSrc: video.currentSrc,
    readyState: video.readyState,
  }));
  const watchAfter = await readPlayNavWatchState(page);

  expect(mediaAfter.currentSrc).toBe(mediaBefore.currentSrc);
  expect(mediaAfter.readyState).toBeGreaterThan(0);
  expect(watchAfter).toEqual(watchBefore);
  expect(watchAfter.some((record) => record.providerId === PLAYNAV_PROVIDER_B)).toBe(false);
  expect(harness.events.pageErrors).toEqual([]);
  expect(harness.events.leakageEvents).toEqual([]);

  await writeScenario(harness, {
    scenarioId: 'P07-cross-provider-resolution-failure',
    startingState: 'provider A channelId 42 has an active browser media session and pre-existing A watch state',
    actions: ['return Home', 'switch to provider B', 'open B Live TV', 'make B channelId 42 unresolvable', 'SELECT'],
    expectedState: 'B shows FAILED without handing off the A media session or corrupting provider-scoped watch state',
    observedState: 'video currentSrc stayed unchanged; watch records stayed byte-for-byte equivalent and no B watch record appeared',
  });
});

test('P08/P09/P10 repeated layers and Back close one owner at a time with stable restoration', async ({ context, page }) => {
  const { harness } = await setup(page, context);
  await openLiveTv(page);

  await expect(channel(page, '42')).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'RIGHT');
  await pressRemote(page, 'SELECT');
  await expect(featureRoot(page)).toHaveAttribute('data-active-layer', 'actions');
  await expect(page.locator('.live-tv-action[data-action-id="WATCH"]')).toHaveAttribute(
    'data-presentation-state',
    'focused',
  );

  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  const programAction = page.locator('.live-tv-action[data-action-id="PROGRAM_INFO"]');
  await expect(programAction).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'SELECT');
  await expect(featureRoot(page)).toHaveAttribute('data-active-layer', 'program-info');
  await expect(page.locator('[data-feature-section="program-info"]')).toBeVisible();

  await pressRemote(page, 'BACK');
  await expect(featureRoot(page)).toHaveAttribute('data-active-layer', 'actions');
  await expect(programAction).toHaveAttribute('data-presentation-state', 'focused');

  await pressRemote(page, 'BACK');
  await expect(featureRoot(page)).toHaveAttribute('data-active-layer', 'none');
  await expect(sidebar(page)).not.toHaveClass(/closed/);
  await expect(page.locator('.channel-item[data-presentation-state="focused"]')).toHaveCount(1);

  await pressRemote(page, 'BACK');
  await expect(sidebar(page)).toHaveClass(/closed/);
  await expect(page.locator('#home-page')).toHaveCount(0);

  await pressRemote(page, 'BACK');
  await expect(page.locator('#home-page')).toBeVisible();

  await pressRemote(page, 'SELECT');
  await expect(sidebar(page)).not.toHaveClass(/closed/);
  await pressRemote(page, 'BACK');
  await expect(sidebar(page)).toHaveClass(/closed/);
  await pressRemote(page, 'SELECT');
  await expect(sidebar(page)).not.toHaveClass(/closed/);

  expect(harness.events.pageErrors).toEqual([]);
  expect(harness.events.leakageEvents).toEqual([]);

  await writeScenario(harness, {
    scenarioId: 'P08-P10-layer-focus-back',
    startingState: 'Live TV overlay open on provider A channel 42',
    actions: [
      'open Actions',
      'move to Program Info and open it',
      'Back Program Info -> Actions',
      'Back Actions -> overlay owner',
      'Back overlay -> closed',
      'Back root -> Home',
      'repeat overlay open/close',
    ],
    expectedState: 'one Back closes exactly one current child; focus restores to the prior stable owner; repeated open/close leaves one owner',
    observedState: 'layer and overlay states were asserted after every Back; channel focus owner was restored before overlay close',
  });

  await writeScenario(harness, {
    scenarioId: 'P10-search-focus',
    startingState: 'M3 Live TV browser remote surface',
    actions: ['inspect browser-reachable remote interactions'],
    expectedState: 'Search focus restoration executes only if Search is browser-reachable through production remote routing',
    observedState: 'Search has no browser remote action in the production AppComposition mapping; no app-internal patching was used',
    status: 'NOT-AVAILABLE',
  });
});

test('P11 catalog deletion/reorder falls back to one valid stable channel focus owner', async ({ context, page }) => {
  const { harness, network } = await setup(page, context);
  const refresh = network.holdNextCatalog(PLAYNAV_PROVIDER_A, ['44', '42']);

  await openLiveTv(page);
  await expect(channel(page, '42')).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'DOWN');
  await expect(channel(page, '43')).toHaveAttribute('data-presentation-state', 'focused');

  await expect.poll(() => network.streamListCallCount(PLAYNAV_PROVIDER_A), { timeout: 10_000 })
    .toBeGreaterThan(0);
  refresh.release();

  await expect(channel(page, '43')).toHaveCount(0, { timeout: 10_000 });
  const focused = page.locator('.channel-item[data-presentation-state="focused"]');
  await expect(focused).toHaveCount(1);
  const fallbackId = await focused.getAttribute('data-channel-id');
  expect(['42', '44']).toContain(fallbackId);
  expect(harness.events.pageErrors).toEqual([]);

  await writeScenario(harness, {
    scenarioId: 'P11-deleted-reordered-focus',
    startingState: 'channel 43 focused while background provider refresh is held',
    actions: ['refresh catalog reordered to 44,42 with focused 43 deleted', 'release refresh'],
    expectedState: 'focus falls back to exactly one valid stable channel',
    observedState: `deleted 43 disappeared and the sole focused fallback was ${fallbackId}`,
  });
});

test('P12 empty list remains bounded and Back-safe', async ({ context, page }) => {
  const { harness } = await setup(page, context, {
    providerAChannels: [],
    providerACatalog: [],
  });
  await openLiveTv(page);

  await expect(page.locator('.channel-item')).toHaveCount(0);
  await pressRemote(page, 'UP');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
  await expect(status(page)).toHaveAttribute('data-playback-status', 'IDLE');
  await pressRemote(page, 'BACK');
  await expect(sidebar(page)).toHaveClass(/closed/);
  expect(harness.events.pageErrors).toEqual([]);

  await writeScenario(harness, {
    scenarioId: 'P12-empty-list',
    startingState: 'active provider with empty cached and refreshed catalog',
    actions: ['UP', 'DOWN', 'SELECT', 'BACK'],
    expectedState: 'navigation is bounded, no playback intent is created, Back remains safe',
    observedState: 'zero channel items remained, playback stayed IDLE, overlay closed cleanly',
  });
});

test('P12 single-item list is no-wrap and explicit play still works', async ({ context, page }) => {
  const { harness } = await setup(page, context, {
    providerAChannels: ['42'],
    providerACatalog: ['42'],
  });
  await openLiveTv(page);

  await expect(page.locator('.channel-item')).toHaveCount(1);
  await expect(channel(page, '42')).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'UP');
  await pressRemote(page, 'DOWN');
  await expect(channel(page, '42')).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'SELECT');
  await expectPlaying(page, '42', 'A İstanbul Haber');
  expect(harness.events.pageErrors).toEqual([]);

  await writeScenario(harness, {
    scenarioId: 'P12-single-item',
    startingState: 'provider A with exactly one channel',
    actions: ['UP', 'DOWN', 'SELECT'],
    expectedState: 'focus never wraps away from the sole item and playback requires explicit Select',
    observedState: 'channel 42 remained the sole focus owner and became PLAYING only after Select',
  });
});

test('P14 reduced motion preserves reachability, focus order, Back, and explicit-play semantics', async ({ context, page }) => {
  const { harness, network } = await setup(page, context, { reducedMotion: true });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

  await openLiveTv(page);
  await waitForRefresh(network, PLAYNAV_PROVIDER_A);
  await expect(page.locator('.channel-item')).toHaveCount(3);

  const before = network.streamListCallCount(PLAYNAV_PROVIDER_A);
  await pressRemote(page, 'DOWN');
  await expect(channel(page, '43')).toHaveAttribute('data-presentation-state', 'focused');
  await page.waitForTimeout(50);
  expect(network.streamListCallCount(PLAYNAV_PROVIDER_A)).toBe(before);

  const transitionDuration = await channel(page, '43').evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(transitionDuration.split(',').every((value) => value.trim() === '0s')).toBe(true);

  await pressRemote(page, 'SELECT');
  await expectPlaying(page, '43', 'A Şampiyon Spor');
  await pressRemote(page, 'SELECT');
  await expect(sidebar(page)).not.toHaveClass(/closed/);
  await pressRemote(page, 'BACK');
  await expect(sidebar(page)).toHaveClass(/closed/);

  expect(harness.events.pageErrors).toEqual([]);
  expect(harness.events.leakageEvents).toEqual([]);

  await writeScenario(harness, {
    scenarioId: 'P14-reduced-motion',
    startingState: 'prefers-reduced-motion: reduce with provider A Home',
    actions: ['open Live TV', 'DOWN highlight', 'SELECT playback', 'open overlay', 'BACK'],
    expectedState: 'motion is reduced while controls, focus order, Back ownership and explicit-play requirement remain unchanged',
    observedState: `channel transitionDuration=${transitionDuration}; highlight remained inert; Select played 43; Back closed one overlay`,
  });
});

test('P15 synthetic playback/network failure has no uncontrolled pageerror or secret leakage', async ({ context, page }) => {
  const { harness, network } = await setup(page, context);
  await openLiveTv(page);
  await waitForRefresh(network, PLAYNAV_PROVIDER_A);

  network.setManifestFailure(PLAYNAV_PROVIDER_A, '42', 'http-500');
  await pressRemote(page, 'SELECT');
  await expect(status(page)).toHaveAttribute('data-playback-status', 'FAILED', { timeout: 15_000 });

  expect(harness.events.pageErrors).toEqual([]);
  expect(harness.events.leakageEvents).toEqual([]);
  expect(await findSecretLeaks(page, RC_SECRET_CANARIES)).toEqual([]);

  const storage = await snapshotOrdinaryBrowserStorage(page);
  expect(storage.localStorage).toBeDefined();
  expect(storage.sessionStorage).toBeDefined();
  expect(storage.indexedDb).toBeDefined();

  const serializedDiagnostics = JSON.stringify({
    console: harness.events.console,
    pageErrors: harness.events.pageErrors,
    requestFailures: harness.events.requestFailures,
    httpErrors: harness.events.httpErrors,
    calls: network.calls,
  });
  for (const secret of RC_SECRET_CANARIES) {
    expect(serializedDiagnostics).not.toContain(secret);
  }

  await writeScenario(harness, {
    scenarioId: 'P15-failure-sanitization',
    startingState: 'provider A channel 42 focused with synthetic browser media route',
    actions: ['force HTTP 500 for the transient manifest', 'SELECT'],
    expectedState: 'safe FAILED state; no uncontrolled pageerror; no raw transient credential/token leakage into browser diagnostics or storage',
    observedState: 'FAILED completed; pageErrors/leakageEvents were empty and sanitized diagnostics contained no secret canary',
  });
});
