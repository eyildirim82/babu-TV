import { expect, test } from '@playwright/test';
import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  assertNoUnexplainedConsoleErrors,
  findSecretLeaks,
  installBrowserHarness,
  openFreshApp,
  pressRemote,
  snapshotOrdinaryBrowserStorage,
} from '../lib/harness.mjs';
import { createEvidenceRecord, writeEvidence } from '../lib/evidence.mjs';
import {
  RC_ENDPOINTS,
  RC_PRODUCTION_SHA,
  RC_SECRET_CANARIES,
  RC_SECRETS,
} from '../fixtures/common.mjs';
import {
  PHONE_ROUTE_RESULT,
  PAIRING_STATE_CASES,
  XTREAM_ERROR_CASES,
  assertNoCanaryText,
  encryptXtreamPayloadForTv,
  installPairingBrowserConfig,
  installPairingPublicKeyProbe,
  readPairingTvPublicKey,
  scanGeneratedOutputForCanaries,
} from '../fixtures/pack-c-security-pairing.mjs';

const execFileAsync = promisify(execFile);

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    for (const input of document.querySelectorAll('input')) {
      input.value = '';
      input.removeAttribute('value');
    }
    if (location.search || location.hash) {
      history.replaceState(null, '', location.pathname);
    }
  }).catch(() => {});
});

async function waitForFirstRun(page) {
  await expect(page.locator('#first-run-page')).toBeVisible({ timeout: 10_000 });
}

async function openXtream(page) {
  await waitForFirstRun(page);
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#xtream-entry-page')).toBeVisible();
}

async function submitXtream(page) {
  await page.locator('#xtream-server-url').fill(RC_ENDPOINTS.xtreamA);
  await page.locator('#xtream-username').fill(RC_SECRETS.xtreamUsername);
  await page.locator('#xtream-password').fill(RC_SECRETS.xtreamPassword);
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
}

async function openM3u(page) {
  await waitForFirstRun(page);
  await pressRemote(page, 'RIGHT');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#m3u-entry-page')).toBeVisible();
}

async function submitM3u(page) {
  await page.locator('#m3u-playlist-url').fill(RC_ENDPOINTS.m3uA);
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
}

async function openPairing(page) {
  await waitForFirstRun(page);
  await pressRemote(page, 'RIGHT');
  await pressRemote(page, 'RIGHT');
  await pressRemote(page, 'SELECT');
  await expect(page.locator('#pairing-tv-root')).toBeVisible();
}

async function scrubEntryInputs(page) {
  await page.evaluate(() => {
    for (const input of document.querySelectorAll('#xtream-entry-page input, #m3u-entry-page input')) {
      input.value = '';
      input.removeAttribute('value');
    }
  });
}

async function writeSafeEvidence({
  scenarioId,
  harness,
  startingState,
  actions,
  expectedState,
  observedState,
  reloadPersistence = 'not exercised',
  leakage = 'clean',
  status = 'PASS',
}) {
  const evidence = createEvidenceRecord({
    scenarioId,
    productionSha: RC_PRODUCTION_SHA,
    startingState,
    actions,
    expectedState,
    observedState,
    console: harness?.events?.console ?? [],
    pageErrors: harness?.events?.pageErrors ?? [],
    requestFailures: harness?.events?.requestFailures ?? [],
    reloadPersistence,
    leakage,
    artifacts: [],
    status,
  });
  const evidencePath = await writeEvidence(evidence);
  const serialized = await readFile(evidencePath, 'utf8');
  assertNoCanaryText(serialized, 'evidence artifact');
  return evidencePath;
}

function statusFromLeaks(leaks) {
  return leaks.length === 0 ? 'PASS' : 'RED';
}

test('S01 normal application boot has clean browser diagnostics', async ({ context, page }) => {
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
  await openFreshApp(page);
  await waitForFirstRun(page);

  const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES);
  await writeSafeEvidence({
    scenarioId: 'BROW-SECPAIR-S01',
    harness,
    startingState: 'clean browser profile; empty WidgetData',
    actions: ['open production application'],
    expectedState: 'First Run visible with no unexplained console or page errors',
    observedState: `pageErrors=${harness.events.pageErrors.length}; consoleErrors=${harness.events.console.filter((entry) => entry.type === 'error').length}`,
    leakage: leaks,
    status: statusFromLeaks(leaks),
  });

  expect(harness.events.pageErrors).toEqual([]);
  assertNoUnexplainedConsoleErrors(harness.events);
  expect(leaks).toEqual([]);
});

test('S02 Xtream credentials stay out of ordinary browser surfaces after successful handling', async ({ context, page }) => {
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
  await openFreshApp(page);
  await openXtream(page);
  await submitXtream(page);
  await expect(page.locator('#xtream-entry-page')).toHaveCount(0, { timeout: 10_000 });

  const storage = await snapshotOrdinaryBrowserStorage(page);
  const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES);
  await writeSafeEvidence({
    scenarioId: 'BROW-SECPAIR-S02',
    harness,
    startingState: 'First Run; no providers',
    actions: ['submit synthetic Xtream credentials through production entry flow'],
    expectedState: 'credentials retained only by approved credential boundary; ordinary browser surfaces remain clean',
    observedState: `ordinaryStorage local=${storage.localStorage.length} session=${storage.sessionStorage.length} indexedDb=${storage.indexedDb.length}; leakCategories=${leaks.join(',') || 'none'}`,
    leakage: leaks,
    status: statusFromLeaks(leaks),
  });

  expect(harness.events.pageErrors).toEqual([]);
  assertNoUnexplainedConsoleErrors(harness.events);
  assertNoCanaryText(harness.providerMocks.calls, 'provider mock diagnostics');
  expect(leaks).toEqual([]);
});

test('S03 S04 S13 M3U source and transient stream material do not persist after handling or reload', async ({ context, page }) => {
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
  await openFreshApp(page);
  await openM3u(page);
  await submitM3u(page);
  await expect(page.locator('#m3u-entry-page')).toHaveCount(0, { timeout: 10_000 });

  const beforeReload = await findSecretLeaks(page, RC_SECRET_CANARIES);
  assertNoCanaryText(page.url(), 'application URL');
  await page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await findSecretLeaks(page, RC_SECRET_CANARIES);
  assertNoCanaryText(page.url(), 'application URL after reload');
  const leaks = [...new Set([...beforeReload, ...afterReload])].sort();

  await writeSafeEvidence({
    scenarioId: 'BROW-SECPAIR-S03-S04-S13',
    harness,
    startingState: 'First Run; no providers',
    actions: ['submit synthetic M3U source', 'allow catalog ingestion', 'reload production application'],
    expectedState: 'source token and transient stream token absent from ordinary storage, DOM, diagnostics, evidence, and application URL',
    observedState: `leakCategories=${leaks.join(',') || 'none'}`,
    reloadPersistence: 'checked after full page reload',
    leakage: leaks,
    status: statusFromLeaks(leaks),
  });

  expect(harness.events.pageErrors).toEqual([]);
  assertNoUnexplainedConsoleErrors(harness.events);
  assertNoCanaryText(harness.providerMocks.calls, 'provider mock diagnostics');
  expect(leaks).toEqual([]);
});

for (const scenario of XTREAM_ERROR_CASES) {
  test(`S05 provider error presentation is fixed and sanitized: ${scenario.id}`, async ({ context, page }) => {
    const harness = await installBrowserHarness(context, {
      widgetData: { initialValue: null },
      providerMocks: { xtream: { profile: scenario.mode } },
    });
    await openFreshApp(page);
    await openXtream(page);
    await submitXtream(page);

    const status = page.locator('#xtream-status');
    await expect(status).toHaveText(scenario.expected, { timeout: 10_000 });
    const observed = await status.textContent();
    await scrubEntryInputs(page);
    const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES);
    assertNoCanaryText(harness.events, 'browser diagnostics');
    assertNoCanaryText(harness.providerMocks.calls, 'provider mock diagnostics');

    await writeSafeEvidence({
      scenarioId: `BROW-SECPAIR-S05-${scenario.id}`,
      harness,
      startingState: 'Xtream entry; deterministic provider failure mode',
      actions: ['submit synthetic Xtream credentials', `provider mode=${scenario.id}`],
      expectedState: 'fixed sanitized provider error copy; no raw URL/query/credential leakage',
      observedState: observed ?? '',
      leakage: leaks,
      status: statusFromLeaks(leaks),
    });

    expect(observed).toBe(scenario.expected);
    expect(leaks).toEqual([]);
  });
}

test('S06 S08 TV pairing exposes only public/session bootstrap material and clean relay requests', async ({ context, page }) => {
  await installPairingBrowserConfig(context);
  await installPairingPublicKeyProbe(context);
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
  const relayRequests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(RC_ENDPOINTS.relay)) return;
    relayRequests.push({ method: request.method(), url: request.url(), body: request.postData() });
  });

  await openFreshApp(page);
  await openPairing(page);
  await expect(page.locator('#pairing-tv-status')).toHaveText('QR kodunu telefonunuzla tarayın.', { timeout: 10_000 });
  await expect(page.locator('#pairing-tv-qr')).toHaveAttribute('src', /^data:image\//);

  const tvPublicKey = await readPairingTvPublicKey(page);
  expect(tvPublicKey).not.toBeNull();
  expect(tvPublicKey?.d).toBeUndefined();
  assertNoCanaryText(tvPublicKey, 'TV public bootstrap key');
  assertNoCanaryText(relayRequests, 'pairing relay requests');

  const create = relayRequests.find((entry) => entry.method === 'POST' && entry.url.endsWith('/v1/pairing/sessions'));
  expect(create).toBeTruthy();
  const createBody = JSON.parse(create?.body ?? '{}');
  expect(Object.keys(createBody).sort()).toEqual(['expiresAtMs', 'sessionId']);

  const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES);
  await writeSafeEvidence({
    scenarioId: 'BROW-SECPAIR-S06-S08',
    harness,
    startingState: 'First Run with production TV pairing enabled by public runtime config',
    actions: ['open TV pairing', 'create pairing session', 'render QR bootstrap', 'observe relay requests'],
    expectedState: 'bootstrap uses public/session material only; relay transport contains no plaintext provider credentials',
    observedState: `tvPublicKey=public-only; relayRequests=${relayRequests.length}; leakCategories=${leaks.join(',') || 'none'}`,
    leakage: leaks,
    status: statusFromLeaks(leaks),
  });

  expect(leaks).toEqual([]);
  await page.locator('.pairing-tv-back').click();
});

for (const scenario of PAIRING_STATE_CASES) {
  test(`S07 TV pairing state is fixed and sanitized: ${scenario.id}`, async ({ context, page }) => {
    await installPairingBrowserConfig(context);
    const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
    harness.providerMocks.setRelayMode(scenario.operation, scenario.mode);

    await openFreshApp(page);
    await openPairing(page);
    const status = page.locator('#pairing-tv-status');
    await expect(status).toHaveText(scenario.expected, { timeout: 10_000 });
    const observed = await status.textContent();
    const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES);
    assertNoCanaryText(harness.events, 'pairing diagnostics');
    assertNoCanaryText(harness.providerMocks.calls, 'pairing relay diagnostics');

    await writeSafeEvidence({
      scenarioId: `BROW-SECPAIR-S07-${scenario.id}`,
      harness,
      startingState: 'TV pairing open with deterministic relay state',
      actions: [`relay ${scenario.operation} mode=${scenario.id}`],
      expectedState: scenario.expected,
      observedState: observed ?? '',
      leakage: leaks,
      status: statusFromLeaks(leaks),
    });

    expect(observed).toBe(scenario.expected);
    expect(leaks).toEqual([]);
  });
}

test('S09 decrypted pairing payload is never exposed to diagnostics, DOM, ordinary storage, or evidence', async ({ context, page }) => {
  await installPairingBrowserConfig(context, { pollIntervalMs: 200 });
  await installPairingPublicKeyProbe(context);
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });

  await context.route('https://relay.invalid/v1/pairing/sessions/*/ciphertext', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const tvPublicKey = await readPairingTvPublicKey(page);
    const envelope = await encryptXtreamPayloadForTv(tvPublicKey);
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ status: 'ready', ciphertext: JSON.stringify(envelope) }),
    });
  });

  await openFreshApp(page);
  await openPairing(page);
  await expect(page.locator('#pairing-tv-root')).toHaveCount(0, { timeout: 15_000 });

  const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES);
  assertNoCanaryText(harness.events, 'browser diagnostics after pairing decrypt');
  assertNoCanaryText(harness.providerMocks.calls, 'provider diagnostics after pairing decrypt');
  await writeSafeEvidence({
    scenarioId: 'BROW-SECPAIR-S09',
    harness,
    startingState: 'TV pairing session with synthetic encrypted Xtream payload',
    actions: ['receive ciphertext envelope', 'decrypt in production TV controller', 'complete provider onboarding'],
    expectedState: 'decrypted provider payload never appears in console, page errors, DOM, ordinary browser storage, or evidence',
    observedState: `pairing completed; leakCategories=${leaks.join(',') || 'none'}`,
    leakage: leaks,
    status: statusFromLeaks(leaks),
  });

  expect(harness.events.pageErrors).toEqual([]);
  assertNoUnexplainedConsoleErrors(harness.events);
  expect(leaks).toEqual([]);
});

test('S10 S11 S12 phone pairing browser qualification is NOT-AVAILABLE without a production route', async ({ context, page }) => {
  const harness = await installBrowserHarness(context, { widgetData: { initialValue: null } });
  await openFreshApp(page);
  await waitForFirstRun(page);

  expect(PHONE_ROUTE_RESULT).toEqual({ status: 'NOT-AVAILABLE', reason: 'no production browser route' });
  await expect(page.locator('#pairing-phone-root')).toHaveCount(0);
  const leaks = await findSecretLeaks(page, RC_SECRET_CANARIES);
  await writeSafeEvidence({
    scenarioId: 'BROW-SECPAIR-S10-S12',
    harness,
    startingState: 'production TV application route',
    actions: ['inspect production-accessible application surface only'],
    expectedState: 'phone pairing tests run only when an integrated production browser route exists',
    observedState: 'NOT-AVAILABLE — no production browser route',
    leakage: leaks,
    status: 'NOT-AVAILABLE',
  });

  expect(leaks).toEqual([]);
});

test('S14 S15 static security audit and generated-output canary scan stay green', async () => {
  const { stdout, stderr } = await execFileAsync('node', ['tools/check-m7-security-privacy.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assertNoCanaryText(stdout, 'static audit stdout');
  assertNoCanaryText(stderr, 'static audit stderr');
  expect(stdout).toContain('[m7-security] PASS');

  const generatedLeaks = await scanGeneratedOutputForCanaries();
  const evidence = createEvidenceRecord({
    scenarioId: 'BROW-SECPAIR-S14-S15',
    productionSha: RC_PRODUCTION_SHA,
    startingState: 'qualified production source and generated output',
    actions: ['run static security/privacy audit', 'scan generated text output for RC synthetic canaries'],
    expectedState: 'static audit and generated-output privacy scan are clean',
    observedState: `staticAudit=PASS; generatedLeakPaths=${generatedLeaks.join(',') || 'none'}`,
    console: [],
    pageErrors: [],
    requestFailures: [],
    reloadPersistence: 'not applicable',
    leakage: generatedLeaks,
    artifacts: [],
    status: statusFromLeaks(generatedLeaks),
  });
  const evidencePath = await writeEvidence(evidence);
  assertNoCanaryText(await readFile(evidencePath, 'utf8'), 'static audit evidence');

  expect(generatedLeaks).toEqual([]);
});

test('S16 evidence hard-fail rejects an unsafe record before writing output', async ({}, testInfo) => {
  const safeRecord = createEvidenceRecord({
    scenarioId: 'BROW-SECPAIR-S16',
    productionSha: RC_PRODUCTION_SHA,
    startingState: 'evidence writer hard-fail check',
    actions: ['attempt unsafe evidence write'],
    expectedState: 'synthetic canary is rejected before filesystem output is created',
    observedState: 'safe control record',
    console: [],
    pageErrors: [],
    requestFailures: [],
    reloadPersistence: 'not applicable',
    leakage: 'hard-fail expected',
    artifacts: [],
    status: 'PASS',
  });
  const unsafeRecord = { ...safeRecord, observedState: RC_SECRET_CANARIES[0] };
  const outputDir = testInfo.outputPath('unsafe-evidence');

  let rejected = false;
  try {
    await writeEvidence(unsafeRecord, { outputDir });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes('synthetic secret canary detected');
  }
  if (!rejected) throw new Error('S16 evidence writer did not hard-fail on a synthetic canary.');

  let outputExists = true;
  try {
    await access(outputDir);
  } catch {
    outputExists = false;
  }
  if (outputExists) throw new Error('S16 unsafe evidence output path was created.');

  const evidencePath = await writeEvidence(safeRecord);
  assertNoCanaryText(await readFile(evidencePath, 'utf8'), 'S16 safe evidence');
});
