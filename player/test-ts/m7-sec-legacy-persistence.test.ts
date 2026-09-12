import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const playerDir = resolve(testDir, '..');
const configPath = resolve(playerDir, 'src/config.js');
const settingsPath = resolve(playerDir, 'src/settings.js');
const appCompositionPath = resolve(playerDir, 'src/app/app-composition.ts');
const browserDependenciesPath = resolve(playerDir, 'src/app/browser-app-dependencies.ts');

const SETTINGS_KEY = 'en_settings';
const SYNTHETIC_URL = 'https://opaque-source.example.invalid/provider-specific-source-id';
const SYNTHETIC_QUERY_URL = 'https://playlist.example.invalid/list.m3u?token=synthetic-token&password=synthetic-password';

class MemoryLocalStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

async function withConfig(
  initialSettings: Record<string, unknown> | null,
  run: (config: {
    getSettings(): Record<string, unknown>;
    saveSettings(partial: Record<string, unknown>): Record<string, unknown>;
    getActivePlaylist(): unknown;
  }, storage: MemoryLocalStorage) => void | Promise<void>,
): Promise<void> {
  const storage = new MemoryLocalStorage();
  if (initialSettings !== null) {
    storage.setItem(SETTINGS_KEY, JSON.stringify(initialSettings));
  }
  storage.setItem('unrelated-local-key', 'preserve-me');

  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const versionDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__APP_VERSION__');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, '__APP_VERSION__', {
    configurable: true,
    value: 'm7-sec-test',
  });

  try {
    const configUrl = `${pathToFileURL(configPath).href}?m7-sec=${Date.now()}-${Math.random()}`;
    const config = await import(configUrl) as {
      getSettings(): Record<string, unknown>;
      saveSettings(partial: Record<string, unknown>): Record<string, unknown>;
      getActivePlaylist(): unknown;
    };
    await run(config, storage);
  } finally {
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', localStorageDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
    if (versionDescriptor) {
      Object.defineProperty(globalThis, '__APP_VERSION__', versionDescriptor);
    } else {
      delete (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__;
    }
  }
}

function persistedSettings(storage: MemoryLocalStorage): Record<string, unknown> {
  const raw = storage.getItem(SETTINGS_KEY);
  assert.notEqual(raw, null);
  return JSON.parse(raw as string) as Record<string, unknown>;
}

void test('M7 SEC legacy Settings no longer combines arbitrary M3U source acceptance with whole-settings localStorage persistence', () => {
  const config = readFileSync(configPath, 'utf8');
  const settings = readFileSync(settingsPath, 'utf8');
  const storesWholeSettings = /localStorage\.setItem\(SETTINGS_KEY,\s*JSON\.stringify\(merged\)\)/.test(config);
  const acceptsArbitraryPlaylistUrl = /playlists\.push\(\{\s*name:[^}]*\burl\s*\}\)/.test(settings)
    || /playlists\[editIndex\]\s*=\s*\{\s*name:[^}]*\burl\s*\}/.test(settings);

  assert.equal(
    storesWholeSettings && acceptsArbitraryPlaylistUrl,
    false,
    'legacy Settings still serializes arbitrary playlist URLs into ordinary localStorage',
  );
});

void test('M7 SEC loading legacy single-playlist state scrubs the full source URL while preserving unrelated preferences', async () => {
  await withConfig({
    playlistUrl: SYNTHETIC_QUERY_URL,
    proxyUrl: 'https://proxy.example.invalid/',
    autoQuality: false,
    updateCheck: true,
  }, (config, storage) => {
    const settings = config.getSettings();
    const raw = storage.getItem(SETTINGS_KEY) ?? '';

    assert.equal(raw.includes(SYNTHETIC_QUERY_URL), false);
    assert.equal(raw.includes('synthetic-token'), false);
    assert.equal(raw.includes('synthetic-password'), false);
    assert.equal(settings.proxyUrl, 'https://proxy.example.invalid/');
    assert.equal(settings.autoQuality, false);
    assert.equal(settings.updateCheck, true);
    assert.equal(storage.getItem('unrelated-local-key'), 'preserve-me');
  });
});

void test('M7 SEC loading legacy playlist-array state removes opaque source credentials categorically rather than rewriting them', async () => {
  await withConfig({
    playlists: [{ name: 'Synthetic', url: SYNTHETIC_URL }],
    activePlaylistIndex: 0,
    autoRefreshPlaylist: false,
  }, (config, storage) => {
    const settings = config.getSettings();
    const persisted = persistedSettings(storage);
    const raw = JSON.stringify(persisted);

    assert.equal(raw.includes(SYNTHETIC_URL), false);
    assert.equal(raw.includes('opaque-source.example.invalid'), false);
    assert.deepEqual(settings.playlists, []);
    assert.equal(settings.activePlaylistIndex, -1);
    assert.equal(settings.autoRefreshPlaylist, false);
    assert.equal(config.getActivePlaylist(), null);
  });
});

void test('M7 SEC future settings writes never persist M3U source fields and still save ordinary preferences', async () => {
  await withConfig(null, (config, storage) => {
    const result = config.saveSettings({
      playlists: [{ name: 'Synthetic', url: SYNTHETIC_QUERY_URL }],
      activePlaylistIndex: 0,
      playlistUrl: SYNTHETIC_URL,
      autoQuality: false,
      proxyUrl: 'https://proxy.example.invalid/',
    });
    const persisted = persistedSettings(storage);
    const raw = JSON.stringify(persisted);

    assert.equal(raw.includes('playlistUrl'), false);
    assert.equal(raw.includes('playlists'), false);
    assert.equal(raw.includes(SYNTHETIC_QUERY_URL), false);
    assert.equal(raw.includes(SYNTHETIC_URL), false);
    assert.equal(persisted.autoQuality, false);
    assert.equal(persisted.proxyUrl, 'https://proxy.example.invalid/');
    assert.deepEqual(result.playlists, []);
    assert.equal(result.activePlaylistIndex, -1);
  });
});

void test('M7 SEC legacy Settings source UI has no local M3U add/edit/fetch credential path while Xtream action remains', () => {
  const settings = readFileSync(settingsPath, 'utf8');

  assert.doesNotMatch(settings, /pl-add-url|pl-edit-url|playlist-url/);
  assert.doesNotMatch(settings, /fetchPlaylist\(active\.url\)|saveSettings\(\{\s*playlists/);
  assert.match(settings, /onXtreamRequested/);
  assert.match(settings, /settings-xtream-btn/);
  assert.doesNotMatch(settings, /data-[^=]*=["'][^"']*(?:playlist|token|password|sourceUrl)/i);
});

void test('M7 SEC modern Provider Core M3U add/edit authority remains present without a legacy-storage migration transaction', () => {
  const composition = readFileSync(appCompositionPath, 'utf8');
  const dependencies = readFileSync(browserDependenciesPath, 'utf8');

  assert.match(composition, /deps\.onboarding\.connectM3u\(input\)/);
  assert.match(composition, /kind:\s*'m3u'/);
  assert.match(composition, /playlistUrl:\s*input\.playlistUrl/);
  assert.match(dependencies, /new M3uOnboardingService/);
  assert.match(dependencies, /connectM3u:\s*async/);
  assert.doesNotMatch(composition, /localStorage/);
  assert.doesNotMatch(dependencies, /localStorage/);
});