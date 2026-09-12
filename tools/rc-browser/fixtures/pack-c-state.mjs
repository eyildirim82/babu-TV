export const STATE_DATABASE_NAME = 'babustv';
export const STATE_DATABASE_VERSION = 2;
export const COLLIDING_CHANNEL_ID = '42';
export const LEGACY_SETTINGS_KEY = 'en_settings';

export const STRUCTURED_STORES = Object.freeze([
  'providers',
  'categories',
  'channels',
  'app_state',
  'epg_programs',
]);

function sortByJson(values) {
  return [...values].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function providerIds(state) {
  return state.providers.map((provider) => provider.id).sort();
}

export function activeProviderId(state) {
  return state.appState.find((record) => record.key === 'activeProviderId')?.activeProviderId ?? null;
}

export function favoriteRecords(state, providerId) {
  return state.appState.filter((record) => record.kind === 'user.favorite.v1'
    && record.providerId === providerId
    && typeof record.channelId === 'string'
    && Number.isFinite(record.addedAtMs));
}

export function lastWatchedRecord(state, providerId) {
  return state.appState.find((record) => record.kind === 'user.watch.last.v1'
    && record.providerId === providerId
    && typeof record.channelId === 'string'
    && Number.isFinite(record.lastPlayedAtMs)) ?? null;
}

export function watchAggregateRecords(state, providerId) {
  return state.appState.filter((record) => record.kind === 'user.watch.aggregate.v1'
    && record.providerId === providerId
    && typeof record.channelId === 'string'
    && Number.isFinite(record.meaningfulWatchMs)
    && Number.isFinite(record.meaningfulOpenCount));
}

export function providerCatalogSummary(state, providerId) {
  return {
    categories: state.categories.filter((record) => record.providerId === providerId).length,
    channels: state.channels.filter((record) => record.providerId === providerId).length,
    epgPrograms: state.epgPrograms.filter((record) => record.providerId === providerId).length,
  };
}

export function durableStateSignature(state) {
  return JSON.stringify({
    providers: sortByJson(state.providers.map((provider) => ({ id: provider.id, kind: provider.kind, name: provider.name }))),
    activeProviderId: activeProviderId(state),
    favorites: sortByJson(state.appState
      .filter((record) => record.kind === 'user.favorite.v1')
      .map((record) => ({ providerId: record.providerId, channelId: record.channelId }))),
    lastWatched: sortByJson(state.appState
      .filter((record) => record.kind === 'user.watch.last.v1')
      .map((record) => ({ providerId: record.providerId, channelId: record.channelId }))),
    watchAggregates: sortByJson(state.appState
      .filter((record) => record.kind === 'user.watch.aggregate.v1')
      .map((record) => ({
        providerId: record.providerId,
        channelId: record.channelId,
        meaningfulWatchMs: record.meaningfulWatchMs,
        meaningfulOpenCount: record.meaningfulOpenCount,
      }))),
    categories: sortByJson(state.categories.map((record) => ({ providerId: record.providerId, id: record.id, key: record.key }))),
    channels: sortByJson(state.channels.map((record) => ({ providerId: record.providerId, id: record.id, key: record.key }))),
    epgPrograms: sortByJson(state.epgPrograms.map((record) => ({ providerId: record.providerId, channelId: record.channelId, key: record.key }))),
  });
}

export async function readSafeStructuredState(page) {
  return page.evaluate(async ({ databaseName, storeNames }) => {
    const openDatabase = () => new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => reject(new Error('structured state open failed'));
      request.onsuccess = () => resolve(request.result);
    });

    const readStore = (database, storeName) => new Promise((resolve) => {
      if (!database.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onerror = () => resolve([]);
      request.onsuccess = () => resolve(request.result ?? []);
    });

    const projectProvider = (value) => ({
      id: typeof value?.id === 'string' ? value.id : null,
      kind: value?.kind === 'xtream' || value?.kind === 'm3u' ? value.kind : null,
      name: typeof value?.name === 'string' ? value.name : null,
      createdAtMs: Number.isFinite(value?.createdAtMs) ? value.createdAtMs : null,
      lastSuccessfulSyncAtMs: value?.lastSuccessfulSyncAtMs === null || Number.isFinite(value?.lastSuccessfulSyncAtMs)
        ? value.lastSuccessfulSyncAtMs
        : null,
      validShape: typeof value?.id === 'string'
        && (value?.kind === 'xtream' || value?.kind === 'm3u')
        && typeof value?.name === 'string'
        && Number.isFinite(value?.createdAtMs)
        && (value?.lastSuccessfulSyncAtMs === null || Number.isFinite(value?.lastSuccessfulSyncAtMs)),
    });

    const projectCategory = (value) => ({
      key: typeof value?.key === 'string' ? value.key : null,
      providerId: typeof value?.providerId === 'string' ? value.providerId : null,
      id: typeof value?.id === 'string' ? value.id : null,
      name: typeof value?.name === 'string' ? value.name : null,
    });

    const projectChannel = (value) => ({
      key: typeof value?.key === 'string' ? value.key : null,
      providerId: typeof value?.providerId === 'string' ? value.providerId : null,
      id: typeof value?.id === 'string' ? value.id : null,
      name: typeof value?.name === 'string' ? value.name : null,
      categoryId: typeof value?.categoryId === 'string' ? value.categoryId : null,
      number: Number.isFinite(value?.number) ? value.number : null,
    });

    const projectAppState = (value) => {
      const key = typeof value?.key === 'string' ? value.key : null;
      const kind = typeof value?.kind === 'string' ? value.kind : null;
      const result = {
        key,
        kind,
        providerId: typeof value?.providerId === 'string' ? value.providerId : null,
        channelId: typeof value?.channelId === 'string' ? value.channelId : null,
        addedAtMs: Number.isFinite(value?.addedAtMs) ? value.addedAtMs : null,
        lastPlayedAtMs: Number.isFinite(value?.lastPlayedAtMs) ? value.lastPlayedAtMs : null,
        meaningfulWatchMs: Number.isFinite(value?.meaningfulWatchMs) ? value.meaningfulWatchMs : null,
        meaningfulOpenCount: Number.isFinite(value?.meaningfulOpenCount) ? value.meaningfulOpenCount : null,
        lastMeaningfulWatchAtMs: value?.lastMeaningfulWatchAtMs === null || Number.isFinite(value?.lastMeaningfulWatchAtMs)
          ? value.lastMeaningfulWatchAtMs
          : null,
        activeProviderId: null,
        activeProviderShapeValid: null,
      };
      if (key === 'activeProviderId') {
        result.activeProviderShapeValid = value?.value === null || typeof value?.value === 'string';
        result.activeProviderId = result.activeProviderShapeValid ? value.value : null;
      }
      return result;
    };

    const projectEpgProgram = (value) => ({
      key: typeof value?.key === 'string' ? value.key : null,
      providerId: typeof value?.providerId === 'string' ? value.providerId : null,
      channelId: typeof value?.channelId === 'string' ? value.channelId : null,
      title: typeof value?.title === 'string' ? value.title : null,
      startMs: Number.isFinite(value?.startMs) ? value.startMs : null,
      endMs: Number.isFinite(value?.endMs) ? value.endMs : null,
    });

    let database;
    try {
      database = await openDatabase();
    } catch {
      return { providers: [], categories: [], channels: [], appState: [], epgPrograms: [] };
    }

    try {
      const [providers, categories, channels, appState, epgPrograms] = await Promise.all(
        storeNames.map((storeName) => readStore(database, storeName)),
      );
      return {
        providers: providers.map(projectProvider),
        categories: categories.map(projectCategory),
        channels: channels.map(projectChannel),
        appState: appState.map(projectAppState),
        epgPrograms: epgPrograms.map(projectEpgProgram),
      };
    } finally {
      database.close();
    }
  }, { databaseName: STATE_DATABASE_NAME, storeNames: STRUCTURED_STORES });
}

export async function injectMalformedStructuredRecords(page) {
  return page.evaluate(async ({ databaseName, databaseVersion }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);
      request.onerror = () => reject(new Error('corrupt-state open failed'));
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(['providers', 'app_state'], 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error('corrupt-state write failed'));
        transaction.onabort = () => reject(new Error('corrupt-state write aborted'));
        transaction.objectStore('providers').put({
          id: 'rc-malformed-provider',
          kind: 'xtream',
          name: 42,
          createdAtMs: 'not-a-number',
          lastSuccessfulSyncAtMs: null,
        });
        transaction.objectStore('app_state').put({
          key: 'user.favorite:["rc-malformed-provider","42"]',
          kind: 'user.favorite.v1',
          providerId: 'rc-malformed-provider',
          channelId: 42,
          addedAtMs: 'not-a-number',
        });
      });
    } finally {
      database.close();
    }
    return { providerKey: 'rc-malformed-provider', appStateKey: 'user.favorite:[malformed]' };
  }, { databaseName: STATE_DATABASE_NAME, databaseVersion: STATE_DATABASE_VERSION });
}

export async function seedLegacyM3uPersistence(page, credentialBearingUrl) {
  await page.evaluate(({ settingsKey, sourceUrl }) => {
    localStorage.setItem(settingsKey, JSON.stringify({
      playlistUrl: sourceUrl,
      playlists: [{ name: 'RC legacy source', url: sourceUrl }],
      activePlaylistIndex: 0,
      channels: [{ id: 'legacy-channel', url: sourceUrl }],
      channelsFetched: true,
      autoQuality: false,
      updateCheck: true,
    }));
    localStorage.setItem('rc-unrelated-preference', 'preserve-me');
  }, { settingsKey: LEGACY_SETTINGS_KEY, sourceUrl: credentialBearingUrl });
}

export async function readLegacyPersistenceSummary(page, credentialBearingUrl) {
  return page.evaluate(({ settingsKey, sourceUrl }) => {
    const raw = localStorage.getItem(settingsKey) ?? '';
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {}
    return {
      sourcePresent: raw.includes(sourceUrl),
      hasPlaylistUrl: Object.prototype.hasOwnProperty.call(parsed, 'playlistUrl'),
      hasPlaylists: Object.prototype.hasOwnProperty.call(parsed, 'playlists') && Array.isArray(parsed.playlists) && parsed.playlists.length > 0,
      hasLegacyChannels: Object.prototype.hasOwnProperty.call(parsed, 'channels'),
      hasChannelsFetched: Object.prototype.hasOwnProperty.call(parsed, 'channelsFetched'),
      unrelatedPreferencePreserved: localStorage.getItem('rc-unrelated-preference') === 'preserve-me',
      ordinaryPreferencePreserved: parsed.autoQuality === false && parsed.updateCheck === true,
    };
  }, { settingsKey: LEGACY_SETTINGS_KEY, sourceUrl: credentialBearingUrl });
}
