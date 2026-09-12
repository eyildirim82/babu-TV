const SETTINGS_KEY = 'en_settings';
const PROXY_OVERRIDES_KEY = 'en_proxy_overrides';

export const APP_VERSION = __APP_VERSION__;

const settingsDefaults = {
  playlists: [],
  activePlaylistIndex: -1,
  proxyUrl: 'http://localhost:5000/proxy/',
  channels: [],
  channelsFetched: null,
  autoQuality: true,
  autoRefreshPlaylist: true,
  updateCheck: false,
};

const LEGACY_SOURCE_KEYS = [
  'playlistUrl',
  'playlists',
  'activePlaylistIndex',
  'channels',
  'channelsFetched',
];

function asSettingsObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sanitizePersistedSettings(value) {
  const sanitized = { ...asSettingsObject(value) };
  let changed = false;
  for (const key of LEGACY_SOURCE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
      delete sanitized[key];
      changed = true;
    }
  }
  return { sanitized, changed };
}

function withRuntimeDefaults(value) {
  return {
    ...settingsDefaults,
    ...value,
    playlists: [],
    activePlaylistIndex: -1,
    channels: [],
    channelsFetched: null,
  };
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return withRuntimeDefaults({});

    const { sanitized, changed } = sanitizePersistedSettings(JSON.parse(raw));
    if (changed) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));
      } catch {}
    }
    return withRuntimeDefaults(sanitized);
  } catch {
    return withRuntimeDefaults({});
  }
}

export function getActivePlaylist() {
  return null;
}

export function saveSettings(partial) {
  const current = getSettings();
  const { sanitized } = sanitizePersistedSettings({ ...current, ...asSettingsObject(partial) });
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
  return withRuntimeDefaults(sanitized);
}

export function getProxyOverrides() {
  try {
    const raw = localStorage.getItem(PROXY_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setProxyOverride(url, enabled) {
  const overrides = getProxyOverrides();
  overrides[url] = enabled;
  try {
    localStorage.setItem(PROXY_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.warn('Failed to save proxy override:', e);
  }
  return overrides;
}

export default {
  useProxy: true,
  player: {
    streaming: {
      bufferingGoal: 15,
      rebufferingGoal: 5,
      bufferBehind: 30,
      // BUG-021: relay servers rate-limit aggressive clients (403 storms).
      // Fewer parallel/prefetch requests and fewer retries stay under the ban.
      segmentPrefetchLimit: 2,
      retryParameters: {
        maxAttempts: 5,
        baseDelay: 800,
        backoffFactor: 2,
        fuzzFactor: 0.5,
        timeout: 10000,
      },
    },
    abr: {
      enabled: true,
      switchInterval: 3,
      // Upgrade math (SimpleAbrManager): climbs when estimate > nextRung /
      // upgradeTarget, drops when estimate < current / downgradeTarget. So a
      // HIGHER upgradeTarget climbs easier, a HIGHER downgradeTarget drops
      // calmer. (0.6/0.85 had it backwards and ratcheted into SD.)
      bandwidthUpgradeTarget: 0.9,
      bandwidthDowngradeTarget: 0.95,
      // BUG-019: start pessimistic so Auto mode opens on the lowest rung for
      // fast first frame, then ABR ramps up to what the line sustains.
      defaultBandwidthEstimate: 500000,
    },
    manifest: {
      retryParameters: {
        maxAttempts: 3,
        baseDelay: 500,
        backoffFactor: 2,
        fuzzFactor: 0.5,
        timeout: 10000,
      },
      hls: {
        ignoreManifestProgramDateTime: false,
      },
    },
  },
};
