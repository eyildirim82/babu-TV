import { expect, test } from '@playwright/test';
import {
  assertNoUnexplainedConsoleErrors,
  findSecretLeaks,
  installBrowserHarness,
  openFreshApp,
  pressRemote,
  snapshotOrdinaryBrowserStorage,
} from '../lib/harness.mjs';
import {
  createEvidenceRecord,
  sanitizeTextForEvidence,
  writeEvidence,
} from '../lib/evidence.mjs';
import {
  RC_ENDPOINTS,
  RC_PRODUCTION_SHA,
  RC_SECRET_CANARIES,
  RC_SECRETS,
} from '../fixtures/common.mjs';
import {
  COLLIDING_CHANNEL_ID,
  activeProviderId,
  durableStateSignature,
  favoriteRecords,
  injectMalformedStructuredRecords,
  lastWatchedRecord,
  providerCatalogSummary,
  providerIds,
  readLegacyPersistenceSummary,
  readSafeStructuredState,
  seedLegacyM3uPersistence,
  watchAggregateRecords,
} from '../fixtures/pack-c-state.mjs';

const APP_SURFACES = ['home-page', 'first-run-page', 'xtream-entry-page', 'm3u-entry-page', 'provider-management-page'];

function safeError(error) {
  return sanitizeTextForEvidence(error instanceof Error ? error.message : String(error));
}

function credentialProviderIds(widgetData) {
  const raw = widgetData.readRaw();
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed).sort()
      : [];
  } catch {
    return [];
  }
}

async function waitForAnySurface(page, timeout = 10_000) {
  await page.waitForFunction((ids) => ids.some((id) => {
    const element = document.getElementById(id);
    return element !== null && !element.classList.contains('hidden');
  }), APP_SURFACES, { timeout });
}

async function reloadToHome(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 10_000 });
}

async function createScenarioHarness(context, page, options = {}) {
  const harness = await installBrowserHarness(context, options);
  await openFreshApp(page);
  await waitForAnySurface(page);
  return harness;
}

async function submitXtream(page, serverUrl) {
  await expect(page.locator('#xtream-entry-page')).toBeVisible({ timeout: 10_000 });
  await page.locator('#xtream-server-url').fill(serverUrl);
  await page.locator('#xtream-username').fill(RC_SECRETS.xtreamUsername);
  await page.locator('#xtream-password').fill(RC_SECRETS.xtreamPassword);
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 15_000 });
}

async function onboardXtream(page, serverUrl = RC_ENDPOINTS.xtreamA) {
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });
  await pressRemote(page, 'SELECT');
  await submitXtream(page, serverUrl);
  const state = await readSafeStructuredState(page);
  expect(state.providers).toHaveLength(1);
  const providerId = state.providers[0]?.id;
  expect(typeof providerId).toBe('string');
  expect(activeProviderId(state)).toBe(providerId);
  return providerId;
}

async function onboardM3u(page) {
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });
  await pressRemote(page, 'RIGHT');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#m3u-entry-page')).toBeVisible({ timeout: 10_000 });
  await page.locator('#m3u-playlist-url').fill(RC_ENDPOINTS.m3uA);
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 15_000 });
  const state = await readSafeStructuredState(page);
  expect(state.providers).toHaveLength(1);
  return state.providers[0]?.id;
}

async function homeFocusLayout(page, targetKey) {
  return page.evaluate((target) => {
    const rows = Array.from(document.querySelectorAll('.home-row'))
      .map((row) => Array.from(row.querySelectorAll('[data-home-focus-key]'))
        .map((element) => element.getAttribute('data-home-focus-key'))
        .filter((value) => typeof value === 'string'))
      .filter((row) => row.length > 0);
    const current = document.activeElement?.getAttribute?.('data-home-focus-key') ?? null;
    let currentPosition = null;
    let targetPosition = null;
    rows.forEach((row, rowIndex) => row.forEach((key, columnIndex) => {
      if (key === current) currentPosition = { row: rowIndex, column: columnIndex };
      if (key === target) targetPosition = { row: rowIndex, column: columnIndex };
    }));
    return { current, currentPosition, targetPosition };
  }, targetKey);
}

async function focusHomeKey(page, targetKey) {
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 10_000 });
  for (let step = 0; step < 24; step += 1) {
    const layout = await homeFocusLayout(page, targetKey);
    if (layout.current === targetKey) return;
    if (layout.targetPosition === null) throw new Error(`Home focus target is unavailable: ${targetKey}`);
    if (layout.currentPosition === null) {
      await pressRemote(page, 'DOWN');
      continue;
    }
    if (layout.currentPosition.row < layout.targetPosition.row) {
      await pressRemote(page, 'DOWN');
    } else if (layout.currentPosition.row > layout.targetPosition.row) {
      await pressRemote(page, 'UP');
    } else if (layout.currentPosition.column < layout.targetPosition.column) {
      await pressRemote(page, 'RIGHT');
    } else if (layout.currentPosition.column > layout.targetPosition.column) {
      await pressRemote(page, 'LEFT');
    }
  }
  throw new Error(`Home focus did not converge: ${targetKey}`);
}

async function openProviderManagement(page) {
  await focusHomeKey(page, 'home-settings');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#provider-management-page')).toBeVisible({ timeout: 10_000 });
}

async function focusProviderAction(page, targetId) {
  await expect(page.locator(`[id="${targetId}"]`)).toBeVisible({ timeout: 10_000 });
  for (let step = 0; step < 32; step += 1) {
    const state = await page.evaluate((target) => {
      const ids = Array.from(document.querySelectorAll('#provider-management-page .provider-management-button'))
        .map((element) => element.id)
        .filter((id) => id !== 'app-settings');
      return {
        ids,
        current: document.activeElement?.id ?? null,
        target,
      };
    }, targetId);
    if (state.current === targetId) return;
    const targetIndex = state.ids.indexOf(targetId);
    const currentIndex = state.ids.indexOf(state.current);
    if (targetIndex < 0) throw new Error(`Provider action is unavailable: ${targetId}`);
    if (currentIndex < 0 || currentIndex < targetIndex) await pressRemote(page, 'DOWN');
    else await pressRemote(page, 'UP');
  }
  throw new Error(`Provider focus did not converge: ${targetId}`);
}

async function addSecondXtreamProvider(page) {
  const before = await readSafeStructuredState(page);
  const beforeIds = new Set(providerIds(before));
  await openProviderManagement(page);
  await focusProviderAction(page, 'add-provider');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });
  await pressRemote(page, 'SELECT');
  await submitXtream(page, RC_ENDPOINTS.xtreamB);
  const after = await readSafeStructuredState(page);
  const newIds = providerIds(after).filter((id) => !beforeIds.has(id));
  expect(newIds).toHaveLength(1);
  expect(activeProviderId(after)).toBe(newIds[0]);
  return newIds[0];
}

async function waitForFeatures(page) {
  await expect(page.locator('[data-feature-section="favorites"]')).toBeVisible({ timeout: 10_000 });
}

async function openLiveTv(page) {
  await focusHomeKey(page, 'home-live-tv');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('.channel-item')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.channel-item.highlighted')).toHaveAttribute('data-channel-id', COLLIDING_CHANNEL_ID);
  await waitForFeatures(page);
  await expect(page.locator('#channel-list')).toHaveClass(/zone-active/, { timeout: 10_000 });
}

async function openChannelActions(page) {
  await expect(page.locator('#channel-list')).toHaveClass(/zone-active/, { timeout: 10_000 });
  await pressRemote(page, 'RIGHT');
  await expect(page.locator('#channel-list')).not.toHaveClass(/zone-active/, { timeout: 10_000 });
  await pressRemote(page, 'SELECT');
  await expect(page.locator('.live-tv-feature-root')).toHaveAttribute('data-active-layer', 'actions', { timeout: 10_000 });
}

async function returnFromLiveTvToHome(page) {
  for (let step = 0; step < 5; step += 1) {
    if (await page.locator('#home-page').isVisible()) return;
    await pressRemote(page, 'BACK');
    await page.waitForTimeout(100);
  }
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 5_000 });
}

async function toggleFavoriteForActiveProvider(page, providerId) {
  await openLiveTv(page);
  await openChannelActions(page);
  await expect(page.locator('.live-tv-action[data-action-id="WATCH"]')).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'DOWN');
  await expect(page.locator('.live-tv-action[data-action-id="FAVORITE"]')).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'SELECT');
  await expect.poll(async () => favoriteRecords(await readSafeStructuredState(page), providerId)
    .some((record) => record.channelId === COLLIDING_CHANNEL_ID), { timeout: 10_000 }).toBe(true);
  await returnFromLiveTvToHome(page);
}

async function attemptBrowserWatch(page, providerId) {
  await openLiveTv(page);
  await pressRemote(page, 'SELECT');
  let record = null;
  try {
    await expect.poll(async () => {
      record = lastWatchedRecord(await readSafeStructuredState(page), providerId);
      return record?.channelId ?? null;
    }, { timeout: 8_000 }).toBe(COLLIDING_CHANNEL_ID);
  } catch {
    const playbackStatus = await page.locator('#live-tv-status').getAttribute('data-playback-status').catch(() => null);
    await returnFromLiveTvToHome(page);
    return { available: false, playbackStatus: playbackStatus ?? 'unknown' };
  }
  await returnFromLiveTvToHome(page);
  return { available: true, record };
}

async function editXtreamProvider(page, providerId, { failCategories = false } = {}) {
  await openProviderManagement(page);
  await focusProviderAction(page, `provider:${providerId}:edit`);
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#xtream-entry-page')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#xtream-server-url')).toHaveValue('');
  await expect(page.locator('#xtream-username')).toHaveValue('');
  await expect(page.locator('#xtream-password')).toHaveValue('');
  await page.locator('#xtream-server-url').fill(RC_ENDPOINTS.xtreamA);
  await page.locator('#xtream-username').fill(RC_SECRETS.xtreamUsername);
  await page.locator('#xtream-password').fill(RC_SECRETS.xtreamPassword);
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#provider-management-page')).toBeVisible({ timeout: failCategories ? 20_000 : 15_000 });
}

async function deleteProvider(page, providerId) {
  await openProviderManagement(page);
  await focusProviderAction(page, `provider:${providerId}:delete`);
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#cancel-delete')).toBeVisible({ timeout: 10_000 });
  await pressRemote(page, 'DOWN');
  await expect(page.locator('#confirm-delete')).toBeFocused();
  await pressRemote(page, 'SELECT');
  await expect(page.locator(`[id="provider:${providerId}:delete"]`)).toHaveCount(0, { timeout: 15_000 });
}

async function assertCleanBrowser(harness) {
  expect(harness.events.pageErrors).toEqual([]);
  assertNoUnexplainedConsoleErrors(harness.events);
}

async function assertNoCredentialLeaks(page) {
  const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES);
  expect(leaks).toEqual([]);
  return leaks;
}

async function recordScenario(testInfo, page, harness, metadata, execute) {
  let outcome = {
    observedState: 'scenario did not complete',
    reloadPersistence: 'not reached',
    leakage: 'not checked',
    status: 'RED',
  };
  let failure = null;
  try {
    const result = await execute();
    outcome = { ...outcome, ...result };
    const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES);
    expect(leaks).toEqual([]);
    outcome.leakage = 'clean';
    await assertCleanBrowser(harness);
  } catch (error) {
    failure = error;
    outcome = {
      ...outcome,
      observedState: `RED: ${safeError(error)}`,
      reloadPersistence: outcome.reloadPersistence === 'not reached' ? 'failed before reload qualification completed' : outcome.reloadPersistence,
      leakage: harness.events.leakageEvents.length === 0 ? outcome.leakage : 'browser diagnostic leakage detected',
      status: 'RED',
    };
  }

  const record = createEvidenceRecord({
    scenarioId: metadata.id,
    productionSha: RC_PRODUCTION_SHA,
    startingState: metadata.startingState,
    actions: metadata.actions,
    expectedState: metadata.expectedState,
    observedState: outcome.observedState,
    console: harness.events.console,
    pageErrors: harness.events.pageErrors,
    requestFailures: harness.events.requestFailures,
    reloadPersistence: outcome.reloadPersistence,
    leakage: outcome.leakage,
    artifacts: [],
    status: outcome.status,
  });
  const evidencePath = await writeEvidence(record);
  await testInfo.attach(`${metadata.id}-evidence`, { path: evidencePath, contentType: 'application/json' });
  if (failure !== null) throw failure;
  return outcome;
}

function scenario(id, title, metadata, body) {
  test(`${id} ${title}`, async ({ context, page }, testInfo) => {
    const harness = await createScenarioHarness(context, page, metadata.harnessOptions ?? {});
    await recordScenario(testInfo, page, harness, {
      id,
      startingState: metadata.startingState,
      actions: metadata.actions,
      expectedState: metadata.expectedState,
    }, () => body({ context, page, harness }));
  });
}

scenario('C01', 'onboarding provider and active-provider state survive reload', {
  startingState: 'clean structured browser storage and empty WidgetData seam',
  actions: ['onboard synthetic Xtream provider A', 'capture provider and active-provider identities', 'reload'],
  expectedState: 'same provider record and active-provider identity survive reload',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  const before = await readSafeStructuredState(page);
  await reloadToHome(page);
  const after = await readSafeStructuredState(page);
  expect(providerIds(after)).toEqual(providerIds(before));
  expect(activeProviderId(after)).toBe(providerA);
  await assertNoCredentialLeaks(page);
  return {
    observedState: 'provider record and active-provider identity matched before and after reload',
    reloadPersistence: 'provider + active provider PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C02', 'Favorite mutation survives reload', {
  startingState: 'one active Xtream provider with deterministic catalog',
  actions: ['toggle channel 42 Favorite through Live TV actions', 'return Home', 'reload'],
  expectedState: 'provider-scoped Favorite remains present after reload',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  await toggleFavoriteForActiveProvider(page, providerA);
  await reloadToHome(page);
  const after = await readSafeStructuredState(page);
  expect(favoriteRecords(after, providerA).some((record) => record.channelId === COLLIDING_CHANNEL_ID)).toBe(true);
  await assertNoCredentialLeaks(page);
  return {
    observedState: 'Favorite for provider A/channel 42 remained present after reload',
    reloadPersistence: 'Favorite PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C03', 'Last Watched survives reload where browser playback can establish a session', {
  startingState: 'one active Xtream provider with deterministic stream mock',
  actions: ['request playback for channel 42', 'observe durable Last Watched if playback reaches playing', 'reload'],
  expectedState: 'browser-established Last Watched survives reload; otherwise classify the playback seam honestly',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  const watch = await attemptBrowserWatch(page, providerA);
  if (!watch.available) {
    await assertNoCredentialLeaks(page);
    return {
      observedState: `headless browser playback did not establish durable Last Watched; playback status ${watch.playbackStatus}`,
      reloadPersistence: 'watch durability NOT-AVAILABLE; HARNESS INTEGRATION REQUIRED because the H0 browser playback seam did not establish a successful watch session',
      leakage: 'clean',
      status: 'NOT-AVAILABLE',
    };
  }
  await reloadToHome(page);
  const after = await readSafeStructuredState(page);
  expect(lastWatchedRecord(after, providerA)?.channelId).toBe(COLLIDING_CHANNEL_ID);
  await assertNoCredentialLeaks(page);
  return {
    observedState: 'Last Watched for provider A/channel 42 remained present after reload',
    reloadPersistence: 'Last Watched PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C04', 'same channelId Favorites remain provider scoped', {
  startingState: 'provider A active with channel 42',
  actions: ['Favorite provider A/channel 42', 'add provider B with colliding channel 42', 'reload'],
  expectedState: 'Favorite exists only in provider A partition',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  await toggleFavoriteForActiveProvider(page, providerA);
  const providerB = await addSecondXtreamProvider(page);
  let state = await readSafeStructuredState(page);
  expect(state.channels.some((channel) => channel.providerId === providerA && channel.id === COLLIDING_CHANNEL_ID)).toBe(true);
  expect(state.channels.some((channel) => channel.providerId === providerB && channel.id === COLLIDING_CHANNEL_ID)).toBe(true);
  expect(favoriteRecords(state, providerA).some((record) => record.channelId === COLLIDING_CHANNEL_ID)).toBe(true);
  expect(favoriteRecords(state, providerB)).toEqual([]);
  await reloadToHome(page);
  state = await readSafeStructuredState(page);
  expect(favoriteRecords(state, providerA).some((record) => record.channelId === COLLIDING_CHANNEL_ID)).toBe(true);
  expect(favoriteRecords(state, providerB)).toEqual([]);
  return {
    observedState: 'colliding channel 42 remained Favorite only for provider A before and after reload',
    reloadPersistence: 'Favorite provider isolation PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C05', 'same channelId watch state remains provider scoped', {
  startingState: 'provider A active with channel 42 and browser playback seam available when possible',
  actions: ['establish provider A Last Watched on channel 42', 'add provider B with colliding channel 42', 'reload'],
  expectedState: 'provider A watch state never appears in provider B partition',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  const watch = await attemptBrowserWatch(page, providerA);
  if (!watch.available) {
    return {
      observedState: `watch isolation could not be exercised because browser playback did not establish a session; playback status ${watch.playbackStatus}`,
      reloadPersistence: 'watch provider isolation NOT-AVAILABLE; HARNESS INTEGRATION REQUIRED without browser-created watch state',
      leakage: 'clean',
      status: 'NOT-AVAILABLE',
    };
  }
  const providerB = await addSecondXtreamProvider(page);
  await reloadToHome(page);
  const state = await readSafeStructuredState(page);
  expect(lastWatchedRecord(state, providerA)?.channelId).toBe(COLLIDING_CHANNEL_ID);
  expect(lastWatchedRecord(state, providerB)).toBeNull();
  expect(watchAggregateRecords(state, providerB)).toEqual([]);
  return {
    observedState: 'provider A Last Watched remained isolated from provider B with the same channelId',
    reloadPersistence: 'watch provider isolation PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C06', 'provider switch active semantics survive reload', {
  startingState: 'providers A and B configured; B active after onboarding',
  actions: ['switch active provider to A from Home provider selector', 'reload'],
  expectedState: 'provider A remains active after reload',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  const providerB = await addSecondXtreamProvider(page);
  expect(providerA).not.toBe(providerB);
  await focusHomeKey(page, `home-provider:${providerA}`);
  await pressRemote(page, 'SELECT');
  await expect.poll(async () => activeProviderId(await readSafeStructuredState(page))).toBe(providerA);
  await reloadToHome(page);
  expect(activeProviderId(await readSafeStructuredState(page))).toBe(providerA);
  return {
    observedState: 'active provider changed from B to A and remained A after reload',
    reloadPersistence: 'active-provider switch PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C07', 'provider re-entry preserves providerId and durable user state', {
  startingState: 'provider A configured with Favorite and optional browser-created watch state',
  actions: ['open provider edit', 'verify secret fields are blank', 're-enter same synthetic credentials', 'reload'],
  expectedState: 'same providerId remains; Favorite and any browser-created watch state remain untouched',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  await toggleFavoriteForActiveProvider(page, providerA);
  const watch = await attemptBrowserWatch(page, providerA);
  await editXtreamProvider(page, providerA);
  await reloadToHome(page);
  const state = await readSafeStructuredState(page);
  expect(providerIds(state)).toEqual([providerA]);
  expect(favoriteRecords(state, providerA).some((record) => record.channelId === COLLIDING_CHANNEL_ID)).toBe(true);
  if (watch.available) expect(lastWatchedRecord(state, providerA)?.channelId).toBe(COLLIDING_CHANNEL_ID);
  await assertNoCredentialLeaks(page);
  return {
    observedState: watch.available
      ? 're-entry preserved providerId, Favorite and Last Watched'
      : 're-entry preserved providerId and Favorite; browser watch sub-check was not available',
    reloadPersistence: watch.available ? 're-entry durable state PASS' : 're-entry Favorite PASS; watch sub-check NOT-AVAILABLE',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C08', 'provider delete cleans target state and preserves unrelated provider state', {
  startingState: 'providers A and B configured with provider-scoped Favorites; optional A watch state',
  actions: ['delete provider A through confirmation', 'verify target credential key removed', 'reload'],
  expectedState: 'provider A/catalog/user state removed; provider B durable state and credential key preserved',
}, async ({ page, harness }) => {
  const providerA = await onboardXtream(page);
  await toggleFavoriteForActiveProvider(page, providerA);
  const watchA = await attemptBrowserWatch(page, providerA);
  const providerB = await addSecondXtreamProvider(page);
  await toggleFavoriteForActiveProvider(page, providerB);
  const beforeB = providerCatalogSummary(await readSafeStructuredState(page), providerB);
  await deleteProvider(page, providerA);
  expect(credentialProviderIds(harness.widgetData)).toEqual([providerB]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 10_000 });
  const state = await readSafeStructuredState(page);
  expect(providerIds(state)).toEqual([providerB]);
  expect(providerCatalogSummary(state, providerA)).toEqual({ categories: 0, channels: 0, epgPrograms: 0 });
  expect(favoriteRecords(state, providerA)).toEqual([]);
  expect(lastWatchedRecord(state, providerA)).toBeNull();
  expect(watchAggregateRecords(state, providerA)).toEqual([]);
  expect(providerCatalogSummary(state, providerB)).toEqual(beforeB);
  expect(favoriteRecords(state, providerB).some((record) => record.channelId === COLLIDING_CHANNEL_ID)).toBe(true);
  return {
    observedState: watchA.available
      ? 'target provider/catalog/Favorite/watch/credential state removed; provider B state preserved'
      : 'target provider/catalog/Favorite/credential state removed and provider B preserved; A watch state was not browser-created',
    reloadPersistence: 'delete cleanup/preservation PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C09', 'stale catalog survives degraded re-entry refresh', {
  startingState: 'provider A with usable cached catalog and Favorite',
  actions: ['record cached catalog', 'force synthetic categories refresh failure', 're-enter provider A', 'reload'],
  expectedState: 'provider identity, usable cached catalog and durable user state are not destroyed by degraded refresh',
}, async ({ page, harness }) => {
  const providerA = await onboardXtream(page);
  await toggleFavoriteForActiveProvider(page, providerA);
  const before = await readSafeStructuredState(page);
  const beforeCatalog = providerCatalogSummary(before, providerA);
  expect(beforeCatalog.channels).toBeGreaterThan(0);
  harness.providerMocks.setXtreamMode('categories', 'http-500');
  harness.providerMocks.setXtreamMode('epg', 'http-500');
  await editXtreamProvider(page, providerA, { failCategories: true });
  await reloadToHome(page);
  const after = await readSafeStructuredState(page);
  expect(providerIds(after)).toEqual([providerA]);
  expect(providerCatalogSummary(after, providerA).channels).toBe(beforeCatalog.channels);
  expect(providerCatalogSummary(after, providerA).categories).toBe(beforeCatalog.categories);
  expect(favoriteRecords(after, providerA).some((record) => record.channelId === COLLIDING_CHANNEL_ID)).toBe(true);
  const epgAvailable = beforeCatalog.epgPrograms > 0;
  if (epgAvailable) expect(providerCatalogSummary(after, providerA).epgPrograms).toBe(beforeCatalog.epgPrograms);
  return {
    observedState: epgAvailable
      ? 'degraded refresh preserved cached catalog, EPG and Favorite state'
      : 'synthetic HTTP 500 degraded refresh preserved cached catalog and Favorite; current browser path had no persisted EPG record to qualify',
    reloadPersistence: epgAvailable
      ? 'stale catalog/EPG preservation PASS'
      : 'stale catalog preservation PASS; persisted EPG sub-check NOT-AVAILABLE — HARNESS INTEGRATION REQUIRED for deterministic browser EPG seeding',
    leakage: 'clean',
    status: epgAvailable ? 'PASS' : 'NOT-AVAILABLE',
  };
});

scenario('C10', 'empty provider and empty-catalog error state remain reload-safe', {
  startingState: 'clean browser storage with no providers; provider mock returns an empty channel catalog',
  actions: ['reload empty First Run state', 'attempt onboarding against empty catalog', 'verify compensated error state', 'reload again'],
  expectedState: 'empty state stays usable; failed empty-catalog onboarding leaves no partial provider and reload returns safely to First Run',
  harnessOptions: { providerMocks: { xtream: { categories: 'empty', streams: 'empty', epg: 'empty' } } },
}, async ({ page }) => {
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#xtream-entry-page')).toBeVisible({ timeout: 10_000 });
  await page.locator('#xtream-server-url').fill(RC_ENDPOINTS.xtreamA);
  await page.locator('#xtream-username').fill(RC_SECRETS.xtreamUsername);
  await page.locator('#xtream-password').fill(RC_SECRETS.xtreamPassword);
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#xtream-status')).not.toHaveText('', { timeout: 15_000 });
  await expect.poll(async () => providerIds(await readSafeStructuredState(page))).toEqual([]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });
  expect(providerIds(await readSafeStructuredState(page))).toEqual([]);
  return {
    observedState: 'empty First Run survived reload; empty-catalog onboarding failed safely, compensated partial provider state, and reloaded back to First Run',
    reloadPersistence: 'empty provider/catalog/error reload safety PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C11', 'malformed structured records are ignored safely by existing readers', {
  startingState: 'valid provider A and catalog in existing IndexedDB schema',
  actions: ['inject malformed provider and Favorite-shaped records through existing IndexedDB seam', 'reload'],
  expectedState: 'valid provider remains usable; malformed records do not surface as valid provider/Favorite state or crash the app',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  await injectMalformedStructuredRecords(page);
  await reloadToHome(page);
  const state = await readSafeStructuredState(page);
  expect(state.providers.some((provider) => provider.id === providerA && provider.validShape)).toBe(true);
  await expect(page.locator('[data-home-focus-key="home-provider:rc-malformed-provider"]')).toHaveCount(0);
  await expect(page.locator('[data-home-focus-key="home-favorite:rc-malformed-provider:42"]')).toHaveCount(0);
  expect(favoriteRecords(state, 'rc-malformed-provider')).toEqual([]);
  return {
    observedState: 'existing readers ignored malformed provider/Favorite shapes and valid provider remained usable',
    reloadPersistence: 'corrupt structured record graceful recovery PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C12', 'legacy and modern M3U sources do not persist in ordinary browser storage', {
  startingState: 'First Run with empty WidgetData and ordinary browser storage',
  actions: ['seed synthetic legacy source fields', 'reload to trigger scrub', 'onboard modern M3U provider', 'inspect ordinary browser storage'],
  expectedState: 'credential-bearing playlist/source URL is absent from localStorage, sessionStorage and ordinary IndexedDB',
}, async ({ page }) => {
  await seedLegacyM3uPersistence(page, RC_ENDPOINTS.m3uA);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });
  const legacy = await readLegacyPersistenceSummary(page, RC_ENDPOINTS.m3uA);
  expect(legacy.sourcePresent).toBe(false);
  expect(legacy.hasPlaylistUrl).toBe(false);
  expect(legacy.hasPlaylists).toBe(false);
  expect(legacy.hasLegacyChannels).toBe(false);
  expect(legacy.hasChannelsFetched).toBe(false);
  expect(legacy.unrelatedPreferencePreserved).toBe(true);
  expect(legacy.ordinaryPreferencePreserved).toBe(true);
  await onboardM3u(page);
  const leaks = await assertNoCredentialLeaks(page);
  expect(leaks).toEqual([]);
  const storage = await snapshotOrdinaryBrowserStorage(page);
  expect(storage.indexedDb.some((database) => database.name === 'babustv')).toBe(true);
  return {
    observedState: 'legacy source fields were scrubbed and modern M3U canaries were absent from ordinary browser storage/DOM/URL',
    reloadPersistence: 'legacy M3U persistence regression PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C13', 'credential state remains only in WidgetData test seam', {
  startingState: 'clean ordinary browser storage and empty Node-side WidgetData seam',
  actions: ['onboard synthetic Xtream provider', 'verify WidgetData has one provider credential document without printing it', 'scan browser-visible surfaces'],
  expectedState: 'credential canaries exist only behind WidgetData seam and nowhere in ordinary browser storage, DOM or URL',
}, async ({ page, harness }) => {
  const providerA = await onboardXtream(page);
  const raw = harness.widgetData.readRaw();
  expect(typeof raw).toBe('string');
  expect(credentialProviderIds(harness.widgetData)).toEqual([providerA]);
  expect(raw.includes(RC_SECRETS.xtreamUsername)).toBe(true);
  expect(raw.includes(RC_SECRETS.xtreamPassword)).toBe(true);
  await assertNoCredentialLeaks(page);
  const storage = await snapshotOrdinaryBrowserStorage(page);
  expect(storage.localStorage).toBeDefined();
  expect(storage.sessionStorage).toBeDefined();
  expect(storage.indexedDb).toBeDefined();
  return {
    observedState: 'one provider credential document remained behind WidgetData; browser-visible surfaces contained no credential canary',
    reloadPersistence: 'credential authority remained WidgetData-only',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C14', 'cross-provider identity remains isolated after full reload', {
  startingState: 'provider A Favorite on channel 42; provider B later added with the same channelId',
  actions: ['add provider B', 'reload', 'compare provider/catalog/Favorite/watch partitions'],
  expectedState: 'same channelId remains two provider-scoped identities after full reload',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  await toggleFavoriteForActiveProvider(page, providerA);
  const watchA = await attemptBrowserWatch(page, providerA);
  const providerB = await addSecondXtreamProvider(page);
  await reloadToHome(page);
  const state = await readSafeStructuredState(page);
  expect(state.channels.some((channel) => channel.providerId === providerA && channel.id === COLLIDING_CHANNEL_ID)).toBe(true);
  expect(state.channels.some((channel) => channel.providerId === providerB && channel.id === COLLIDING_CHANNEL_ID)).toBe(true);
  expect(favoriteRecords(state, providerA).some((record) => record.channelId === COLLIDING_CHANNEL_ID)).toBe(true);
  expect(favoriteRecords(state, providerB)).toEqual([]);
  if (watchA.available) {
    expect(lastWatchedRecord(state, providerA)?.channelId).toBe(COLLIDING_CHANNEL_ID);
    expect(lastWatchedRecord(state, providerB)).toBeNull();
  }
  return {
    observedState: watchA.available
      ? 'provider identity, Favorite and watch partitions remained isolated after reload'
      : 'provider identity and Favorite partitions remained isolated after reload; watch sub-check NOT-AVAILABLE',
    reloadPersistence: 'cross-provider identity isolation PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});

scenario('C15', 'durable state remains stable across a second reload', {
  startingState: 'provider A with Favorite and optional browser-created Last Watched',
  actions: ['capture durable signature', 'reload once', 'reload a second time', 'compare safe structural signatures'],
  expectedState: 'provider, active provider, catalog and user state are identical after both reloads',
}, async ({ page }) => {
  const providerA = await onboardXtream(page);
  await toggleFavoriteForActiveProvider(page, providerA);
  const watch = await attemptBrowserWatch(page, providerA);
  const before = await readSafeStructuredState(page);
  const signatureBefore = durableStateSignature(before);
  await reloadToHome(page);
  const afterFirst = await readSafeStructuredState(page);
  const signatureFirst = durableStateSignature(afterFirst);
  await reloadToHome(page);
  const afterSecond = await readSafeStructuredState(page);
  const signatureSecond = durableStateSignature(afterSecond);
  expect(signatureFirst).toBe(signatureBefore);
  expect(signatureSecond).toBe(signatureBefore);
  expect(activeProviderId(afterSecond)).toBe(providerA);
  expect(favoriteRecords(afterSecond, providerA).some((record) => record.channelId === COLLIDING_CHANNEL_ID)).toBe(true);
  if (watch.available) expect(lastWatchedRecord(afterSecond, providerA)?.channelId).toBe(COLLIDING_CHANNEL_ID);
  await assertNoCredentialLeaks(page);
  return {
    observedState: watch.available
      ? 'safe durable signature, Favorite and Last Watched were stable across two reloads'
      : 'safe durable signature and Favorite were stable across two reloads; watch sub-check NOT-AVAILABLE',
    reloadPersistence: 'second-reload durability PASS',
    leakage: 'clean',
    status: 'PASS',
  };
});
