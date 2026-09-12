import { expect, test } from '@playwright/test';
import {
  assertNoUnexplainedConsoleErrors,
  assertViewport,
  findSecretLeaks,
  installBrowserHarness,
  openFreshApp,
  snapshotOrdinaryBrowserStorage,
} from '../lib/harness.mjs';
import { createEvidenceRecord, writeEvidence } from '../lib/evidence.mjs';
import {
  RC_PRODUCTION_SHA,
  RC_SECRET_CANARIES,
  rcCredentialDocument,
} from '../fixtures/common.mjs';

test('H0 production build opens with isolated WidgetData and clean First Run', async ({ context, page }) => {
  const harness = await installBrowserHarness(context, {
    widgetData: { initialValue: null },
  });

  await openFreshApp(page);
  await assertViewport(page, { width: 1920, height: 1080 });
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });

  expect(harness.events.pageErrors).toEqual([]);
  await assertNoUnexplainedConsoleErrors(harness.events);
  expect(await findSecretLeaks(page, RC_SECRET_CANARIES)).toEqual([]);

  const credentialDocument = rcCredentialDocument();
  harness.widgetData.setRaw(credentialDocument);
  expect(harness.widgetData.matchesRaw(credentialDocument)).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => typeof window.webapis?.widgetdata?.read)).toBe('function');
  expect(harness.widgetData.matchesRaw(credentialDocument)).toBe(true);

  const storage = await snapshotOrdinaryBrowserStorage(page);
  expect(storage.localStorage).toBeDefined();
  expect(storage.sessionStorage).toBeDefined();
  expect(storage.indexedDb).toBeDefined();
  expect(await findSecretLeaks(page, RC_SECRET_CANARIES)).toEqual([]);

  const evidence = createEvidenceRecord({
    scenarioId: 'H0-SMOKE',
    productionSha: RC_PRODUCTION_SHA,
    startingState: 'clean browser storage + empty WidgetData',
    actions: ['open production build', 'seed Node-side WidgetData', 'reload'],
    expectedState: 'First Run remains usable; WidgetData survives reload only in Node memory',
    observedState: 'First Run visible before and after reload; ordinary browser storage clean',
    console: harness.events.console,
    pageErrors: harness.events.pageErrors,
    requestFailures: harness.events.requestFailures,
    reloadPersistence: 'WidgetData Node-side state preserved across reload',
    leakage: 'clean',
    artifacts: [],
    status: 'PASS',
  });

  const evidencePath = await writeEvidence(evidence);
  expect(evidencePath).toContain('H0-SMOKE');
});
