import {
  RC_ENDPOINTS,
  RC_PRODUCTION_SHA,
  RC_SECRETS,
} from './common.mjs';
import { pressRemote } from '../lib/harness.mjs';
import {
  createEvidenceRecord,
  sanitizeTextForEvidence,
  writeEvidence,
} from '../lib/evidence.mjs';

export const RC_BROWSER_H0_SHA = '61cb2198fee982ae3b3a61398dc120738d3405b4';

export const XTREAM_FAILURE_CASES = Object.freeze([
  { mode: 'http-401', expected: 'Kullanıcı adı veya şifre hatalı.' },
  { mode: 'timeout', expected: 'Bağlantı zaman aşımına uğradı.' },
  { mode: 'transport-failure', expected: 'Sunucuya ulaşılamadı.' },
  { mode: 'malformed', expected: 'Sunucu yanıtı desteklenmiyor.' },
]);

export const M3U_COPY = Object.freeze({
  invalidUrl: "Geçerli bir oynatma listesi URL'si girin.",
  malformed: 'Oynatma listesi okunamadı.',
});

export async function openXtreamEntry(page) {
  await pressRemote(page, 'SELECT');
}

export async function openM3uEntry(page) {
  await pressRemote(page, 'RIGHT');
  await pressRemote(page, 'SELECT');
}

export async function submitXtream(page, input = {}) {
  await page.locator('#xtream-server-url').fill(input.serverUrl ?? RC_ENDPOINTS.xtreamA);
  await page.locator('#xtream-username').fill(input.username ?? RC_SECRETS.xtreamUsername);
  await page.locator('#xtream-password').fill(input.password ?? RC_SECRETS.xtreamPassword);
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
}

export async function retryXtream(page, input = {}) {
  await page.locator('#xtream-server-url').fill(input.serverUrl ?? RC_ENDPOINTS.xtreamA);
  await page.locator('#xtream-username').fill(input.username ?? RC_SECRETS.xtreamUsername);
  await page.locator('#xtream-password').fill(input.password ?? RC_SECRETS.xtreamPassword);
  await pressRemote(page, 'SELECT');
}

export async function submitM3u(page, playlistUrl = RC_ENDPOINTS.m3uA) {
  await page.locator('#m3u-playlist-url').fill(playlistUrl);
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
}

export async function retryM3u(page, playlistUrl = RC_ENDPOINTS.m3uA) {
  await page.locator('#m3u-playlist-url').fill(playlistUrl);
  await pressRemote(page, 'SELECT');
}

async function activeHomeFocusKey(page) {
  return page.evaluate(() => document.activeElement?.getAttribute('data-home-focus-key') ?? null);
}

export async function openProviderManagement(page) {
  await page.locator('#home-page').waitFor({ state: 'visible' });
  for (let index = 0; index < 12; index += 1) {
    if (await activeHomeFocusKey(page) === 'home-settings') break;
    await pressRemote(page, 'DOWN');
  }
  if (await activeHomeFocusKey(page) !== 'home-settings') {
    throw new Error('Home Settings focus could not be reached deterministically.');
  }
  await pressRemote(page, 'SELECT');
  await page.locator('#provider-management-page').waitFor({ state: 'visible' });
}

export async function focusedElementId(page) {
  return page.evaluate(() => document.activeElement?.id ?? null);
}

export async function readProviderManagementRows(page) {
  return page.locator('.provider-management-row').evaluateAll((rows) => rows.map((row) => {
    const switchButton = row.querySelector('button[id$=":switch"]');
    const editButton = row.querySelector('button[id$=":edit"]');
    const deleteButton = row.querySelector('button[id$=":delete"]');
    const switchId = switchButton?.id ?? '';
    const match = /^provider:(.+):switch$/.exec(switchId);
    return {
      id: match?.[1] ?? null,
      text: row.textContent ?? '',
      isActive: (row.textContent ?? '').includes('· Aktif'),
      switchId,
      editId: editButton?.id ?? '',
      deleteId: deleteButton?.id ?? '',
    };
  }));
}

async function providerFocusOrder(page) {
  return page.locator('#provider-management-page button').evaluateAll((buttons) => buttons
    .map((button) => button.id)
    .filter((id) => /^provider:.+:(?:switch|edit|delete)$/.test(id) || id === 'add-provider'));
}

export async function moveProviderFocusTo(page, targetId) {
  const order = await providerFocusOrder(page);
  const targetIndex = order.indexOf(targetId);
  if (targetIndex < 0) throw new Error(`Provider focus target unavailable: ${targetId}`);

  const currentId = await focusedElementId(page);
  const currentIndex = order.indexOf(currentId);
  if (currentIndex < 0) throw new Error(`Current provider focus is outside presenter order: ${currentId}`);

  const direction = targetIndex >= currentIndex ? 'DOWN' : 'UP';
  for (let index = 0; index < Math.abs(targetIndex - currentIndex); index += 1) {
    await pressRemote(page, direction);
  }
  const observed = await focusedElementId(page);
  if (observed !== targetId) {
    throw new Error(`Provider focus mismatch: expected ${targetId}, observed ${observed}`);
  }
}

export async function chooseAddProvider(page) {
  await moveProviderFocusTo(page, 'add-provider');
  await pressRemote(page, 'SELECT');
  await page.locator('#first-run-page').waitFor({ state: 'visible' });
}

export async function addM3uFromManagement(page) {
  await chooseAddProvider(page);
  await openM3uEntry(page);
  await page.locator('#m3u-entry-page').waitFor({ state: 'visible' });
  await submitM3u(page);
  await page.locator('#home-page').waitFor({ state: 'visible' });
}

export async function switchProvider(page, providerId) {
  await moveProviderFocusTo(page, `provider:${providerId}:switch`);
  await pressRemote(page, 'SELECT');
  await page.locator('#provider-management-page').waitFor({ state: 'visible' });
}

export async function editXtreamProvider(page, providerId) {
  await moveProviderFocusTo(page, `provider:${providerId}:edit`);
  await pressRemote(page, 'SELECT');
  await page.locator('#xtream-entry-page').waitFor({ state: 'visible' });
}

export async function openDeleteConfirmation(page, providerId) {
  await moveProviderFocusTo(page, `provider:${providerId}:delete`);
  await pressRemote(page, 'SELECT');
  await page.locator('.provider-management-confirmation').waitFor({ state: 'visible' });
}

export async function confirmDelete(page) {
  if (await focusedElementId(page) !== 'cancel-delete') {
    throw new Error('Delete confirmation did not default focus to cancel.');
  }
  await pressRemote(page, 'DOWN');
  await pressRemote(page, 'SELECT');
  await page.locator('#provider-management-page').waitFor({ state: 'visible' });
}

function openDatabase(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('babustv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('babustv IndexedDB unavailable'));
    });
    const storeNames = Array.from(database.objectStoreNames);
    database.close();
    return storeNames;
  });
}

export async function assertBabustvDatabaseReady(page) {
  const stores = await openDatabase(page);
  for (const required of ['providers', 'categories', 'channels', 'app_state']) {
    if (!stores.includes(required)) throw new Error(`Missing structured store: ${required}`);
  }
}

export async function readStore(page, storeName) {
  return page.evaluate(async (name) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('babustv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('babustv IndexedDB unavailable'));
    });
    if (!database.objectStoreNames.contains(name)) {
      database.close();
      return [];
    }
    const result = await new Promise((resolve, reject) => {
      const transaction = database.transaction(name, 'readonly');
      const request = transaction.objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`IndexedDB read failed: ${name}`));
    });
    database.close();
    return result;
  }, storeName);
}

export async function providerState(page) {
  const [providers, appState, channels, categories] = await Promise.all([
    readStore(page, 'providers'),
    readStore(page, 'app_state'),
    readStore(page, 'channels'),
    readStore(page, 'categories'),
  ]);
  return {
    providers,
    activeProviderId: appState.find((item) => item?.key === 'activeProviderId')?.value ?? null,
    channels,
    categories,
  };
}

export async function firstChannelId(page, providerId) {
  const channels = (await readStore(page, 'channels')).filter((item) => item?.providerId === providerId);
  const channelId = channels[0]?.id;
  if (typeof channelId !== 'string') throw new Error(`No catalog channel for provider ${providerId}`);
  return channelId;
}

export async function seedDurableUserState(page, providerId, channelId) {
  await page.evaluate(async ({ providerId: provider, channelId: channel }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('babustv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('babustv IndexedDB unavailable'));
    });
    const transaction = database.transaction('app_state', 'readwrite');
    const store = transaction.objectStore('app_state');
    store.put({
      key: `user.favorite:${JSON.stringify([provider, channel])}`,
      kind: 'user.favorite.v1',
      providerId: provider,
      channelId: channel,
      addedAtMs: 1_700_000_000_000,
    });
    store.put({
      key: `user.watch.last:${JSON.stringify(provider)}`,
      kind: 'user.watch.last.v1',
      providerId: provider,
      channelId: channel,
      lastPlayedAtMs: 1_700_000_010_000,
    });
    store.put({
      key: `user.watch.aggregate:${JSON.stringify([provider, channel])}`,
      kind: 'user.watch.aggregate.v1',
      providerId: provider,
      channelId: channel,
      meaningfulWatchMs: 120_000,
      meaningfulOpenCount: 2,
      lastMeaningfulWatchAtMs: 1_700_000_010_000,
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Durable user-state seed failed'));
      transaction.onabort = () => reject(new Error('Durable user-state seed aborted'));
    });
    database.close();
  }, { providerId, channelId });
}

export async function durableUserState(page, providerId) {
  return (await readStore(page, 'app_state'))
    .filter((item) => item?.providerId === providerId && typeof item?.kind === 'string' && item.kind.startsWith('user.'))
    .sort((left, right) => String(left.key).localeCompare(String(right.key)));
}

export function widgetDataProviderIds(widgetData) {
  const raw = widgetData.readRaw();
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    return Object.keys(parsed).sort();
  } catch {
    return [];
  }
}

export async function installXtreamTrueTimeoutOverride(context, delayMs = 10_500) {
  let enabled = false;
  await context.route('https://provider-a.invalid/**', async (route) => {
    const url = new URL(route.request().url());
    const isProfileRequest = url.pathname.endsWith('/player_api.php') && url.searchParams.get('action') === null;
    if (!enabled || !isProfileRequest) {
      await route.fallback();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      await route.fallback();
    } catch {
      // Production AbortController owns the timeout result; the intercepted
      // route may already be gone when the synthetic delay completes.
    }
  });
  return Object.freeze({
    enable() { enabled = true; },
    disable() { enabled = false; },
  });
}

export async function installXtreamRefreshFailureOverride(context, status = 500) {
  let hitCount = 0;
  await context.route('https://provider-a.invalid/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('action') === 'get_live_categories') {
      hitCount += 1;
      await route.fulfill({
        status,
        contentType: 'text/plain; charset=utf-8',
        body: 'synthetic refresh failure',
      });
      return;
    }
    await route.fallback();
  });
  return Object.freeze({
    count() { return hitCount; },
  });
}

export async function writePackAEvidence({
  scenarioId,
  harness,
  startingState,
  actions,
  expectedState,
  observedState,
  reloadPersistence = 'not applicable',
  leakage = 'clean',
  artifacts = [],
  status,
}) {
  const safeObserved = sanitizeTextForEvidence(observedState);
  const base = createEvidenceRecord({
    scenarioId,
    productionSha: RC_PRODUCTION_SHA,
    startingState,
    actions,
    expectedState,
    observedState: safeObserved,
    console: harness.events.console,
    pageErrors: harness.events.pageErrors,
    requestFailures: harness.events.requestFailures,
    reloadPersistence,
    leakage,
    artifacts,
    status,
  });
  const record = Object.freeze({
    ...base,
    h0Sha: RC_BROWSER_H0_SHA,
    httpErrors: harness.events.httpErrors,
  });
  return writeEvidence(record);
}
