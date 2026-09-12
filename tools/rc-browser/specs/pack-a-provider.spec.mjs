import { expect, test } from '@playwright/test';
import {
  assertNoUnexplainedConsoleErrors, assertViewport, findSecretLeaks,
  installBrowserHarness, openFreshApp, pressRemote,
} from '../lib/harness.mjs';
import {
  M3U_COPY, XTREAM_FAILURE_CASES, addM3uFromManagement, assertBabustvDatabaseReady,
  chooseAddProvider, confirmDelete, durableUserState, editXtreamProvider, firstChannelId,
  focusedElementId, installXtreamRefreshFailureOverride, installXtreamTrueTimeoutOverride,
  openDeleteConfirmation, openM3uEntry, openProviderManagement, openXtreamEntry, providerState,
  readProviderManagementRows, retryXtream, seedDurableUserState, submitM3u, submitXtream,
  switchProvider, widgetDataProviderIds, writePackAEvidence,
} from '../fixtures/pack-a-provider.mjs';
import { RC_ENDPOINTS, RC_SECRET_CANARIES } from '../fixtures/common.mjs';

const REQUIRED = 'Sunucu, kullanıcı adı ve şifre gerekli.';
const clean = (h) => { expect(h.events.pageErrors).toEqual([]); assertNoUnexplainedConsoleErrors(h.events); };
const leaks = async (p) => expect(await findSecretLeaks(p, RC_SECRET_CANARIES)).toEqual([]);
const calls = (h, category) => h.providerMocks.calls.filter((item) => item.category === category);

function scenario(id, meta, body) {
  test(id, async ({ context, page }) => {
    const h = await installBrowserHarness(context, { widgetData: { initialValue: null } });
    try {
      const r = await body({ context, page, h }) ?? {};
      await writePackAEvidence({ scenarioId: id, harness: h, ...meta,
        observedState: r.observedState ?? 'Approved browser requirement satisfied.',
        reloadPersistence: r.reloadPersistence ?? 'not applicable',
        leakage: r.leakage ?? 'clean', status: 'PASS' });
    } catch (error) {
      await writePackAEvidence({ scenarioId: id, harness: h, ...meta,
        observedState: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        reloadPersistence: 'scenario stopped at deterministic failure',
        leakage: h.events.leakageEvents.length ? 'diagnostic canary leakage observed before failure' : 'no diagnostic canary observed before failure',
        status: 'RED' });
      throw error;
    }
  });
}

async function xtream(page, h) {
  await openFreshApp(page); await openXtreamEntry(page); await submitXtream(page);
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 10_000 });
  await assertBabustvDatabaseReady(page);
  const s = await providerState(page); expect(s.providers).toHaveLength(1);
  const id = s.providers[0].id; expect(s.activeProviderId).toBe(id);
  expect(widgetDataProviderIds(h.widgetData)).toEqual([id]); return id;
}
async function two(page, h) {
  const x = await xtream(page, h); await openProviderManagement(page); await addM3uFromManagement(page); await openProviderManagement(page);
  const rows = await readProviderManagementRows(page); expect(rows).toHaveLength(2);
  const ids = rows.map((row) => row.id); expect(ids).toContain(x);
  const m = ids.find((id) => id !== x); expect(typeof m).toBe('string');
  expect((await providerState(page)).activeProviderId).toBe(m); return { x, m, rows };
}

scenario('A01', {
  startingState: 'clean browser storage + empty WidgetData', actions: ['open production build'],
  expectedState: 'First Run visible; valid default focus; clean diagnostics',
}, async ({ page, h }) => {
  await openFreshApp(page); await assertViewport(page, { width: 1920, height: 1080 });
  await expect(page.locator('#first-run-page')).toBeVisible(); expect(await focusedElementId(page)).toBe('first-run-xtream');
  clean(h); await leaks(page); return { observedState: 'First Run visible with Xtream default focus and clean diagnostics.' };
});

scenario('A02', {
  startingState: 'First Run', actions: ['open Xtream', 'submit missing password'],
  expectedState: 'required-field validation; masked password; usable form; no leakage',
}, async ({ page, h }) => {
  await openFreshApp(page); await openXtreamEntry(page); await expect(page.locator('#xtream-password')).toHaveAttribute('type', 'password');
  await page.locator('#xtream-server-url').fill(RC_ENDPOINTS.xtreamA); await page.locator('#xtream-username').fill('synthetic-user');
  for (let i = 0; i < 3; i += 1) await pressRemote(page, 'DOWN'); await pressRemote(page, 'SELECT');
  await expect(page.locator('#xtream-status')).toHaveText(REQUIRED); await expect(page.locator('#xtream-connect')).toBeEnabled();
  expect(await focusedElementId(page)).toBe('xtream-connect'); await leaks(page); clean(h);
});

scenario('A03', {
  startingState: 'Xtream form + synthetic routes', actions: ['401', 'timeout', 'transport failure', 'malformed response'],
  expectedState: 'sanitized failure copy and reusable masked form after every failure',
}, async ({ context, page, h }) => {
  await openFreshApp(page); await openXtreamEntry(page); const timeout = await installXtreamTrueTimeoutOverride(context);
  for (let i = 0; i < XTREAM_FAILURE_CASES.length; i += 1) {
    const f = XTREAM_FAILURE_CASES[i], isTimeout = f.mode === 'timeout'; timeout[isTimeout ? 'enable' : 'disable']();
    h.providerMocks.setXtreamMode('profile', isTimeout ? 'success' : f.mode); if (i === 0) await submitXtream(page); else await retryXtream(page);
    await expect(page.locator('#xtream-status')).toHaveText(f.expected, { timeout: isTimeout ? 15_000 : 5_000 }); timeout.disable();
    await expect(page.locator('#xtream-connect')).toBeEnabled(); await expect(page.locator('#xtream-password')).toHaveAttribute('type', 'password');
    expect(await focusedElementId(page)).toBe('xtream-connect');
  }
  expect(h.events.httpErrors.some((x) => x.status === 401)).toBe(true); expect(h.events.requestFailures.length).toBeGreaterThanOrEqual(1); clean(h);
});

scenario('A04', {
  startingState: 'no providers + successful Xtream mock', actions: ['onboard Xtream', 'reload'],
  expectedState: 'registered active provider; Home; usable catalog; persistence',
}, async ({ page, h }) => {
  const id = await xtream(page, h); let s = await providerState(page); expect(s.channels.some((c) => c.providerId === id)).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('#home-page')).toBeVisible(); s = await providerState(page);
  expect(s.activeProviderId).toBe(id); expect(s.providers.some((p) => p.id === id)).toBe(true); expect(s.channels.some((c) => c.providerId === id)).toBe(true);
  await leaks(page); clean(h); return { reloadPersistence: 'PASS: provider, active selection and catalog persisted.' };
});

scenario('A05', {
  startingState: 'First Run + M3U mock', actions: ['invalid URL', 'malformed playlist'],
  expectedState: 'safe validation/failure presentation and reusable form',
}, async ({ page, h }) => {
  await openFreshApp(page); await openM3uEntry(page); await submitM3u(page, 'not-a-url'); await expect(page.locator('#m3u-status')).toHaveText(M3U_COPY.invalidUrl);
  expect(calls(h, 'm3u')).toHaveLength(0); h.providerMocks.setM3uMode('malformed'); await submitM3u(page); await expect(page.locator('#m3u-status')).toHaveText(M3U_COPY.malformed);
  await expect(page.locator('#m3u-connect')).toBeEnabled(); await leaks(page); clean(h);
});

scenario('A06', {
  startingState: 'no providers + successful M3U mock', actions: ['onboard M3U', 'reload'],
  expectedState: 'registered active M3U provider; usable catalog; persistence',
}, async ({ page, h }) => {
  await openFreshApp(page); await openM3uEntry(page); await submitM3u(page); await expect(page.locator('#home-page')).toBeVisible(); await assertBabustvDatabaseReady(page);
  let s = await providerState(page); expect(s.providers).toHaveLength(1); const id = s.providers[0].id; expect(s.providers[0].kind).toBe('m3u'); expect(s.activeProviderId).toBe(id); expect(s.channels.some((c) => c.providerId === id)).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('#home-page')).toBeVisible(); s = await providerState(page); expect(s.activeProviderId).toBe(id); expect(s.channels.some((c) => c.providerId === id)).toBe(true);
  await leaks(page); clean(h); return { reloadPersistence: 'PASS: M3U provider, active selection and catalog persisted.' };
});

scenario('A07', {
  startingState: 'Xtream + M3U configured, M3U active', actions: ['open Provider Management'],
  expectedState: 'configured providers shown; deterministic active-provider focus',
}, async ({ page, h }) => {
  const { x, m, rows } = await two(page, h); expect(rows.map((r) => r.id).sort()).toEqual([x, m].sort()); expect(rows.filter((r) => r.isActive).map((r) => r.id)).toEqual([m]);
  expect(await focusedElementId(page)).toBe(`provider:${m}:switch`); clean(h);
});

scenario('A08', {
  startingState: 'two providers, M3U active', actions: ['switch to Xtream', 'reload'],
  expectedState: 'active provider changes; no implicit playback; selection persists',
}, async ({ page, h }) => {
  const { x } = await two(page, h); h.providerMocks.resetCalls(); await switchProvider(page, x); expect((await providerState(page)).activeProviderId).toBe(x); expect(calls(h, 'playback')).toHaveLength(0);
  await pressRemote(page, 'BACK'); await expect(page.locator('#home-page')).toBeVisible(); await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('#home-page')).toBeVisible();
  expect((await providerState(page)).activeProviderId).toBe(x); expect(calls(h, 'playback')).toHaveLength(0); clean(h); return { reloadPersistence: 'PASS: switched active provider persisted.' };
});

scenario('A09', {
  startingState: 'two providers; M3U active; Xtream durable user state seeded', actions: ['edit Xtream', 'verify blank fields', 'submit', 'compare state'],
  expectedState: 'no secret prefill; providerId/activation/Favorites/watch preserved',
}, async ({ page, h }) => {
  const { x, m } = await two(page, h), ch = await firstChannelId(page, x); await seedDurableUserState(page, x, ch); const before = await durableUserState(page, x), credentialIds = widgetDataProviderIds(h.widgetData);
  await editXtreamProvider(page, x); for (const id of ['#xtream-server-url', '#xtream-username', '#xtream-password']) expect(await page.locator(id).inputValue()).toBe(''); await expect(page.locator('#xtream-password')).toHaveAttribute('type', 'password');
  await submitXtream(page); await expect(page.locator('#provider-management-page')).toBeVisible(); const s = await providerState(page); expect(s.providers.some((p) => p.id === x)).toBe(true); expect(s.activeProviderId).toBe(m);
  expect(await durableUserState(page, x)).toEqual(before); expect(widgetDataProviderIds(h.widgetData)).toEqual(credentialIds); await leaks(page); clean(h);
});

scenario('A10', {
  startingState: 'two providers with provider-scoped durable state', actions: ['open delete confirmation', 'Back/cancel', 'reopen', 'confirm'],
  expectedState: 'Back cancels in place; confirm removes only target state; survivor intact',
}, async ({ page, h }) => {
  const { x, m } = await two(page, h), xc = await firstChannelId(page, x), mc = await firstChannelId(page, m); await seedDurableUserState(page, x, xc); await seedDurableUserState(page, m, mc); const survivor = await durableUserState(page, x);
  await openDeleteConfirmation(page, m); expect(await focusedElementId(page)).toBe('cancel-delete'); await pressRemote(page, 'BACK'); await expect(page.locator('#provider-management-page')).toBeVisible(); await expect(page.locator('.provider-management-confirmation')).toBeHidden(); expect((await providerState(page)).providers.some((p) => p.id === m)).toBe(true);
  await openDeleteConfirmation(page, m); await confirmDelete(page); const s = await providerState(page); expect(s.providers.some((p) => p.id === m)).toBe(false); expect(s.providers.some((p) => p.id === x)).toBe(true); expect(s.channels.some((c) => c.providerId === m)).toBe(false); expect(s.categories.some((c) => c.providerId === m)).toBe(false);
  expect(await durableUserState(page, m)).toEqual([]); expect(await durableUserState(page, x)).toEqual(survivor); expect(widgetDataProviderIds(h.widgetData)).toEqual([x]); clean(h);
});

scenario('A11', {
  startingState: 'usable Xtream + catalog + durable state', actions: ['empty M3U candidate', 'Xtream re-entry with refresh HTTP 500'],
  expectedState: 'safe candidate rejection/compensation; degraded refresh preserves usable/durable state',
}, async ({ context, page, h }) => {
  const x = await xtream(page, h), ch = await firstChannelId(page, x); await seedDurableUserState(page, x, ch); const before = await providerState(page), user = await durableUserState(page, x);
  await openProviderManagement(page); await chooseAddProvider(page); await openM3uEntry(page); h.providerMocks.setM3uMode('empty'); await submitM3u(page); await expect(page.locator('#m3u-status')).toHaveText(M3U_COPY.malformed); await pressRemote(page, 'BACK'); await expect(page.locator('#provider-management-page')).toBeVisible();
  let s = await providerState(page); expect(s.providers.map((p) => p.id)).toEqual([x]); expect(s.activeProviderId).toBe(x); expect(await durableUserState(page, x)).toEqual(user);
  h.providerMocks.setM3uMode('success'); await installXtreamRefreshFailureOverride(context, 500); await editXtreamProvider(page, x); await submitXtream(page); await expect(page.locator('#provider-management-page')).toBeVisible(); s = await providerState(page);
  expect(s.providers.map((p) => p.id)).toEqual([x]); expect(s.activeProviderId).toBe(x); expect(s.channels.filter((c) => c.providerId === x)).toEqual(before.channels.filter((c) => c.providerId === x)); expect(await durableUserState(page, x)).toEqual(user); expect(h.events.httpErrors.some((e) => e.status === 500)).toBe(true); clean(h);
});

scenario('A12', {
  startingState: 'clean storage before two-provider lifecycle', actions: ['onboard both', 'switch', 'delete M3U', 'reload', 'scan browser-visible persistence'],
  expectedState: 'survivor persists; diagnostics clean; no credential/source canary in DOM/URL/local/session/ordinary IndexedDB/evidence',
}, async ({ page, h }) => {
  const { x, m } = await two(page, h); await switchProvider(page, x); await openDeleteConfirmation(page, m); await confirmDelete(page); await pressRemote(page, 'BACK'); await expect(page.locator('#home-page')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('#home-page')).toBeVisible(); const s = await providerState(page); expect(s.providers.map((p) => p.id)).toEqual([x]); expect(s.activeProviderId).toBe(x); expect(s.channels.some((c) => c.providerId === x)).toBe(true); expect(widgetDataProviderIds(h.widgetData)).toEqual([x]);
  await leaks(page); expect(h.events.leakageEvents).toEqual([]); clean(h); return { reloadPersistence: 'PASS: survivor provider/catalog/activation persisted.', leakage: 'PASS: no credential/source canary in browser-visible persistence, diagnostics or evidence.' };
});
