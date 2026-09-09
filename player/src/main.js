import { getSettings, saveSettings, getProxyOverrides, getActivePlaylist, APP_VERSION } from './config.js';
import * as legacyPlayer from './player.js';
import * as legacyAvplay from './avplay.js';
import { createPlaybackService } from './playback/playback-service.ts';
import { createBrowserLiveTvRuntime } from './live-tv/create-live-tv-runtime.ts';
import * as ui from './ui.js';
import * as remote from './remote.js';
import * as settings from './settings.js';
import { UI_COPY } from './ui/copy.js';
import { checkForUpdate, sendUsagePing, consentAsked, hasConsented, setConsented } from './update.js';
import { processStreamUrl, parseM3u, fetchPlaylist as fetchFromPlaylistUrl } from './utils.js';
import {
  createPlatform,
  LEGACY_OPTIONAL_TIZEN_KEYS,
  M3_NUMERIC_TIZEN_KEYS,
} from './platform/create-platform.ts';

const platform = createPlatform(window);
const player = createPlaybackService(legacyPlayer);

let currentIndex = 0;
let channels;
let selectedGroup = null;
let bufferingInterval = null;
let bufferingActive = false;
let cleanupListeners = [];
let pendingPreview = null;
let m3Controller = null;

const actionMap = {
  up: 'UP',
  down: 'DOWN',
  left: 'LEFT',
  right: 'RIGHT',
  select: 'SELECT',
  back: 'BACK',
  channelUp: 'CHANNEL_UP',
  channelDown: 'CHANNEL_DOWN',
};

function handleM3RemoteAction(action, value) {
  if (!m3Controller) return;

  switch (action) {
    case 'digit':
      if (Number.isInteger(value) && value >= 0 && value <= 9) {
        void m3Controller.handleInput({ type: 'DIGIT', digit: value });
      }
      return;
    default: {
      const logicalAction = actionMap[action];
      if (logicalAction) {
        void m3Controller.handleInput({ type: 'ACTION', action: logicalAction });
      }
    }
  }
}

async function tryStartM3LiveTv() {
  let runtime;
  try {
    runtime = await createBrowserLiveTvRuntime({
      indexedDb: window.indexedDB || null,
      widgetData: window.webapis && window.webapis.widgetdata
        ? window.webapis.widgetdata
        : null,
      fetchImpl: window.fetch.bind(window),
      platform,
      document,
      legacyPlayer,
      legacyAvplay,
    });
  } catch {
    return false;
  }

  if (runtime.mode !== 'm3') return false;

  m3Controller = runtime.controller;
  remote.init(handleM3RemoteAction, { numericMode: 'digits' });
  if (platform.capabilities().numericKeys) {
    platform.registerOptionalKeys(M3_NUMERIC_TIZEN_KEYS);
  }

  document.addEventListener('tizenhwkey', (e) => {
    if (e.keyName === 'back') {
      e.preventDefault();
      handleM3RemoteAction('back');
    }
  });

  return true;
}

/* Responsive TV scaling: detect screen size and set CSS variable */
function applyResponsiveScale() {
  const sw = screen.width || 1920;
  const sh = screen.height || 1080;
  const scale = Math.max(sw / 1920, sh / 1080, 1.35);
  document.documentElement.style.setProperty("--tv-scale", scale);
}
applyResponsiveScale();

function getDisplayChannels() {
  if (selectedGroup === 'all' || !selectedGroup) return channels;
  return channels.filter(ch => (ch.group || 'Ungrouped') === selectedGroup);
}

const BOOT_TAGLINE = 'Samsung Tizen için BabuşTV';
let bootShownAt = 0;
const BOOT_MIN_MS = 1500; // logo stays at least this long on every launch
const BOOT_ZOOM_MS = 700; // fly-into-the-logo exit

function showBootSplash(statusText) {
  const el = document.getElementById('boot-splash');
  const statusEl = document.getElementById('boot-status');
  const typeEl = document.getElementById('boot-typewriter');
  const loadingEl = document.getElementById('boot-loading');
  const verEl = document.getElementById('boot-version');
  if (!el) return;
  if (statusEl && statusText) statusEl.textContent = statusText;
  if (verEl) verEl.textContent = 'v' + APP_VERSION;
  if (typeEl) typeEl.textContent = BOOT_TAGLINE;
  if (loadingEl) { loadingEl.style.animation = 'none'; loadingEl.offsetHeight; loadingEl.style.animation = ''; }
  const logo = document.getElementById('boot-logo');
  if (logo) logo.classList.remove('zoom-in');
  el.classList.remove('hidden', 'fade-out', 'zooming');
  bootShownAt = Date.now();
}

function hideBootSplash() {
  const el = document.getElementById('boot-splash');
  if (!el || el.classList.contains('hidden')) return;
  // Hold the logo for a beat, then fly into it before fading the overlay.
  const wait = Math.max(0, BOOT_MIN_MS - (Date.now() - bootShownAt));
  setTimeout(() => {
    el.classList.add('zooming');
    const logo = document.getElementById('boot-logo');
    if (logo) logo.classList.add('zoom-in');
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('fade-out', 'zooming');
        if (logo) logo.classList.remove('zoom-in');
      }, 500);
    }, BOOT_ZOOM_MS);
  }, wait);
}

const LAST_SEEN_KEY = 'en_last_seen_version';

const CHANGELOG = [
  {
    version: '1.10.1',
    sections: [
      { type: 'fixed', items: ['Boş yeni kurulum artık sizi işlevsiz bir sayfada bırakmıyor', 'Çözünürlük rozeti her zaman gerçek kaliteyi gösteriyor', 'Geçmeli taramalı kanallar yerel oynatmayla açılıyor', 'Kararsız aktarımlar yeni bağlantıyla yeniden denenerek toparlanıyor'] },
      { type: 'changed', items: ['Aşamalı yükleme: gösterge, ilk kare, ardından arabelleğe alma', 'Bekleme ipuçlarıyla kanal ve arabelleğe alma bildirimleri', 'Açılışta logo size doğru yakınlaşıyor'] },
    ],
  },
  {
    version: '1.10.0',
    sections: [
      { type: 'added', items: ['İsteğe bağlı güncelleme denetimi — bir kez izin verin, yeni sürümlerden haberdar olun', 'İletişim ve indirme istatistikleri yenilendi'] },
    ],
  },
  {
    version: '1.9.0',
    sections: [
      { type: 'fixed', items: ['Belirteçli canlı oynatma listeleri artık ilk kareden sonra düşmeden oynuyor', 'Erişimi reddedilen kanallar vazgeçmeden önce yeni bağlantıyla yeniden deneniyor', 'Canlı yayın kesintılarında daha anlaşılır mesajlar gösteriliyor'] },
    ],
  },
  {
    version: '1.8.0',
    sections: [
      { type: 'fixed', items: ['Kumandayla yapılan Ayarlar değişiklikleri artık kaydediliyor', 'Ayarlar metin alanında Enter artık TV’de kaydediyor', 'Çöken kanallar uyumluluk modunda otomatik yeniden deneniyor', 'Tanınmayan kanal bağlantıları artık belirlenip doğru şekilde yeniden deneniyor', 'Kanal hata mesajları artık daha doğru'] },
      { type: 'changed', items: ['Proxy ipucu alt orta konuma düzeltildi', 'Ayarlar geri düğmesi aralığı düzeltildi'] },
    ],
  },
  {
    version: '1.7.0',
    sections: [
      { type: 'fixed', items: ['Bazı kanallardaki siyah ekran için yayın biçimi artık otomatik belirleniyor', 'Tarih-saat eşitlemesi gereken HLS yayınları artık doğru çalışıyor', 'Ham TS/MP4 yayın bağlantıları Samsung Tizen’da doğru oynuyor', 'TV kaynaklı video hataları yakalanıp kullanıcıya gösteriliyor', 'Çalışmayacak yayınlar artık daha hızlı sonuçlanıyor'] },
      { type: 'changed', items: ['Hata mesajları daha sade ve anlaşılır hale getirildi', 'Proxy, internet ve çevrimdışı kanal durumları için daha iyi ipuçları eklendi'] },
    ],
  },
  {
    version: '1.6.0',
    sections: [
      { type: 'added', items: ['Logo animasyonu, yazı efekti ve gösterge içeren açılış ekranı', 'Açılış ekranında uygulama sürümü', 'Her güncellemeden sonra bir kez gösterilen Yenilikler penceresi', 'Uygulama açılışında oynatma listesini otomatik yenileme seçeneği'] },
      { type: 'fixed', items: ['Yayın sırasında kanal listesini yenilemedeki aralıklı hata giderildi', 'Aktarım yedeği artık anlamlı hata mesajları gösteriyor', 'Yenileme düğmesi yükleme sırasında devre dışı kalıyor'] },
    ],
  },
  {
    version: '1.5.0',
    sections: [
      { type: 'changed', items: ['Uygulama logosu yeni tasarımla güncellendi'] },
    ],
  },
  {
    version: '1.4.0',
    sections: [
      { type: 'added', items: ['Uzun kanal adları için otomatik kaydırma'] },
      { type: 'fixed', items: ['Kenar çubuğu gezinmesi ve kanal değiştirme iyileştirmeleri'] },
    ],
  },
  {
    version: '1.3.0',
    sections: [
      { type: 'added', items: ['Tüm ekran boyutları için uyarlanabilir TV ölçekleme'] },
    ],
  },
];

function checkWhatsNew() {
  try {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    if (lastSeen === APP_VERSION) return false;
    return true;
  } catch { return true; }
}

function markVersionSeen() {
  try { localStorage.setItem(LAST_SEEN_KEY, APP_VERSION); } catch {}
}

function showWhatsNew() {
  const modal = document.getElementById('whats-new-modal');
  const body = document.getElementById('whats-new-body');
  const verEl = document.getElementById('whats-new-version');
  const closeBtn = document.getElementById('whats-new-close');
  if (!modal || !body) return;

  if (verEl) verEl.textContent = 'v' + APP_VERSION;
  const iconMap = { added: ['\u2713', 'added'], fixed: ['\u26A0', 'fixed'], changed: ['\u2192', 'changed'] };
  let html = '';
  if (pendingUpdate) {
    html += '<div class="wn-section">';
    html += '<div class="wn-section-title">Yeni sürüm: v' + pendingUpdate.latest + '</div>';
    html += '<div class="wn-item"><span class="wn-icon added">\u2192</span><span>Güncellemek için Apps2Samsung üzerinden yeniden kurun.</span></div>';
    html += '</div>';
  }
  for (const entry of CHANGELOG) {
    if (entry.version === '1.0.0') break;
    html += '<div class="wn-section">';
    html += '<div class="wn-section-title">v' + entry.version + '</div>';
    for (const sec of entry.sections) {
      const [icon, cls] = iconMap[sec.type] || ['\u2022', 'added'];
      for (const item of sec.items) {
        html += '<div class="wn-item"><span class="wn-icon ' + cls + '">' + icon + '</span><span>' + item + '</span></div>';
      }
    }
    html += '</div>';
  }
  body.innerHTML = html;
  modal.classList.remove('hidden');
  // Focus the button for remote/keyboard navigation
  closeBtn.focus();
  // Also handle keyboard Enter/Escape for desktop
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      document.removeEventListener('keydown', onKey);
      closeWhatsNew();
    }
  };
  document.addEventListener('keydown', onKey);
}

function hideBootSplashAndMaybeWhatsNew() {
  hideBootSplash();
  if (checkWhatsNew()) {
    setTimeout(showWhatsNew, 600);
  }
}

function isWhatsNewOpen() {
  const el = document.getElementById('whats-new-modal');
  return el && !el.classList.contains('hidden');
}

function closeWhatsNew() {
  const modal = document.getElementById('whats-new-modal');
  if (modal) modal.classList.add('hidden');
  markVersionSeen();
}

async function init() {
  const videoEl = document.getElementById('video');
  if (!await player.initPlayer(videoEl)) {
    document.body.innerHTML =
      '<div style="text-align:center;padding:40px;color:#fff;">' +
      '<h2>Uygulama başlatılamadı</h2>' +
      '<p>Cihazınız bu uygulamanın ihtiyaç duyduğu video oynatmayı desteklemiyor. Uygulamayı yeniden başlatmayı veya TV yazılımını güncellemeyi deneyin.</p>' +
      '</div>';
    return;
  }

  if (await tryStartM3LiveTv()) {
    return;
  }

  remote.init(handleRemoteAction);
  


  platform.registerOptionalKeys(LEGACY_OPTIONAL_TIZEN_KEYS);

  document.addEventListener('tizenhwkey', (e) => {
    if (e.keyName === 'back') {
      e.preventDefault();
      handleRemoteAction('back');
    }
  });

  const s = getSettings();
  const activePlaylist = getActivePlaylist();

  const autoRefresh = s.autoRefreshPlaylist !== false;

  if (autoRefresh && activePlaylist && activePlaylist.url) {
    // Auto-refresh: always fetch fresh playlist on boot.
    if (s.channels && s.channels.length > 0) {
      // Cached channels available — show instantly, refresh in background.
      channels = s.channels;
      startPlayer();
      showBootSplash('Kanallar yenileniyor…');
      refreshChannelsInBackground().then(() => hideBootSplashAndMaybeWhatsNew());
    } else {
      // No cached channels — show splash while fetching.
      showBootSplash(UI_COPY.preparing);
      try {
        const newChannels = await fetchFromPlaylistUrl(activePlaylist.url);
        applyProxyOverrides(newChannels);
        saveSettings({ channels: newChannels, channelsFetched: new Date().toISOString() });
        channels = newChannels;
        hideBootSplashAndMaybeWhatsNew();
        startPlayer();
      } catch (e) {
        console.warn('Failed to fetch playlist:', e.message);
        hideBootSplashAndMaybeWhatsNew();
        showFirstLaunch();
      }
    }
  } else if (s.channels && s.channels.length > 0) {
    // Auto-refresh OFF: load from localStorage only, no network fetch —
    // still flash the logo intro so every launch feels the same.
    channels = s.channels;
    startPlayer();
    showBootSplash(UI_COPY.loading);
    hideBootSplashAndMaybeWhatsNew();
  } else if (activePlaylist && activePlaylist.url) {
    // No cached channels but has playlist URL — fetch once to bootstrap.
    showBootSplash('Oynatma listesi yükleniyor…');
    try {
      const newChannels = await fetchFromPlaylistUrl(activePlaylist.url);
      applyProxyOverrides(newChannels);
      saveSettings({ channels: newChannels, channelsFetched: new Date().toISOString() });
      channels = newChannels;
      hideBootSplashAndMaybeWhatsNew();
      startPlayer();
    } catch (e) {
      console.warn('Failed to fetch playlist:', e.message);
      hideBootSplashAndMaybeWhatsNew();
      showFirstLaunch();
    }
  } else {
    showFirstLaunch();
  }


}

function cleanupEventListeners() {
  cleanupListeners.forEach(({ element, event, handler }) => {
    if (element && element.removeEventListener) {
      element.removeEventListener(event, handler);
    }
  });
  cleanupListeners = [];
  if (bufferingInterval) {
    clearInterval(bufferingInterval);
    bufferingInterval = null;
  }
}

function addCleanupListener(element, event, handler) {
  if (element && element.addEventListener) {
    element.addEventListener(event, handler);
    cleanupListeners.push({ element, event, handler });
  }
}

function startPlayer() {
  // BUG-018: must also initialize the shell with zero channels. Otherwise a
  // fresh install that backs out of Settings lands on a dead player page
  // (no UI wiring, Settings unreachable).
  channels = channels || [];

  cleanupEventListeners();
  sortChannels(channels);

  settings.init(document.getElementById('settings-page'), {
    onPlaylistFetched: (newChannels) => {
      sortChannels(newChannels);
      applyProxyOverrides(newChannels);
      channels = newChannels;
      ui.refreshChannelList(channels);
      settings.hide();
      ui.stopInactivityTimer();
      showPlayer();
    },
    onClose: () => {
      settings.hide();
      ui.stopInactivityTimer();
      showPlayer();
    },
  });

  ui.init(channels, handleChannelSelect);

  ui.setAutoCloseCallback(() => {
    if (settings.isVisible()) {
      settings.hide();
      showPlayer();
      ui.stopInactivityTimer();
    }
  });

  ui.setResolutionCallback((height) => {
    player.selectResolution(height);
    updateResolutionBadge(height || player.getActiveHeight());
  });

  let playPauseButton = document.getElementById('playpause-button');
  if (playPauseButton) {
    addCleanupListener(playPauseButton, 'click', (e) => {
      e.stopPropagation();
      player.togglePlay();
    });
  }

  let refreshStreamBtn = document.getElementById('refresh-stream-btn');
  if (refreshStreamBtn) {
    addCleanupListener(refreshStreamBtn, 'click', () => {
      showProgress(UI_COPY.reloadStream);
      player.reloadChannel();
    });
  }
  let refreshChannelsBtn = document.getElementById('refresh-channels-btn');
  if (refreshChannelsBtn) {
    addCleanupListener(refreshChannelsBtn, 'click', async () => {
      showProgress(UI_COPY.refreshChannels);
      await refreshChannels();
      hideProgress();
    });
  }

  let toggleProxyBtn = document.getElementById('toggle-proxy-btn');
  if (toggleProxyBtn) {
    addCleanupListener(toggleProxyBtn, 'click', () => {
      ui.toggleCurrentChannelProxy();
    });
  }

  let settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    addCleanupListener(settingsBtn, 'click', () => {
      showSettingsPage();
    });
  }

  let videoEl = document.getElementById('video');
  addCleanupListener(videoEl, 'playing', () => { hideProgress(); ui.hideBuffering(); });
  addCleanupListener(videoEl, 'click', () => player.togglePlay());

  addCleanupListener(videoEl, 'play', () => {
    let btn = document.getElementById('playpause-button');
    if (btn) btn.innerHTML = '&#10073;&#10073;';
  });
  addCleanupListener(videoEl, 'pause', () => {
    let btn = document.getElementById('playpause-button');
    if (btn) btn.innerHTML = '&#9654;';
  });

  addCleanupListener(document, 'fullscreenchange', () => {
    if (!document.fullscreenElement && ui.isFullscreenMode()) {
      ui.exitFullscreenMode();
    }
  });

  player.onBuffering((buffering, percent) => {
    bufferingActive = buffering;
    if (buffering) {
      const p = percent != null ? percent : player.getBufferingPercent();
      ui.showBuffering(p);
      updateProgressPercent(p);
    } else {
      ui.hideBuffering();
    }
  });
  bufferingInterval = setInterval(() => {
    if (bufferingActive) {
      ui.updateBuffering(player.getBufferingPercent());
    }
  }, 500);

  player.onTrackChange(({ height, bandwidth }) => updateResolutionBadge(height, bandwidth));

  player.onChannelAdvance(() => {
    const next = (currentIndex + 1) % channels.length;
    ui.selectChannel(next);
  });

  player.onProxySuggestion(() => {
    ui.showProxyToast();
  });

  ui.setProxyToggleCallback(() => {
    player.reloadChannel();
  });

  if (channels.length === 0) {
    showEmptyState();
    return;
  }
  ui.selectChannel(0, true);
}

function showEmptyState() {
  showPlayer();
  const nameEl = document.getElementById('channel-name');
  if (nameEl) nameEl.textContent = UI_COPY.noChannel;
  const infoEl = document.getElementById('channel-info');
  if (infoEl) infoEl.textContent = 'Oynatma listesi eklemek için ' + UI_COPY.settings + ' bölümünü açın';
}

let pendingUpdate = null;

function runUpdateCheck() {
  sendUsagePing();
  checkForUpdate().then((info) => {
    if (info) {
      pendingUpdate = info;
      ui.setUpdateBadge(true);
    }
  });
}

// Gentle, non-blocking: ask once, otherwise check silently in background.
function scheduleUpdateCheck() {
  setTimeout(() => {
    if (!consentAsked()) {
      ui.showConfirmDialog('Uygulama açılırken güncellemeler denetlensin mi? Yalnızca anonim sürüm kontrolü yapılır; kişisel veri gönderilmez.', (ok) => {
        setConsented(ok === true);
        if (ok === true) runUpdateCheck();
      });
    } else if (hasConsented()) {
      runUpdateCheck();
    }
  }, 1500);
}

function showFirstLaunch() {
  hidePlayer();

  settings.init(document.getElementById('settings-page'), {
    onPlaylistFetched: (newChannels) => {
      try {
        sortChannels(newChannels);
        applyProxyOverrides(newChannels);
        channels = newChannels;
        settings.hide();
        showPlayer();
        startPlayer();
      } catch (e) {
        console.error('Failed to start player after fetch:', e);
      }
    },
    onClose: () => {
      // BUG-018: backing out with no playlist must land on a working shell,
      // not a dead page — startPlayer() handles the empty case.
      settings.hide();
      if (channels && channels.length > 0) {
        showPlayer();
      } else {
        startPlayer();
      }
    },
  });

  document.body.style.overflow = 'hidden';
  settings.show();
}

function showPlayer() {
  document.body.style.overflow = '';
  const playerContainer = document.getElementById('player-container');
  const nowPlaying = document.getElementById('now-playing');
  if (playerContainer) playerContainer.classList.remove('hidden');
  if (nowPlaying) nowPlaying.classList.remove('hidden');
  ui.showSidebarWithContent();
}

function hidePlayer() {
  const playerContainer = document.getElementById('player-container');
  const nowPlaying = document.getElementById('now-playing');
  const sidebar = document.getElementById('sidebar');
  if (playerContainer) playerContainer.classList.add('hidden');
  if (nowPlaying) nowPlaying.classList.add('hidden');
  if (sidebar) sidebar.classList.add('closed');
}

function showSettingsPage() {
  const playerContainer = document.getElementById('player-container');
  const nowPlaying = document.getElementById('now-playing');
  if (playerContainer) playerContainer.classList.add('hidden');
  if (nowPlaying) nowPlaying.classList.add('hidden');
  if (ui.isFullscreenMode()) {
    ui.exitFullscreenMode();
  }
  ui.closeAllOverlays();
  ui.stopCursorAutoHide();
  ui.stopInactivityTimer();
  document.body.style.overflow = 'hidden';
  settings.show();
}

async function handleChannelSelect(channel) {
  ui.hideProxyToast();
  ui.setBufferingChannel(channel && channel.name);
  ui.showChannelToast();
  currentIndex = channels.indexOf(channel);
  const ok = await player.loadChannel(channel);
  if (!ok) {
    hideProgress();
    ui.hideBuffering();
  } else if (!bufferingActive) {
    // Fast channel: loaded with nothing left to buffer — drop the name toast.
    ui.hideBuffering();
  }
  ui.setSelectedResolution('auto');
  const p = player.getPlayer();
  if (p) {
    ui.setResolutions(player.getResolutions());
    const height = player.getActiveHeight();
    if (height) updateResolutionBadge(height);
  }
}

const labelMap = [
  [480, 'SD'],
  [720, 'HD'],
  [1080, 'FHD'],
  [1440, '2K'],
  [2160, '4K'],
];

function getResolutionLabel(height) {
  if (!height) return 'Otomatik';
  for (const [max, label] of labelMap) {
    if (height <= max) return label;
  }
  return '8K';
}

function formatBandwidth(bps) {
  if (!bps || bps <= 0) return '';
  const mbps = (bps / 1000000).toFixed(1);
  return ' \u2022 ' + mbps + ' Mbps';
}

function updateResolutionBadge(height, bandwidth) {
  const el = document.getElementById('resolution-badge');
  if (!el) return;
  const label = getResolutionLabel(height);
  const bw = bandwidth || player.getActiveBandwidth();
  el.textContent = label + formatBandwidth(bw);
  el.classList.remove('hidden');
}

let progressActive = false;

function showProgress(text) {
  const el = document.getElementById('progress-toast');
  if (!el) return;
  progressActive = true;
  el.classList.remove('hidden');
  document.getElementById('progress-text').textContent = text;
}

function updateProgressPercent(percent) {
  if (!progressActive) return;
  const el = document.getElementById('progress-text');
  if (el && typeof percent === 'number') {
    el.textContent = UI_COPY.recovering + ' ' + percent + '%';
  }
}

function hideProgress() {
  progressActive = false;
  const el = document.getElementById('progress-toast');
  if (el) el.classList.add('hidden');
}

let lastBackTime = 0;

async function refreshChannelsInBackground() {
  const active = getActivePlaylist();
  if (!active || !active.url) return;
  try {
    const newChannels = await fetchFromPlaylistUrl(active.url);
    applyProxyOverrides(newChannels);
    saveSettings({ channels: newChannels, channelsFetched: new Date().toISOString() });
    sortChannels(newChannels);
    channels = newChannels;
    ui.refreshChannelList(channels);

  } catch (e) {
    console.warn('Background playlist refresh failed:', e.message);
  }
}

function handleRemoteAction(action, value) {
  if (action === 'back') {
    const now = Date.now();
    if (now - lastBackTime < 600) return;
    lastBackTime = now;
  }
  if (isWhatsNewOpen()) {
    switch (action) {
      case 'select':
      case 'back':
        closeWhatsNew();
        break;
    }
    return;
  }
  if (ui.isDialogOpen()) {
    switch (action) {
      case 'left':
      case 'right':
        ui.dialogNavigate(action === 'right' ? 1 : -1);
        break;
      case 'up':
      case 'down':
        ui.dialogNavigate(action === 'down' ? 1 : -1);
        break;
      case 'select':
        ui.dialogSelect();
        break;
      case 'back':
        ui.hideConfirmDialog();
        break;
      default:
        break;
    }
    return;
  }

  if (settings.isVisible()) {
    switch (action) {
      case 'up':
        settings.navigate(-1);
        break;
      case 'down':
        settings.navigate(1);
        break;
      case 'left':
        settings.navigateNav(-1);
        break;
      case 'right':
        settings.navigateNav(1);
        break;
      case 'select':
        settings.selectFocused();
        break;
      case 'back':
        settings.hide();
        // BUG-018: with no playlist yet, initialize the empty shell so the
        // sidebars and Settings stay reachable.
        if (channels && channels.length > 0) {
          showPlayer();
        } else {
          startPlayer();
        }
        ui.stopInactivityTimer();
        break;
    }
    return;
  }

  if (ui.isRightSidebarOpen()) {
    switch (action) {
      case 'up':
        ui.rightSidebarNavigateUp();
        break;
      case 'down':
        ui.rightSidebarNavigateDown();
        break;
      case 'select':
        ui.rightSidebarSelect();
        break;
      case 'back':
        ui.toggleRightSidebar();
        return;
      case 'left':
        ui.toggleRightSidebar();
        ui.toggleSidebar();
        break;
      case 'right':
        break;
      default:
        break;
    }
    return;
  }

  if (ui.isSidebarOpen()) {
    const mode = ui.getSidebarMode();
    if (mode === 'groups') {
      switch (action) {
        case 'up':
          ui.navigateGroupUp();
          break;
        case 'down':
          ui.navigateGroupDown();
          break;
        case 'select':
          ui.selectFocusedGroup();
          break;
        case 'left':
          break;
        case 'right':
          ui.toggleSidebar();
          ui.toggleRightSidebar();
          break;
        case 'back':
          ui.toggleSidebar();
          break;
        case 'number':
          ui.jumpToNumber(value);
          break;
        default:
          break;
      }
    } else {
      switch (action) {
        case 'up':
          ui.navigateUp();
          break;
        case 'down':
          ui.navigateDown();
          break;
        case 'select':
          ui.selectFocused();
          break;
        case 'left':
          if (ui.getGroups().length > 0) {
            ui.showGroupList();
          } else {
            ui.toggleSidebar();
          }
          break;
        case 'right':
          ui.toggleSidebar();
          ui.toggleRightSidebar();
          break;
        case 'back':
          ui.toggleSidebar();
          break;
        case 'playpause':
          player.togglePlay();
          break;
        case 'number':
          ui.jumpToNumber(value);
          break;
        case 'reload':
          player.reloadChannel();
          break;
        default:
          break;
      }
    }
    selectedGroup = ui.getSelectedGroup();
    currentIndex = ui.getCurrentIndex();
    return;
  }

  switch (action) {
    case 'up':
    case 'channelUp':
    case 'prev': {
      const displayChannels = getDisplayChannels();
      const currentDisplayIdx = displayChannels.indexOf(channels[currentIndex]);
      const idx = currentDisplayIdx >= 0 ? currentDisplayIdx : 0;
      const prev = (idx - 1 + displayChannels.length) % displayChannels.length;
      const prevChannel = displayChannels[prev];
      currentIndex = channels.indexOf(prevChannel);
      ui.selectChannel(currentIndex, true);
      ui.showChannelPreview(prevChannel, 'up');
      break;
    }
    case 'down':
    case 'channelDown':
    case 'next': {
      const displayChannels = getDisplayChannels();
      const currentDisplayIdx = displayChannels.indexOf(channels[currentIndex]);
      const idx = currentDisplayIdx >= 0 ? currentDisplayIdx : 0;
      const next = (idx + 1) % displayChannels.length;
      const nextChannel = displayChannels[next];
      currentIndex = channels.indexOf(nextChannel);
      ui.selectChannel(currentIndex, true);
      ui.showChannelPreview(nextChannel, 'down');
      break;
    }
    case 'left':
      ui.toggleSidebar();
      break;
    case 'right':
      ui.toggleRightSidebar();
      break;
    case 'select':
      ui.toggleSidebar();
      break;
    case 'back':
      ui.showConfirmDialog('Uygulamadan çıkılsın mı?', (confirmed) => {
        if (confirmed) {
          platform.exitApp();
        }
      });
      break;
    case 'playpause':
    case 'play':
    case 'pause':
      player.togglePlay();
      break;
    case 'stop':
      player.stop();
      ui.toggleSidebar();
      break;
    case 'red':
      // Reserved for future use
      break;
    case 'green':
      if (!ui.isSidebarOpen()) {
        ui.toggleSidebar();
      } else if (ui.getSidebarMode() !== 'groups' && ui.getGroups().length > 0) {
        ui.showGroupList();
      }
      break;
    case 'yellow':
      ui.toggleCurrentChannelProxy();
      break;
    case 'blue':
      showSettingsPage();
      break;
    case 'number':
      ui.jumpToNumber(value, true);
      break;
    case 'reload':
      player.reloadChannel();
      break;
    default:
      break;
  }
}

function sortChannels(ch) {
  if (!ch || !ch.length) return;
  ch.sort((a, b) => {
    if (!a || !b) return 0;
    // Sort by group first, then alphabetically by name within group
    const aGroup = (a.group || 'Ungrouped').toLowerCase();
    const bGroup = (b.group || 'Ungrouped').toLowerCase();
    if (aGroup !== bGroup) return aGroup.localeCompare(bGroup);
    return (a.name || '').localeCompare(b.name || '');
  });
}

function applyProxyOverrides(channels) {
  const overrides = getProxyOverrides();
  for (const ch of channels) {
    if (ch.url in overrides) {
      ch.useProxy = overrides[ch.url];
      if (ch.useProxy && !ch.proxyUrl) {
        ch.proxyUrl = window.location.origin + '/proxy/';
      }
    }
  }
}

export async function refreshChannels() {
  const active = getActivePlaylist();
  if (active && active.url) {
    try {
      const newChannels = await fetchFromPlaylistUrl(active.url);
      applyProxyOverrides(newChannels);
      saveSettings({ channels: newChannels, channelsFetched: new Date().toISOString() });
      sortChannels(newChannels);
      channels = newChannels;
      ui.refreshChannelList(channels);

    } catch (e) {
      console.warn('Failed to refresh from playlist:', e.message);
    }
  }
}



if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
