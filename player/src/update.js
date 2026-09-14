// Update checker + opt-in usage ping. No network activity happens unless the
// user opted in (asked once on first launch, toggle in Settings → Playback).
// Version metadata comes from a static file on jsDelivr, so no server is
// required. See docs/TELEMETRY.md for the optional ping endpoint.
import { APP_VERSION, getSettings, saveSettings } from './config.js';

const VERSION_URL = 'https://cdn.jsdelivr.net/gh/eyildirim82/babu-TV@main/version.json';
// Deploy the worker in docs/TELEMETRY.md and paste its URL here to enable
// anonymous install counting. Empty = ping disabled, update check still works.
const PING_URL = '';
const CONSENT_KEY = 'en_update_consent';
const CACHE_KEY = 'en_update_cache';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function hasConsented() {
  try {
    return getSettings().updateCheck === true;
  } catch {
    return false;
  }
}

export function consentAsked() {
  try {
    return localStorage.getItem(CONSENT_KEY) !== null;
  } catch {
    return true;
  }
}

export function setConsented(allowed) {
  try {
    localStorage.setItem(CONSENT_KEY, allowed ? '1' : '0');
  } catch {}
  saveSettings({ updateCheck: !!allowed });
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value));
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrereleaseIdentifiers(a, b) {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

// Semver precedence: 1.0.0-rc.1 < 1.0.0-rc.2 < 1.0.0 < 1.10.1. Build metadata
// is ignored, and an unparseable version never ranks as newer.
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    const diff = pa.core[i] - pb.core[i];
    if (diff !== 0) return diff;
  }
  if (!pa.prerelease.length || !pb.prerelease.length) {
    return pb.prerelease.length - pa.prerelease.length;
  }
  const length = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < length; i++) {
    if (pa.prerelease[i] === undefined) return -1;
    if (pb.prerelease[i] === undefined) return 1;
    const diff = comparePrereleaseIdentifiers(pa.prerelease[i], pb.prerelease[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.at > CHECK_INTERVAL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Returns { available, latest, url } or null. Never throws, never blocks
// startup — failures are silent by design.
export async function checkForUpdate() {
  if (!hasConsented()) return null;
  const cached = readCache();
  if (cached) {
    return compareVersions(cached.latest, APP_VERSION) > 0 ? cached : null;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(VERSION_URL + '?_t=' + Date.now(), {
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || typeof data.version !== 'string') return null;
    const result = { available: true, latest: data.version, url: data.url || '' };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...result, at: Date.now() }));
    } catch {}
    return compareVersions(data.version, APP_VERSION) > 0 ? result : null;
  } catch {
    return null;
  }
}

// Anonymous install ping: version + coarse device class only. No-op unless a
// PING_URL is configured and the user consented. Fire-and-forget.
export function sendUsagePing() {
  if (!PING_URL || !hasConsented()) return;
  try {
    const params = new URLSearchParams({
      v: APP_VERSION,
      tv: typeof window !== 'undefined' && window.tizen ? 'tizen' : 'browser',
    });
    fetch(PING_URL + '?' + params.toString(), { mode: 'no-cors', keepalive: true }).catch(() => {});
  } catch {}
}
