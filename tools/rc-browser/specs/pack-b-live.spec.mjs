import { expect, test } from '@playwright/test';
import {
  assertNoUnexplainedConsoleErrors,
  assertViewport,
  findSecretLeaks,
  installBrowserHarness,
  openFreshApp,
  pressRemote,
} from '../lib/harness.mjs';
import { createEvidenceRecord, writeEvidence } from '../lib/evidence.mjs';
import {
  RC_PRODUCTION_SHA,
  RC_SECRET_CANARIES,
} from '../fixtures/common.mjs';
import {
  createPackBLiveFixture,
  PACK_B_CHANNEL_IDS,
  PACK_B_PROVIDER_KEYS,
} from '../fixtures/pack-b-live.mjs';

const HOME_KEY = '[data-home-focus-key]';
const CHANNEL = '.channel-item[data-channel-id]';
const GROUP = '.group-item[data-scope-key]';
const SELECTED_EPG = '[data-feature-section="selected-epg"]';
const FAVORITES = '[data-feature-section="favorites"]';
const SEARCH = '[data-feature-section="search"]';
const SEARCH_RESULT = '.live-tv-search-result[data-result-key]';
const ACTION = '.live-tv-action[data-action-id]';
const PROGRAM_INFO = '[data-feature-section="program-info"]';

const SCENARIO_TIMEOUT = 90_000;
test.setTimeout(SCENARIO_TIMEOUT);

async function activeHomeKey(page) {
  return page.evaluate(() => document.activeElement?.getAttribute('data-home-focus-key') ?? null);
}

async function focusedProviderActionId(page) {
  return page.evaluate(() => document.activeElement?.id ?? null);
}

async function playbackStatus(page) {
  return page.locator('#live-tv-status').getAttribute('data-playback-status');
}

async function highlightedChannelId(page) {
  return page.locator(`${CHANNEL}[data-presentation-state="focused"], ${CHANNEL}.focused`).first().getAttribute('data-channel-id');
}

async function focusedScopeKey(page) {
  return page.locator(`${GROUP}[data-presentation-state="focused"], ${GROUP}.focused`).first().getAttribute('data-scope-key');
}

async function navigateHomeTo(page, targetKey) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await activeHomeKey(page);
    if (current === targetKey) return;

    if (targetKey.startsWith('home-provider:')) {
      if (current?.startsWith('home-provider:')) {
        const keys = await page.locator('[data-home-focus-key^="home-provider:"]').evaluateAll((nodes) => (
          nodes.map((node) => node.getAttribute('data-home-focus-key'))
        ));
        const currentIndex = keys.indexOf(current);
        const targetIndex = keys.indexOf(targetKey);
        await pressRemote(page, targetIndex < currentIndex ? 'LEFT' : 'RIGHT');
      } else {
        await pressRemote(page, 'UP');
      }
      continue;
    }

    if (targetKey === 'home-live-tv') {
      if (current === 'home-settings' || current?.startsWith('home-favorite:') || current?.startsWith('home-frequent:')) {
        await pressRemote(page, 'UP');
      } else {
        await pressRemote(page, 'DOWN');
      }
      continue;
    }

    if (targetKey === 'home-settings') {
      await pressRemote(page, 'DOWN');
      continue;
    }

    throw new Error(`Unsupported Home focus target: ${targetKey}`);
  }
  throw new Error(`Home focus did not reach ${targetKey}; current=${await activeHomeKey(page)}`);
}

async function providerIdForHost(page, host) {
  const buttons = page.locator('[data-home-focus-key^="home-provider:"]');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const item = buttons.nth(index);
    if ((await item.textContent())?.includes(host)) {
      const key = await item.getAttribute('data-home-focus-key');
      return key?.slice('home-provider:'.length) ?? null;
    }
  }
  return null;
}

async function connectXtreamFromChooser(page, fixture, key) {
  await expect(page.locator('#first-run-page')).toBeVisible();
  await expect(page.locator('#first-run-xtream')).toBeFocused();
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#xtream-entry-page')).toBeVisible();

  const credentials = fixture.credentials();
  await page.locator('#xtream-server-url').fill(fixture.endpoint(key));
  await page.locator('#xtream-username').fill(credentials.username);
  await page.locator('#xtream-password').fill(credentials.password);

  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await expect(page.locator('#xtream-connect')).toBeFocused();
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 15_000 });
}

async function addProvider(page, fixture, key) {
  await navigateHomeTo(page, 'home-settings');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#provider-management-page')).toBeVisible();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await focusedProviderActionId(page) === 'add-provider') break;
    await pressRemote(page, 'DOWN');
  }
  expect(await focusedProviderActionId(page)).toBe('add-provider');
  await pressRemote(page, 'SELECT');
  await connectXtreamFromChooser(page, fixture, key);
}

async function boot(page, context, providerKeys = [PACK_B_PROVIDER_KEYS.A]) {
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
  const fixture = createPackBLiveFixture();
  await fixture.install(context);
  await openFreshApp(page);
  await assertViewport(page, { width: 1920, height: 1080 });
  await connectXtreamFromChooser(page, fixture, providerKeys[0]);
  for (const key of providerKeys.slice(1)) await addProvider(page, fixture, key);
  return { harness, fixture };
}

async function selectHomeProvider(page, providerId) {
  const target = `home-provider:${providerId}`;
  await navigateHomeTo(page, target);
  await pressRemote(page, 'SELECT');
  await expect(page.locator(`${HOME_KEY}[data-home-focus-key="${target}"]`)).toHaveAttribute('aria-pressed', 'true');
}

async function openLiveTv(page) {
  await navigateHomeTo(page, 'home-live-tv');
  await pressRemote(page, 'SELECT');
  await expect(page.locator(CHANNEL).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(FAVORITES)).toBeVisible({ timeout: 10_000 });
}

async function returnHome(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await page.locator('#home-page').count()) return;
    await pressRemote(page, 'BACK');
  }
  await expect(page.locator('#home-page')).toBeVisible();
}

async function openChannelActions(page) {
  await expect(page.locator(FAVORITES)).toBeVisible();
  await pressRemote(page, 'RIGHT');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('[data-feature-section="actions"]')).toBeVisible();
}

async function toggleFavorite(page) {
  await openChannelActions(page);
  await expect(page.locator(`${ACTION}[data-action-id="WATCH"]`)).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'DOWN');
  await expect(page.locator(`${ACTION}[data-action-id="FAVORITE"]`)).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'SELECT');
  await pressRemote(page, 'BACK');
}

async function enterFavoritesScope(page) {
  const key = await page.locator(FAVORITES).getAttribute('data-category-key');
  expect(key).toBeTruthy();
  await pressRemote(page, 'LEFT');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await focusedScopeKey(page) === key) return key;
    await pressRemote(page, 'DOWN');
  }
  throw new Error(`Favorites scope ${key} was not reachable from category navigation.`);
}

async function assertNoPlayback(page) {
  expect(await playbackStatus(page)).toBe('IDLE');
  await expect(page.locator('#channel-name')).not.toHaveText(/Ortak Kanal|İstanbul|Ihlamur|Şeker|Spor Bir/);
}

async function assertTelemetryClean(page, harness) {
  expect(harness.events.pageErrors).toEqual([]);
  await assertNoUnexplainedConsoleErrors(harness.events);
  expect(harness.events.leakage).toEqual([]);
  expect(await findSecretLeaks(page, RC_SECRET_CANARIES)).toEqual([]);
}

async function runScenario({
  id,
  page,
  harness,
  startingState,
  actions,
  expectedState,
  reloadPersistence = 'not-applicable',
  body,
}) {
  let observedState = 'scenario completed';
  let thrown = null;
  try {
    const observed = await body();
    if (observed !== undefined) observedState = observed;
    await assertTelemetryClean(page, harness);
  } catch (error) {
    thrown = error;
    observedState = `RED: ${error instanceof Error ? error.message : String(error)}`;
  }

  const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES).catch(() => ['leak-probe-failed']);
  const evidence = createEvidenceRecord({
    scenarioId: id,
    productionSha: RC_PRODUCTION_SHA,
    startingState,
    actions,
    expectedState,
    observedState,
    console: harness.events.console,
    pageErrors: harness.events.pageErrors,
    requestFailures: harness.events.requestFailures,
    reloadPersistence,
    leakage: leaks.length === 0 && harness.events.leakage.length === 0 ? 'clean' : 'RED',
    artifacts: [],
    status: thrown === null ? 'PASS' : 'RED',
  });
  await writeEvidence(evidence);
  if (thrown !== null) throw thrown;
}

test('B01 Home default focus uses Live TV fallback and valid Last Watched', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await runScenario({
    id: 'B01',
    page,
    harness,
    startingState: 'Provider A onboarded with no watch history',
    actions: ['verify Home fallback focus', 'play first channel long enough to become meaningful', 'switch channel', 'return Home'],
    expectedState: 'Home focuses home-live-tv without history and a provider-scoped Last Watched card when valid history exists',
    body: async () => {
      expect(await activeHomeKey(page)).toBe('home-live-tv');
      await openLiveTv(page);
      const firstId = await highlightedChannelId(page);
      expect(firstId).toBe(PACK_B_CHANNEL_IDS.shared);
      await pressRemote(page, 'SELECT');
      await expect(page.locator('#live-tv-status')).toHaveAttribute('data-playback-status', 'PLAYING', { timeout: 15_000 });
      await page.waitForTimeout(31_000);
      await pressRemote(page, 'DOWN');
      await pressRemote(page, 'DOWN');
      const secondId = await highlightedChannelId(page);
      expect(secondId).not.toBe(firstId);
      await pressRemote(page, 'SELECT');
      await expect(page.locator('#live-tv-status')).toHaveAttribute('data-playback-status', 'PLAYING', { timeout: 15_000 });
      await returnHome(page);
      const key = await activeHomeKey(page);
      expect(key).toMatch(new RegExp(`^home-last-watched:[^:]+:${firstId}$`));
      return `fallback=home-live-tv; valid-history-focus=${key}`;
    },
  });
});

test('B02 Live TV entry presents provider partition, categories, channels and stable highlight', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await runScenario({
    id: 'B02',
    page,
    harness,
    startingState: 'Provider A catalog cached and active',
    actions: ['open Live TV from Home'],
    expectedState: 'Provider A categories/channels render and first highlighted channel remains stable without playback',
    body: async () => {
      await openLiveTv(page);
      await expect(page.locator(`${GROUP}[data-scope-key="all"]`)).toHaveClass(/active/);
      await expect(page.locator(`${GROUP}[data-scope-key="category:news"]`)).toContainText('Haber');
      await expect(page.locator(`${CHANNEL}[data-channel-id="${PACK_B_CHANNEL_IDS.shared}"]`)).toContainText('Ortak Kanal A');
      expect(await highlightedChannelId(page)).toBe(PACK_B_CHANNEL_IDS.shared);
      await page.waitForTimeout(250);
      expect(await highlightedChannelId(page)).toBe(PACK_B_CHANNEL_IDS.shared);
      await assertNoPlayback(page);
      return 'Provider A/all scope visible; shared channel stably focused; playback IDLE';
    },
  });
});

test('B03 category/scope movement changes scope but never starts playback', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await runScenario({
    id: 'B03',
    page,
    harness,
    startingState: 'Provider A Live TV open on all scope',
    actions: ['move from channel zone to category zone', 'move through Favorites to Haber category'],
    expectedState: 'scope and visible channels change while playback remains IDLE',
    body: async () => {
      await openLiveTv(page);
      await pressRemote(page, 'LEFT');
      expect(await focusedScopeKey(page)).toBe('all');
      await pressRemote(page, 'DOWN');
      const favoriteKey = await page.locator(FAVORITES).getAttribute('data-category-key');
      expect(await focusedScopeKey(page)).toBe(favoriteKey);
      await pressRemote(page, 'DOWN');
      expect(await focusedScopeKey(page)).toBe('category:news');
      await expect(page.locator(CHANNEL)).toHaveCount(1);
      await expect(page.locator(CHANNEL).first()).toContainText('Ortak Kanal A');
      await assertNoPlayback(page);
      return `scope=category:news; channel-count=1; playback=${await playbackStatus(page)}`;
    },
  });
});

test('B04 Favorite add/remove keeps Favorites virtual scope usable including empty state and reload', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await runScenario({
    id: 'B04',
    page,
    harness,
    startingState: 'Provider A with empty Favorites',
    actions: ['toggle highlighted channel favorite', 'open Favorites scope', 'reload', 'verify persistence', 'remove favorite', 'verify empty Favorites safety'],
    expectedState: 'favorite persists across reload, virtual scope is usable, removal returns safe empty state',
    reloadPersistence: 'favorite add must survive page reload in provider-scoped structured storage',
    body: async () => {
      await openLiveTv(page);
      await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'empty');
      await toggleFavorite(page);
      await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'ready');
      await enterFavoritesScope(page);
      await expect(page.locator(CHANNEL)).toHaveCount(1);
      await expect(page.locator(CHANNEL).first()).toHaveAttribute('data-channel-id', PACK_B_CHANNEL_IDS.shared);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('#home-page')).toBeVisible({ timeout: 15_000 });
      await openLiveTv(page);
      await enterFavoritesScope(page);
      await expect(page.locator(CHANNEL)).toHaveCount(1);
      await pressRemote(page, 'RIGHT');
      await toggleFavorite(page);
      await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'empty');
      await enterFavoritesScope(page);
      await expect(page.locator(CHANNEL)).toHaveCount(0);
      await assertNoPlayback(page);
      return 'favorite persisted across reload then removed; empty Favorites has zero channels without exception';
    },
  });
});

test('B05 same channelId favorites stay isolated by provider', async ({ context, page }) => {
  const { harness } = await boot(page, context, [PACK_B_PROVIDER_KEYS.A, PACK_B_PROVIDER_KEYS.B]);
  const providerA = await providerIdForHost(page, 'provider-a.invalid');
  const providerB = await providerIdForHost(page, 'provider-b.invalid');
  expect(providerA).toBeTruthy();
  expect(providerB).toBeTruthy();

  await runScenario({
    id: 'B05',
    page,
    harness,
    startingState: 'Provider A and B both expose channelId 500; B is active after onboarding',
    actions: ['switch to A', 'favorite shared channel', 'switch to B', 'inspect same channelId', 'switch back to A'],
    expectedState: 'favorite membership is scoped by providerId and never bleeds across identical channelId values',
    body: async () => {
      await selectHomeProvider(page, providerA);
      await openLiveTv(page);
      await expect(page.locator(`${CHANNEL}[data-channel-id="${PACK_B_CHANNEL_IDS.shared}"]`)).toContainText('Ortak Kanal A');
      await toggleFavorite(page);
      await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'ready');
      await returnHome(page);

      await selectHomeProvider(page, providerB);
      await openLiveTv(page);
      await expect(page.locator(`${CHANNEL}[data-channel-id="${PACK_B_CHANNEL_IDS.shared}"]`)).toContainText('Ortak Kanal B');
      await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'empty');
      await returnHome(page);

      await selectHomeProvider(page, providerA);
      await openLiveTv(page);
      await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'ready');
      await expect(page.locator(FAVORITES)).toContainText('Ortak Kanal A');
      return `providerA=${providerA}; providerB=${providerB}; same channelId isolated`;
    },
  });
});

test('B06 Turkish Search is browser-reachable with deterministic Turkish matching and provider isolation', async ({ context, page }) => {
  const { harness } = await boot(page, context, [PACK_B_PROVIDER_KEYS.A, PACK_B_PROVIDER_KEYS.B]);
  const providerA = await providerIdForHost(page, 'provider-a.invalid');
  expect(providerA).toBeTruthy();

  await runScenario({
    id: 'B06',
    page,
    harness,
    startingState: 'Provider A has deterministic channels covering İ/I/ı/i/Ş/Ğ/Ü/Ö/Ç and Provider B has colliding search names',
    actions: ['switch to Provider A', 'open Live TV', 'locate user-facing Search entry', 'query Turkish variants', 'inspect ordered provider-scoped result keys'],
    expectedState: 'Search can be opened from production UI and Turkish locale matching is deterministic and provider-scoped',
    body: async () => {
      await selectHomeProvider(page, providerA);
      await openLiveTv(page);
      const searchEntry = page.locator('button, [role="button"], [data-action-id]').filter({ hasText: /Ara|Search/i });
      await expect(searchEntry.first(), 'production Live TV must expose a browser-reachable Search entry').toBeVisible();
      await searchEntry.first().click();
      await expect(page.locator(SEARCH)).toBeVisible();

      const expected = [
        ['İ', 'İstanbul'], ['i', 'İstanbul'], ['I', 'Ihlamur'], ['ı', 'Ihlamur'],
        ['Ş', 'Şeker'], ['ş', 'Şeker'], ['Ğ', 'Ğölge'], ['ğ', 'Ğölge'],
        ['Ü', 'Üsküdar'], ['ü', 'Üsküdar'], ['Ö', 'Öykü'], ['ö', 'Öykü'], ['Ç', 'Çınar'], ['ç', 'Çınar'],
      ];
      for (const [query, name] of expected) {
        const input = page.locator('.live-tv-search-input');
        await input.fill(query);
        await input.dispatchEvent('input');
        await expect(page.locator(SEARCH_RESULT).first()).toContainText(name);
        const keys = await page.locator(SEARCH_RESULT).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-result-key')));
        expect(keys.every((key) => key?.startsWith(`${providerA}:`))).toBe(true);
      }
      return 'Turkish variants matched deterministically and every result key stayed in Provider A partition';
    },
  });
});

test('B07 Search highlight does not play; activation follows explicit-play behavior', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await runScenario({
    id: 'B07',
    page,
    harness,
    startingState: 'Provider A Live TV open with playback IDLE',
    actions: ['open Search from user-facing production entry', 'move highlight to a result', 'verify no playback', 'activate result', 'verify channel focus without implicit playback'],
    expectedState: 'Search navigation never starts playback; result activation follows production explicit-play semantics',
    body: async () => {
      await openLiveTv(page);
      const searchEntry = page.locator('button, [role="button"], [data-action-id]').filter({ hasText: /Ara|Search/i });
      await expect(searchEntry.first(), 'production Live TV must expose a browser-reachable Search entry').toBeVisible();
      await searchEntry.first().click();
      await expect(page.locator(SEARCH)).toBeVisible();
      const input = page.locator('.live-tv-search-input');
      await input.fill('şeker');
      await input.dispatchEvent('input');
      await pressRemote(page, 'DOWN');
      await expect(page.locator(`${SEARCH_RESULT}[data-presentation-state="focused"]`)).toContainText('Şeker');
      await assertNoPlayback(page);
      await pressRemote(page, 'SELECT');
      await expect(page.locator(`${CHANNEL}[data-channel-id="${PACK_B_CHANNEL_IDS.sCedilla}"]`)).toHaveClass(/focused/);
      await assertNoPlayback(page);
      return 'result highlight and activation changed focus only; playback remained IDLE';
    },
  });
});

test('B08 EPG current/next and Program Info present path', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await runScenario({
    id: 'B08',
    page,
    harness,
    startingState: 'Provider A exposes current and next synthetic EPG for selected channel',
    actions: ['open Live TV', 'inspect selected EPG', 'open channel actions', 'activate Program Info'],
    expectedState: 'current and next EPG are visible and Program Info opens for selected channel',
    body: async () => {
      await openLiveTv(page);
      await expect(page.locator(SELECTED_EPG)).toContainText(`Şimdi: Şimdi ${PACK_B_CHANNEL_IDS.shared}`);
      await expect(page.locator(SELECTED_EPG)).toContainText(`Sonraki: Sonraki ${PACK_B_CHANNEL_IDS.shared}`);
      await openChannelActions(page);
      await expect(page.locator(`${ACTION}[data-action-id="PROGRAM_INFO"]`)).toBeVisible();
      await pressRemote(page, 'DOWN');
      await pressRemote(page, 'DOWN');
      await expect(page.locator(`${ACTION}[data-action-id="PROGRAM_INFO"]`)).toHaveAttribute('data-presentation-state', 'focused');
      await pressRemote(page, 'SELECT');
      await expect(page.locator(PROGRAM_INFO)).toContainText(`Şimdi ${PACK_B_CHANNEL_IDS.shared}`);
      await assertNoPlayback(page);
      return 'selected EPG current+next visible; Program Info opened; playback IDLE';
    },
  });
});

test('B09 missing/broken EPG never makes Live TV unusable', async ({ context, page }) => {
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
  const fixture = createPackBLiveFixture();
  fixture.setEpgMode(PACK_B_PROVIDER_KEYS.A, 'empty');
  await fixture.install(context);
  await openFreshApp(page);
  await connectXtreamFromChooser(page, fixture, PACK_B_PROVIDER_KEYS.A);

  await runScenario({
    id: 'B09',
    page,
    harness,
    startingState: 'Provider A has valid catalog and empty EPG, then malformed/HTTP-failing EPG refreshes',
    actions: ['open Live TV with empty EPG', 'verify channel navigation', 'exercise malformed/500 EPG on later entries'],
    expectedState: 'Live TV remains usable, no uncontrolled exception, safe EPG presentation under missing/broken EPG',
    body: async () => {
      await openLiveTv(page);
      await expect(page.locator(CHANNEL).first()).toBeVisible();
      await pressRemote(page, 'DOWN');
      await assertNoPlayback(page);
      await returnHome(page);

      fixture.setEpgMode(PACK_B_PROVIDER_KEYS.A, 'malformed');
      await openLiveTv(page);
      await expect(page.locator(CHANNEL).first()).toBeVisible();
      await returnHome(page);

      fixture.setEpgMode(PACK_B_PROVIDER_KEYS.A, 'http-500');
      await openLiveTv(page);
      await expect(page.locator(CHANNEL).first()).toBeVisible();
      await pressRemote(page, 'DOWN');
      await expect(page.locator(CHANNEL).first()).toBeVisible();
      return `Live TV remained navigable; request-failures=${harness.events.requestFailures.length}`;
    },
  });
});

test('B10 channel action layer Play/Favorite/Program Info and Back restore top-layer focus', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await runScenario({
    id: 'B10',
    page,
    harness,
    startingState: 'Provider A Live TV with feature data loaded and shared channel focused',
    actions: ['open channel actions', 'inspect Play/Favorite/Program Info', 'open Program Info', 'Back', 'Back'],
    expectedState: 'Back closes one top layer at a time and restores valid action/channel focus without playback',
    body: async () => {
      await openLiveTv(page);
      const channelId = await highlightedChannelId(page);
      await openChannelActions(page);
      await expect(page.locator(`${ACTION}[data-action-id="WATCH"]`)).toBeVisible();
      await expect(page.locator(`${ACTION}[data-action-id="FAVORITE"]`)).toBeVisible();
      await expect(page.locator(`${ACTION}[data-action-id="PROGRAM_INFO"]`)).toBeVisible();
      await pressRemote(page, 'DOWN');
      await pressRemote(page, 'DOWN');
      await pressRemote(page, 'SELECT');
      await expect(page.locator(PROGRAM_INFO)).toBeVisible();
      await pressRemote(page, 'BACK');
      await expect(page.locator(PROGRAM_INFO)).toHaveCount(0);
      await expect(page.locator('[data-feature-section="actions"]')).toBeVisible();
      await expect(page.locator(`${ACTION}[data-action-id="PROGRAM_INFO"]`)).toHaveAttribute('data-presentation-state', 'focused');
      await pressRemote(page, 'BACK');
      await expect(page.locator('[data-feature-section="actions"]')).toHaveCount(0);
      expect(await highlightedChannelId(page)).toBe(channelId);
      await assertNoPlayback(page);
      return `Back restored action then channel identity=${channelId}; playback IDLE`;
    },
  });
});

test('B11 catalog refresh preserves stable identity across delete/reorder/empty/single/provider collision', async ({ context, page }) => {
  const { harness, fixture } = await boot(page, context, [PACK_B_PROVIDER_KEYS.A, PACK_B_PROVIDER_KEYS.B]);
  const providerA = await providerIdForHost(page, 'provider-a.invalid');
  const providerB = await providerIdForHost(page, 'provider-b.invalid');
  expect(providerA).toBeTruthy();
  expect(providerB).toBeTruthy();
  await selectHomeProvider(page, providerA);

  await runScenario({
    id: 'B11',
    page,
    harness,
    startingState: 'Provider A cached catalog with provider B sharing channelId 500',
    actions: ['delay refresh', 'focus item', 'delete focused item', 'reorder', 'empty', 'single item', 'switch provider with colliding channelId'],
    expectedState: 'focus falls back deterministically by stable identity and never restores identity from another provider partition',
    body: async () => {
      const original = fixture.catalog(PACK_B_PROVIDER_KEYS.A).channels;
      let release = fixture.pauseStreams(PACK_B_PROVIDER_KEYS.A);
      await openLiveTv(page);
      await pressRemote(page, 'DOWN');
      const focusedBeforeDelete = await highlightedChannelId(page);
      expect(focusedBeforeDelete).toBe(PACK_B_CHANNEL_IDS.istanbul);
      fixture.setChannels(PACK_B_PROVIDER_KEYS.A, original.filter((row) => String(row.stream_id) !== focusedBeforeDelete));
      release();
      await expect(page.locator(`${CHANNEL}[data-channel-id="${focusedBeforeDelete}"]`)).toHaveCount(0, { timeout: 10_000 });
      expect(await highlightedChannelId(page)).not.toBe(focusedBeforeDelete);
      await assertNoPlayback(page);

      await returnHome(page);
      const afterDelete = fixture.catalog(PACK_B_PROVIDER_KEYS.A).channels;
      const reordered = [afterDelete.at(-1), ...afterDelete.slice(0, -1)].filter(Boolean);
      release = fixture.pauseStreams(PACK_B_PROVIDER_KEYS.A);
      await openLiveTv(page);
      const stableId = await highlightedChannelId(page);
      fixture.setChannels(PACK_B_PROVIDER_KEYS.A, reordered);
      release();
      await expect(page.locator(`${CHANNEL}[data-channel-id="${stableId}"]`)).toHaveClass(/highlighted|focused/, { timeout: 10_000 });
      expect(await highlightedChannelId(page)).toBe(stableId);

      await returnHome(page);
      const single = [{ ...original[0], stream_id: PACK_B_CHANNEL_IDS.shared, name: 'Ortak Kanal A Tek' }];
      release = fixture.pauseStreams(PACK_B_PROVIDER_KEYS.A);
      await openLiveTv(page);
      fixture.setChannels(PACK_B_PROVIDER_KEYS.A, single);
      release();
      await expect(page.locator(CHANNEL)).toHaveCount(1, { timeout: 10_000 });
      expect(await highlightedChannelId(page)).toBe(PACK_B_CHANNEL_IDS.shared);
      await returnHome(page);

      await selectHomeProvider(page, providerB);
      await openLiveTv(page);
      await expect(page.locator(`${CHANNEL}[data-channel-id="${PACK_B_CHANNEL_IDS.shared}"]`)).toContainText('Ortak Kanal B');
      expect(await highlightedChannelId(page)).toBe(PACK_B_CHANNEL_IDS.shared);
      await assertNoPlayback(page);
      await returnHome(page);

      await selectHomeProvider(page, providerA);
      release = fixture.pauseStreams(PACK_B_PROVIDER_KEYS.A);
      await openLiveTv(page);
      fixture.setChannels(PACK_B_PROVIDER_KEYS.A, []);
      release();
      await expect(page.locator(CHANNEL)).toHaveCount(0, { timeout: 10_000 });
      await assertNoPlayback(page);
      return `deleted=${focusedBeforeDelete}; reordered-stable=${stableId}; single=${PACK_B_CHANNEL_IDS.shared}; providerB collision rendered B identity; empty-safe`;
    },
  });
});
