import assert from 'node:assert/strict';
import { RC_SECRET_CANARIES } from '../fixtures/common.mjs';
import { sanitizeTextForEvidence, sanitizeUrlForEvidence } from './evidence.mjs';
import { installProviderMocks } from './provider-mocks.mjs';
import { installWidgetDataStub } from './widgetdata-stub.mjs';

const WEBAPIS_SCRIPT = /\/(?:%24|\$)WEBAPIS\/webapis\/webapis\.js(?:\?.*)?$/i;
const REMOTE_KEYS = Object.freeze({
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  SELECT: 'Enter',
  BACK: 'Escape',
});

function containsCanary(text, canaries = RC_SECRET_CANARIES) {
  const value = String(text ?? '');
  return canaries.some((canary) => canary && value.includes(canary));
}

function attachPageEvents(page, events) {
  page.on('console', (message) => {
    const raw = message.text();
    if (containsCanary(raw)) events.leakageEvents.push({ category: 'console', type: message.type() });
    if (message.type() === 'error' || message.type() === 'warning') {
      events.console.push({
        type: message.type(),
        text: sanitizeTextForEvidence(raw),
      });
    }
  });

  page.on('pageerror', (error) => {
    const raw = error?.message ?? String(error);
    if (containsCanary(raw)) events.leakageEvents.push({ category: 'pageerror' });
    events.pageErrors.push(sanitizeTextForEvidence(raw));
  });

  page.on('requestfailed', (request) => {
    events.requestFailures.push({
      method: request.method(),
      url: sanitizeUrlForEvidence(request.url()),
      failure: sanitizeTextForEvidence(request.failure()?.errorText ?? 'request failed'),
    });
  });

  page.on('response', (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    events.httpErrors.push({
      status: response.status(),
      method: request.method(),
      resourceType: request.resourceType(),
      url: sanitizeUrlForEvidence(response.url()),
    });
  });
}

export async function installBrowserHarness(context, options = {}) {
  const events = {
    console: [],
    pageErrors: [],
    requestFailures: [],
    httpErrors: [],
    leakageEvents: [],
  };

  await context.route(WEBAPIS_SCRIPT, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: '/* RC browser: native Samsung webapis shim intentionally empty. */',
    });
  });

  const widgetData = await installWidgetDataStub(context, options.widgetData ?? {});
  const providerMocks = await installProviderMocks(context, options.providerMocks ?? {});

  for (const page of context.pages()) attachPageEvents(page, events);
  context.on('page', (page) => attachPageEvents(page, events));

  return Object.freeze({ widgetData, providerMocks, events });
}

export async function openFreshApp(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
}

export async function pressRemote(page, action) {
  const key = REMOTE_KEYS[action];
  if (!key) throw new Error(`Unsupported RC browser remote action: ${action}`);
  await page.keyboard.press(key);
}

export async function assertViewport(page, expected = { width: 1920, height: 1080 }) {
  assert.deepEqual(page.viewportSize(), expected, 'Playwright viewport does not match the RC qualification viewport.');
  const inner = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  assert.deepEqual(inner, expected, 'CSS viewport does not match the RC qualification viewport.');
}

export function assertNoUnexplainedConsoleErrors(events, { allow = [] } = {}) {
  if (events.leakageEvents.length > 0) {
    throw new Error('Synthetic secret canary reached browser diagnostics.');
  }

  const unexpected = events.console.filter((entry) => {
    if (entry.type !== 'error') return false;
    return !allow.some((pattern) => pattern instanceof RegExp
      ? pattern.test(entry.text)
      : entry.text.includes(String(pattern)));
  });

  if (unexpected.length > 0) {
    throw new Error(`Unexpected browser console errors: ${JSON.stringify(unexpected)}; HTTP errors: ${JSON.stringify(events.httpErrors)}`);
  }
}

export async function snapshotOrdinaryBrowserStorage(page) {
  return page.evaluate(async () => {
    const localStorageKeys = Object.keys(localStorage).sort();
    const sessionStorageKeys = Object.keys(sessionStorage).sort();
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    const indexedDb = [];

    for (const descriptor of databases) {
      if (!descriptor.name) continue;
      const details = await new Promise((resolve) => {
        const request = indexedDB.open(descriptor.name);
        request.onerror = () => resolve({ name: descriptor.name, version: descriptor.version ?? null, stores: [] });
        request.onsuccess = () => {
          const db = request.result;
          const storeNames = Array.from(db.objectStoreNames);
          if (storeNames.length === 0) {
            db.close();
            resolve({ name: descriptor.name, version: db.version, stores: [] });
            return;
          }

          const transaction = db.transaction(storeNames, 'readonly');
          const stores = [];
          let pending = storeNames.length;
          for (const name of storeNames) {
            const countRequest = transaction.objectStore(name).count();
            countRequest.onerror = () => {
              stores.push({ name, count: null });
              pending -= 1;
              if (pending === 0) {
                db.close();
                resolve({ name: descriptor.name, version: db.version, stores: stores.sort((a, b) => a.name.localeCompare(b.name)) });
              }
            };
            countRequest.onsuccess = () => {
              stores.push({ name, count: countRequest.result });
              pending -= 1;
              if (pending === 0) {
                db.close();
                resolve({ name: descriptor.name, version: db.version, stores: stores.sort((a, b) => a.name.localeCompare(b.name)) });
              }
            };
          }
        };
      });
      indexedDb.push(details);
    }

    return {
      localStorage: localStorageKeys,
      sessionStorage: sessionStorageKeys,
      indexedDb: indexedDb.sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

export async function findSecretLeaks(page, canaries = RC_SECRET_CANARIES) {
  return page.evaluate(async (secrets) => {
    const leaks = [];
    const hasSecret = (value) => {
      let text;
      try {
        text = typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        text = String(value);
      }
      return secrets.some((secret) => secret && text.includes(secret));
    };

    if (hasSecret(window.location.href)) leaks.push('url');
    if (hasSecret(document.documentElement.outerHTML)) leaks.push('dom');

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && (hasSecret(key) || hasSecret(localStorage.getItem(key)))) leaks.push(`localStorage:${key}`);
    }
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && (hasSecret(key) || hasSecret(sessionStorage.getItem(key)))) leaks.push(`sessionStorage:${key}`);
    }

    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    for (const descriptor of databases) {
      if (!descriptor.name) continue;
      await new Promise((resolve) => {
        const open = indexedDB.open(descriptor.name);
        open.onerror = () => resolve();
        open.onsuccess = () => {
          const db = open.result;
          const storeNames = Array.from(db.objectStoreNames);
          if (storeNames.length === 0) {
            db.close();
            resolve();
            return;
          }

          const tx = db.transaction(storeNames, 'readonly');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };

          for (const storeName of storeNames) {
            const store = tx.objectStore(storeName);
            const values = store.getAll();
            const keys = store.getAllKeys();
            values.onsuccess = () => {
              if (hasSecret(values.result)) leaks.push(`indexedDb:${descriptor.name}/${storeName}`);
            };
            keys.onsuccess = () => {
              if (hasSecret(keys.result)) leaks.push(`indexedDb:${descriptor.name}/${storeName}:key`);
            };
          }
        };
      });
    }

    return [...new Set(leaks)].sort();
  }, canaries);
}

export async function attachScreenshot(page, testInfo, name) {
  const outputPath = testInfo.outputPath(`${String(name).replace(/[^A-Za-z0-9_.-]+/g, '-')}.png`);
  await page.screenshot({ path: outputPath, fullPage: true });
  await testInfo.attach(name, { path: outputPath, contentType: 'image/png' });
  return outputPath;
}

export { createEvidenceRecord, writeEvidence } from './evidence.mjs';
