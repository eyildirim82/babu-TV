import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  assertViewport,
  installBrowserHarness,
  openFreshApp,
  pressRemote,
} from '../lib/harness.mjs';
import {
  createPackBLiveFixture,
  PACK_B_PROVIDER_KEYS,
} from '../fixtures/pack-b-live.mjs';

const OUTPUT_DIR = 'docs/screenshots';
const CHANNEL = '.channel-item[data-channel-id]';
const ACTIONS = '[data-feature-section="actions"]';
const ACTION = '.live-tv-action[data-action-id]';
const SEARCH = '[data-feature-section="search"]';

test.setTimeout(90_000);

test('generate portfolio screenshots', async ({ context, page }) => {
  await mkdir(OUTPUT_DIR, { recursive: true });

  await installBrowserHarness(context, { widgetData: { initialValue: null } });
  const fixture = createPackBLiveFixture();
  await fixture.install(context);

  await openFreshApp(page);
  await assertViewport(page, { width: 1920, height: 1080 });

  await expect(page.locator('#first-run-page')).toBeVisible();
  await expect(page.locator('#first-run-xtream')).toBeFocused();
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#xtream-entry-page')).toBeVisible();

  const credentials = fixture.credentials();
  await page.locator('#xtream-server-url').fill(fixture.endpoint(PACK_B_PROVIDER_KEYS.A));
  await page.locator('#xtream-username').fill(credentials.username);
  await page.locator('#xtream-password').fill(credentials.password);
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await expect(page.locator('#xtream-connect')).toBeFocused();
  await pressRemote(page, 'SELECT');

  await expect(page.locator('#home-page')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUTPUT_DIR}/home.png`, fullPage: true });

  await expect(page.locator('[data-home-focus-key="home-live-tv"]')).toBeFocused();
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#home-page')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('#sidebar')).not.toHaveClass(/closed/);
  await expect(page.locator(CHANNEL).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUTPUT_DIR}/live-tv.png`, fullPage: true });

  for (let attempt = 0; attempt < 3 && await page.locator(ACTIONS).count() === 0; attempt += 1) {
    await pressRemote(page, 'RIGHT');
    await pressRemote(page, 'SELECT');
  }
  await expect(page.locator(ACTIONS)).toBeVisible();

  const searchAction = page.locator(`${ACTION}[data-action-id="SEARCH"]`);
  await expect(searchAction).toBeVisible();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await searchAction.getAttribute('data-presentation-state') === 'focused') break;
    await pressRemote(page, 'DOWN');
  }
  await expect(searchAction).toHaveAttribute('data-presentation-state', 'focused');
  await pressRemote(page, 'SELECT');
  await expect(page.locator(SEARCH)).toBeVisible();
  await expect(page.locator('.live-tv-search-input')).toBeFocused();
  await page.keyboard.type('seker');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUTPUT_DIR}/search.png`, fullPage: true });
});
