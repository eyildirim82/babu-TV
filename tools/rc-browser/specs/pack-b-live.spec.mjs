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
import { RC_PRODUCTION_SHA, RC_SECRET_CANARIES } from '../fixtures/common.mjs';
import {
  createPackBLiveFixture,
  PACK_B_CHANNEL_IDS,
  PACK_B_PROVIDER_KEYS,
} from '../fixtures/pack-b-live.mjs';

const CHANNEL = '.channel-item[data-channel-id]';
const GROUP = '.group-item[data-scope-key]';
const FAVORITES = '[data-feature-section="favorites"]';
const SELECTED_EPG = '[data-feature-section="selected-epg"]';
const ACTIONS = '[data-feature-section="actions"]';
const ACTION = '.live-tv-action[data-action-id]';
const SEARCH = '[data-feature-section="search"]';
const SEARCH_RESULT = '.live-tv-search-result[data-result-key]';
const PROGRAM_INFO = '[data-feature-section="program-info"]';

test.setTimeout(90_000);

async function activeHomeKey(page) {
  return page.evaluate(() => document.activeElement?.getAttribute('data-home-focus-key') ?? null);
}

async function homeProviderIds(page) {
  return page.locator('[data-home-focus-key^="home-provider:"]').evaluateAll((nodes) => nodes.map((node) => (
    node.getAttribute('data-home-focus-key')?.slice('home-provider:'.length) ?? null
  )).filter(Boolean));
}

async function focusedScope(page) {
  const locator = page.locator(`${GROUP}.focused, ${GROUP}[data-presentation-state="focused"]`).first();
  return await locator.count() === 0 ? null : locator.getAttribute('data-scope-key');
}

async function highlightedChannel(page) {
  const locator = page.locator(
    `${CHANNEL}.focused, ${CHANNEL}.highlighted, ${CHANNEL}[data-presentation-state="focused"], ${CHANNEL}[data-presentation-state="highlighted"]`,
  ).first();
  return await locator.count() === 0 ? null : locator.getAttribute('data-channel-id');
}

async function playbackStatus(page) {
  return page.locator('#live-tv-status').getAttribute('data-playback-status');
}

async function goHomeKey(page, target) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const current = await activeHomeKey(page);
    if (current === target) return;

    if (target.startsWith('home-provider:')) {
      if (current?.startsWith('home-provider:')) {
        const keys = await page.locator('[data-home-focus-key^="home-provider:"]').evaluateAll((nodes) => (
          nodes.map((node) => node.getAttribute('data-home-focus-key'))
        ));
        const from = keys.indexOf(current);
        const to = keys.indexOf(target);
        await pressRemote(page, to < from ? 'LEFT' : 'RIGHT');
      } else {
        await pressRemote(page, 'UP');
      }
      continue;
    }

    if (target === 'home-live-tv') {
      await pressRemote(page, current === 'home-settings' || current?.startsWith('home-favorite:') || current?.startsWith('home-frequent:') ? 'UP' : 'DOWN');
      continue;
    }

    if (target === 'home-settings') {
      await pressRemote(page, 'DOWN');
      continue;
    }

    throw new Error(`Unsupported Home target ${target}`);
  }
  throw new Error(`Home focus did not reach ${target}; current=${await activeHomeKey(page)}`);
}

async function connectXtream(page, fixture, key) {
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
  await goHomeKey(page, 'home-settings');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#provider-management-page')).toBeVisible();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const id = await page.evaluate(() => document.activeElement?.id ?? null);
    if (id === 'add-provider') break;
    await pressRemote(page, 'DOWN');
  }
  await expect(page.locator('#add-provider')).toBeFocused();
  await pressRemote(page, 'SELECT');
  await connectXtream(page, fixture, key);
}

async function boot(page, context, keys = [PACK_B_PROVIDER_KEYS.A]) {
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
  const fixture = createPackBLiveFixture();
  await fixture.install(context);
  await openFreshApp(page);
  await assertViewport(page, { width: 1920, height: 1080 });
  await connectXtream(page, fixture, keys[0]);
  for (const key of keys.slice(1)) await addProvider(page, fixture, key);
  return { harness, fixture };
}

async function selectProvider(page, providerId) {
  const key = `home-provider:${providerId}`;
  await goHomeKey(page, key);
  await pressRemote(page, 'SELECT');
  await expect(page.locator(`[data-home-focus-key="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
}

async function openLiveTv(page) {
  await goHomeKey(page, 'home-live-tv');
  await pressRemote(page, 'SELECT');
  await expect(page.locator(CHANNEL).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(FAVORITES)).toBeVisible({ timeout: 10_000 });
}

async function backToHome(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await page.locator('#home-page').count()) return;
    await pressRemote(page, 'BACK');
  }
  await expect(page.locator('#home-page')).toBeVisible();
}

async function openActions(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await page.locator(ACTIONS).count()) return;
    await pressRemote(page, 'RIGHT');
    await pressRemote(page, 'SELECT');
  }
  await expect(page.locator(ACTIONS)).toBeVisible();
}

async function favoriteHighlighted(page) {
  await openActions(page);
  await expect(page.locator(`${ACTION}[data-action-id="WATCH"]`)).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'DOWN');
  await expect(page.locator(`${ACTION}[data-action-id="FAVORITE"]`)).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'SELECT');
  await pressRemote(page, 'BACK');
}

async function enterFavorites(page) {
  const key = await page.locator(FAVORITES).getAttribute('data-category-key');
  expect(key).toBeTruthy();
  for (let attempt = 0; attempt < 3 && await focusedScope(page) === null; attempt += 1) {
    await pressRemote(page, 'LEFT');
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await focusedScope(page) === key) return;
    await pressRemote(page, 'DOWN');
  }
  throw new Error(`Favorites scope ${key} not reachable`);
}

async function assertNoPlayback(page) {
  expect(await playbackStatus(page)).toBe('IDLE');
  await expect(page.locator('#channel-name')).not.toHaveText(/Ortak Kanal|İstanbul|Ihlamur|Şeker|Spor Bir/);
}

async function cleanTelemetry(page, harness) {
  expect(harness.events.pageErrors).toEqual([]);
  await assertNoUnexplainedConsoleErrors(harness.events);
  expect(harness.events.leakage).toEqual([]);
  expect(await findSecretLeaks(page, RC_SECRET_CANARIES)).toEqual([]);
}

async function scenario({ id, page, harness, starting, actions, expected, reload = 'not-applicable', run }) {
  let observed = 'scenario completed';
  let failure = null;
  try {
    observed = await run() ?? observed;
    await cleanTelemetry(page, harness);
  } catch (error) {
    failure = error;
    observed = `RED: ${error instanceof Error ? error.message : String(error)}`;
  }
  const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES).catch(() => ['leak-probe-failed']);
  await writeEvidence(createEvidenceRecord({
    scenarioId: id,
    productionSha: RC_PRODUCTION_SHA,
    startingState: starting,
    actions,
    expectedState: expected,
    observedState: observed,
    console: harness.events.console,
    pageErrors: harness.events.pageErrors,
    requestFailures: harness.events.requestFailures,
    reloadPersistence: reload,
    leakage: leaks.length === 0 && harness.events.leakage.length === 0 ? 'clean' : 'RED',
    artifacts: [],
    status: failure === null ? 'PASS' : 'RED',
  }));
  if (failure !== null) throw failure;
}

async function expectSearchEntry(page) {
  const entry = page.locator('button, [role="button"], [data-action-id]').filter({ hasText: /Ara|Search/i }).first();
  await expect(entry, 'production Live TV must expose a browser-reachable Search entry').toBeVisible();
  await entry.click();
  await expect(page.locator(SEARCH)).toBeVisible();
}

test('B01 Home default focus', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await scenario({ id: 'B01', page, harness,
    starting: 'Provider A, no watch history',
    actions: ['verify fallback', 'play first channel for meaningful duration', 'play second channel', 'return Home'],
    expected: 'home-live-tv fallback; valid provider-scoped Last Watched focus',
    run: async () => {
      expect(await activeHomeKey(page)).toBe('home-live-tv');
      await openLiveTv(page);
      const first = await highlightedChannel(page);
      expect(first).toBe(PACK_B_CHANNEL_IDS.shared);
      await pressRemote(page, 'SELECT');
      await expect(page.locator('#live-tv-status')).toHaveAttribute('data-playback-status', 'PLAYING', { timeout: 15_000 });
      await page.waitForTimeout(31_000);
      await pressRemote(page, 'DOWN');
      await pressRemote(page, 'DOWN');
      await pressRemote(page, 'SELECT');
      await expect(page.locator('#live-tv-status')).toHaveAttribute('data-playback-status', 'PLAYING', { timeout: 15_000 });
      await backToHome(page);
      const key = await activeHomeKey(page);
      expect(key).toMatch(new RegExp(`^home-last-watched:[^:]+:${first}$`));
      return `fallback=home-live-tv; last-watched=${key}`;
    } });
});

test('B02 Live TV provider partition and stable highlight', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await scenario({ id: 'B02', page, harness, starting: 'Provider A cached and active', actions: ['open Live TV'], expected: 'categories/channels render with stable highlight and no playback', run: async () => {
    await openLiveTv(page);
    await expect(page.locator(`${GROUP}[data-scope-key="all"]`)).toHaveClass(/active/);
    await expect(page.locator(`${GROUP}[data-scope-key="category:news"]`)).toContainText('Haber');
    await expect(page.locator(`${CHANNEL}[data-channel-id="${PACK_B_CHANNEL_IDS.shared}"]`)).toContainText('Ortak Kanal A');
    expect(await highlightedChannel(page)).toBe(PACK_B_CHANNEL_IDS.shared);
    await page.waitForTimeout(250);
    expect(await highlightedChannel(page)).toBe(PACK_B_CHANNEL_IDS.shared);
    await assertNoPlayback(page);
    return 'Provider A/all visible; stable shared highlight; playback IDLE';
  } });
});

test('B03 category/scope movement does not play', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await scenario({ id: 'B03', page, harness, starting: 'Provider A Live TV/all', actions: ['LEFT to category', 'DOWN through Favorites to Haber'], expected: 'scope changes without playback', run: async () => {
    await openLiveTv(page);
    await pressRemote(page, 'LEFT');
    expect(await focusedScope(page)).toBe('all');
    await pressRemote(page, 'DOWN');
    await pressRemote(page, 'DOWN');
    expect(await focusedScope(page)).toBe('category:news');
    await expect(page.locator(CHANNEL)).toHaveCount(1);
    await assertNoPlayback(page);
    return 'category:news; one channel; playback IDLE';
  } });
});

test('B04 Favorite add/remove, virtual scope, empty safety, reload', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await scenario({ id: 'B04', page, harness, starting: 'Provider A with empty Favorites', actions: ['favorite', 'open Favorites', 'reload', 'verify', 'unfavorite', 'verify empty'], expected: 'provider-scoped favorite persists; empty Favorites safe', reload: 'favorite survives page reload', run: async () => {
    await openLiveTv(page);
    await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'empty');
    await favoriteHighlighted(page);
    await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'ready');
    await enterFavorites(page);
    await expect(page.locator(CHANNEL)).toHaveCount(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#home-page')).toBeVisible({ timeout: 15_000 });
    await openLiveTv(page);
    await enterFavorites(page);
    await expect(page.locator(CHANNEL)).toHaveCount(1);
    await pressRemote(page, 'RIGHT');
    await favoriteHighlighted(page);
    await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'empty');
    await enterFavorites(page);
    await expect(page.locator(CHANNEL)).toHaveCount(0);
    await assertNoPlayback(page);
    return 'add persisted across reload; remove produced safe empty scope';
  } });
});

test('B05 same channelId favorite state is provider-isolated', async ({ context, page }) => {
  const { harness } = await boot(page, context, [PACK_B_PROVIDER_KEYS.A, PACK_B_PROVIDER_KEYS.B]);
  const [providerA, providerB] = await homeProviderIds(page);
  expect(providerA).toBeTruthy();
  expect(providerB).toBeTruthy();
  await scenario({ id: 'B05', page, harness, starting: 'A/B share channelId 500; B active', actions: ['switch A', 'favorite 500', 'switch B', 'inspect 500', 'return A'], expected: 'favorite membership never crosses provider boundary', run: async () => {
    await selectProvider(page, providerA);
    await openLiveTv(page);
    await expect(page.locator(`${CHANNEL}[data-channel-id="500"]`)).toContainText('Ortak Kanal A');
    await favoriteHighlighted(page);
    await backToHome(page);
    await selectProvider(page, providerB);
    await openLiveTv(page);
    await expect(page.locator(`${CHANNEL}[data-channel-id="500"]`)).toContainText('Ortak Kanal B');
    await expect(page.locator(FAVORITES)).toHaveAttribute('data-presentation-state', 'empty');
    await backToHome(page);
    await selectProvider(page, providerA);
    await openLiveTv(page);
    await expect(page.locator(FAVORITES)).toContainText('Ortak Kanal A');
    return `A=${providerA}; B=${providerB}; same channelId isolated`;
  } });
});

test('B06 Turkish Search matching/order/provider isolation', async ({ context, page }) => {
  const { harness } = await boot(page, context, [PACK_B_PROVIDER_KEYS.A, PACK_B_PROVIDER_KEYS.B]);
  const [providerA] = await homeProviderIds(page);
  await scenario({ id: 'B06', page, harness, starting: 'Turkish synthetic channels in A; colliding names in B', actions: ['switch A', 'open Live TV', 'open Search', 'query Turkish variants'], expected: 'browser-reachable Search with deterministic Turkish/provider-scoped results', run: async () => {
    await selectProvider(page, providerA);
    await openLiveTv(page);
    await expectSearchEntry(page);
    const cases = [['İ', 'İstanbul'], ['i', 'İstanbul'], ['I', 'Ihlamur'], ['ı', 'Ihlamur'], ['Ş', 'Şeker'], ['ş', 'Şeker'], ['Ğ', 'Ğölge'], ['ğ', 'Ğölge'], ['Ü', 'Üsküdar'], ['ü', 'Üsküdar'], ['Ö', 'Öykü'], ['ö', 'Öykü'], ['Ç', 'Çınar'], ['ç', 'Çınar']];
    for (const [query, expected] of cases) {
      const input = page.locator('.live-tv-search-input');
      await input.fill(query);
      await input.dispatchEvent('input');
      await expect(page.locator(SEARCH_RESULT).first()).toContainText(expected);
      const keys = await page.locator(SEARCH_RESULT).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-result-key')));
      expect(keys.every((key) => key?.startsWith(`${providerA}:`))).toBe(true);
    }
    return 'Turkish variants deterministic; result keys provider A scoped';
  } });
});

test('B07 Search highlight/activation does not implicitly play', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await scenario({ id: 'B07', page, harness, starting: 'Provider A Live TV, playback IDLE', actions: ['open Search', 'query Şeker', 'highlight result', 'activate result'], expected: 'highlight and result activation do not implicitly play', run: async () => {
    await openLiveTv(page);
    await expectSearchEntry(page);
    const input = page.locator('.live-tv-search-input');
    await input.fill('şeker');
    await input.dispatchEvent('input');
    await pressRemote(page, 'DOWN');
    await expect(page.locator(`${SEARCH_RESULT}[data-presentation-state="focused"]`)).toContainText('Şeker');
    await assertNoPlayback(page);
    await pressRemote(page, 'SELECT');
    await expect(page.locator(`${CHANNEL}[data-channel-id="${PACK_B_CHANNEL_IDS.sCedilla}"]`)).toHaveClass(/highlighted|focused/);
    await assertNoPlayback(page);
    return 'Search highlight and activation kept playback IDLE';
  } });
});

test('B08 EPG current/next/Program Info present path', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await scenario({ id: 'B08', page, harness, starting: 'Provider A synthetic current/next EPG', actions: ['open Live TV', 'inspect EPG', 'open actions', 'Program Info'], expected: 'current/next and program detail present without playback', run: async () => {
    await openLiveTv(page);
    await expect(page.locator(SELECTED_EPG)).toContainText(`Şimdi: Şimdi ${PACK_B_CHANNEL_IDS.shared}`);
    await expect(page.locator(SELECTED_EPG)).toContainText(`Sonraki: Sonraki ${PACK_B_CHANNEL_IDS.shared}`);
    await openActions(page);
    await pressRemote(page, 'DOWN');
    await pressRemote(page, 'DOWN');
    await expect(page.locator(`${ACTION}[data-action-id="PROGRAM_INFO"]`)).toHaveAttribute('data-presentation-state', 'focused');
    await pressRemote(page, 'SELECT');
    await expect(page.locator(PROGRAM_INFO)).toContainText(`Şimdi ${PACK_B_CHANNEL_IDS.shared}`);
    await assertNoPlayback(page);
    return 'current+next+Program Info visible; playback IDLE';
  } });
});

test('B09 missing/broken EPG keeps Live TV usable', async ({ context, page }) => {
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
  const fixture = createPackBLiveFixture();
  fixture.setEpgMode(PACK_B_PROVIDER_KEYS.A, 'empty');
  await fixture.install(context);
  await openFreshApp(page);
  await connectXtream(page, fixture, PACK_B_PROVIDER_KEYS.A);
  await scenario({ id: 'B09', page, harness, starting: 'valid catalog with empty then malformed/500 EPG', actions: ['open empty EPG', 'navigate', 're-enter malformed', 're-enter 500'], expected: 'Live TV remains usable with no uncontrolled exception', run: async () => {
    for (const mode of ['empty', 'malformed', 'http-500']) {
      fixture.setEpgMode(PACK_B_PROVIDER_KEYS.A, mode);
      await openLiveTv(page);
      await expect(page.locator(CHANNEL).first()).toBeVisible();
      await pressRemote(page, 'DOWN');
      await assertNoPlayback(page);
      if (mode !== 'http-500') await backToHome(page);
    }
    return `usable for empty/malformed/500; network-failures=${harness.events.requestFailures.length}`;
  } });
});

test('B10 channel actions and Back/focus restoration', async ({ context, page }) => {
  const { harness } = await boot(page, context);
  await scenario({ id: 'B10', page, harness, starting: 'shared channel focused with features loaded', actions: ['open actions', 'Program Info', 'Back', 'Back'], expected: 'Play/Favorite/Program Info present; each Back closes one layer and restores valid focus', run: async () => {
    await openLiveTv(page);
    const channelId = await highlightedChannel(page);
    await openActions(page);
    await expect(page.locator(`${ACTION}[data-action-id="WATCH"]`)).toBeVisible();
    await expect(page.locator(`${ACTION}[data-action-id="FAVORITE"]`)).toBeVisible();
    await expect(page.locator(`${ACTION}[data-action-id="PROGRAM_INFO"]`)).toBeVisible();
    await pressRemote(page, 'DOWN');
    await pressRemote(page, 'DOWN');
    await pressRemote(page, 'SELECT');
    await expect(page.locator(PROGRAM_INFO)).toBeVisible();
    await pressRemote(page, 'BACK');
    await expect(page.locator(PROGRAM_INFO)).toHaveCount(0);
    await expect(page.locator(`${ACTION}[data-action-id="PROGRAM_INFO"]`)).toHaveAttribute('data-presentation-state', 'focused');
    await pressRemote(page, 'BACK');
    await expect(page.locator(ACTIONS)).toHaveCount(0);
    await expect(page.locator(`${CHANNEL}[data-channel-id="${channelId}"]`)).toHaveAttribute('data-presentation-state', 'focused');
    await assertNoPlayback(page);
    return `Back restored channel focus ${channelId}; playback IDLE`;
  } });
});

test('B11 catalog refresh stable identity: delete/reorder/empty/single/provider collision', async ({ context, page }) => {
  const { harness, fixture } = await boot(page, context, [PACK_B_PROVIDER_KEYS.A, PACK_B_PROVIDER_KEYS.B]);
  const [providerA, providerB] = await homeProviderIds(page);
  await selectProvider(page, providerA);
  await scenario({ id: 'B11', page, harness, starting: 'A cached catalog; B shares channelId 500', actions: ['pause refresh', 'delete focused', 'reorder', 'single', 'provider collision', 'empty'], expected: 'deterministic stable focus and provider identity', run: async () => {
    const original = fixture.catalog(PACK_B_PROVIDER_KEYS.A).channels;
    let release = fixture.pauseStreams(PACK_B_PROVIDER_KEYS.A);
    await openLiveTv(page);
    await pressRemote(page, 'DOWN');
    const deleted = await highlightedChannel(page);
    expect(deleted).toBe(PACK_B_CHANNEL_IDS.istanbul);
    fixture.setChannels(PACK_B_PROVIDER_KEYS.A, original.filter((row) => String(row.stream_id) !== deleted));
    release();
    await expect(page.locator(`${CHANNEL}[data-channel-id="${deleted}"]`)).toHaveCount(0, { timeout: 10_000 });
    expect(await highlightedChannel(page)).not.toBe(deleted);
    await assertNoPlayback(page);

    await backToHome(page);
    const afterDelete = fixture.catalog(PACK_B_PROVIDER_KEYS.A).channels;
    release = fixture.pauseStreams(PACK_B_PROVIDER_KEYS.A);
    await openLiveTv(page);
    const stable = await highlightedChannel(page);
    fixture.setChannels(PACK_B_PROVIDER_KEYS.A, [afterDelete.at(-1), ...afterDelete.slice(0, -1)].filter(Boolean));
    release();
    await expect(page.locator(`${CHANNEL}[data-channel-id="${stable}"]`)).toHaveClass(/highlighted|focused/, { timeout: 10_000 });
    expect(await highlightedChannel(page)).toBe(stable);

    await backToHome(page);
    release = fixture.pauseStreams(PACK_B_PROVIDER_KEYS.A);
    await openLiveTv(page);
    fixture.setChannels(PACK_B_PROVIDER_KEYS.A, [{ ...original[0], name: 'Ortak Kanal A Tek' }]);
    release();
    await expect(page.locator(CHANNEL)).toHaveCount(1, { timeout: 10_000 });
    expect(await highlightedChannel(page)).toBe(PACK_B_CHANNEL_IDS.shared);

    await backToHome(page);
    await selectProvider(page, providerB);
    await openLiveTv(page);
    await expect(page.locator(`${CHANNEL}[data-channel-id="500"]`)).toContainText('Ortak Kanal B');
    expect(await highlightedChannel(page)).toBe(PACK_B_CHANNEL_IDS.shared);
    await assertNoPlayback(page);

    await backToHome(page);
    await selectProvider(page, providerA);
    release = fixture.pauseStreams(PACK_B_PROVIDER_KEYS.A);
    await openLiveTv(page);
    fixture.setChannels(PACK_B_PROVIDER_KEYS.A, []);
    release();
    await expect(page.locator(CHANNEL)).toHaveCount(0, { timeout: 10_000 });
    await assertNoPlayback(page);
    return `deleted=${deleted}; reordered=${stable}; single=500; B collision stayed B; empty safe`;
  } });
});
