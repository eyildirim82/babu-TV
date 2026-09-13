import { expect, test } from '@playwright/test';
import { installBrowserHarness, openFreshApp } from '../lib/harness.mjs';
import {
  addM3uFromManagement,
  confirmDelete,
  firstChannelId,
  openDeleteConfirmation,
  openProviderManagement,
  openXtreamEntry,
  providerState,
  readProviderManagementRows,
  seedDurableUserState,
  submitXtream,
  widgetDataProviderIds,
} from '../fixtures/pack-a-provider.mjs';

// Temporary H1 diagnostic: emit only IDs/booleans, never credential material.
test('provider delete stage diagnostic', async ({ context, page }) => {
  const h = await installBrowserHarness(context, { widgetData: { initialValue: null } });

  await openFreshApp(page);
  await openXtreamEntry(page);
  await submitXtream(page);
  await expect(page.locator('#home-page')).toBeVisible({ timeout: 10_000 });

  let state = await providerState(page);
  const x = state.providers[0]?.id;
  expect(typeof x).toBe('string');

  await openProviderManagement(page);
  await addM3uFromManagement(page);
  await openProviderManagement(page);
  const rows = await readProviderManagementRows(page);
  const m = rows.map((row) => row.id).find((id) => id !== x);
  expect(typeof m).toBe('string');

  const xc = await firstChannelId(page, x);
  const mc = await firstChannelId(page, m);
  await seedDurableUserState(page, x, xc);
  await seedDurableUserState(page, m, mc);

  await openDeleteConfirmation(page, m);
  await confirmDelete(page);
  state = await providerState(page);

  const snapshot = {
    providerPresent: state.providers.some((item) => item.id === m),
    channelPresent: state.channels.some((item) => item.providerId === m),
    categoryPresent: state.categories.some((item) => item.providerId === m),
    favoritePresent: state.favorites.some((item) => item.providerId === m),
    watchPresent: state.watch.some((item) => item.providerId === m),
    credentialPresent: widgetDataProviderIds(h.widgetData).includes(m),
    survivorProviderPresent: state.providers.some((item) => item.id === x),
  };

  console.log(`[provider-delete-diagnostic] ${JSON.stringify(snapshot)}`);
  expect(snapshot.providerPresent).toBe(false);
});
