import { getSettings, saveSettings, APP_VERSION } from './config.js';
import { escapeHtml } from './utils.js';
import { setConsented } from './update.js';
import * as player from './player.js';
import { UI_COPY } from './ui/copy.js';

let container = null;
let onClose = null;
let onRender = null;
let onXtreamRequested = null;
let activeSection = 'source';
let focusIdx = 0;
let focusOrder = [];

const NAV_ITEMS = [
  { id: 'source', icon: '\u{1F4E1}', label: 'Kanal Kaynağı' },
  { id: 'connection', icon: '\u{1F517}', label: 'Bağlantı' },
  { id: 'playback', icon: '\u25B6', label: 'Oynatma' },
  { id: 'about', icon: '\u2139', label: 'Hakkında' },
];

export function init(settingsContainer, callbacks) {
  container = settingsContainer;
  onClose = callbacks.onClose;
  onRender = callbacks.onRender;
  onXtreamRequested = callbacks.onXtreamRequested || null;
}

export function show() {
  if (!container) return;
  activeSection = 'source';
  focusIdx = 0;
  container.classList.remove('hidden');
  render();
  applyFocus();
}

export function hide() {
  if (!container) return;
  container.classList.add('hidden');
}

export function isVisible() {
  return container && !container.classList.contains('hidden');
}

export function navigate(dir) {
  buildFocusOrder();
  const total = focusOrder.length;
  if (total === 0) return;

  const navCount = document.querySelectorAll('.nav-item').length;
  const cur = document.querySelector('[data-focused]');
  const curIdx = focusOrder.indexOf(cur);
  const inNavZone = curIdx >= 0 && curIdx < navCount;
  const onBackButton = curIdx === navCount;
  const contentStart = navCount + 1; // +1 for back button

  if (dir > 0) {
    // DOWN
    if (inNavZone) {
      if (curIdx === navCount - 1) {
        focusIdx = navCount;
      } else {
        focusIdx = curIdx + 1;
      }
    } else if (onBackButton) {
      focusIdx = contentStart;
    } else if (curIdx >= contentStart) {
      focusIdx = curIdx + 1;
      if (focusIdx >= total) focusIdx = contentStart;
    } else {
      focusIdx = Math.min(total - 1, focusIdx + 1);
    }
  } else {
    // UP
    if (inNavZone) {
      if (curIdx === 0) {
        focusIdx = total - 1;
      } else {
        focusIdx = curIdx - 1;
      }
    } else if (onBackButton) {
      focusIdx = navCount - 1;
    } else if (curIdx >= contentStart) {
      focusIdx = curIdx - 1;
      if (focusIdx < contentStart) focusIdx = total - 1;
    } else {
      focusIdx = Math.max(0, focusIdx - 1);
    }
  }

  applyFocus();
}

export function navigateNav(dir) {
  const cur = document.querySelector('[data-focused]');
  if (!cur) return;

  buildFocusOrder();
  const navCount = document.querySelectorAll('.nav-item').length;
  const curIdx = focusOrder.indexOf(cur);
  const inNavZone = curIdx >= 0 && curIdx < navCount;
  const contentStart = navCount + 1;

  const btnGroup = cur.closest('.btn-group');
  if (btnGroup) {
    const buttons = Array.from(btnGroup.querySelectorAll('.btn'));
    const btnIdx = buttons.indexOf(cur);
    if (btnIdx >= 0) {
      if (dir > 0 && btnIdx < buttons.length - 1) {
        const newIdx = focusOrder.indexOf(buttons[btnIdx + 1]);
        if (newIdx >= 0) { focusIdx = newIdx; applyFocus(); }
        return;
      } else if (dir < 0 && btnIdx > 0) {
        const newIdx = focusOrder.indexOf(buttons[btnIdx - 1]);
        if (newIdx >= 0) { focusIdx = newIdx; applyFocus(); }
        return;
      }
      if (dir < 0 && btnIdx === 0) {
        const tabs = Array.from(document.querySelectorAll('.nav-item'));
        const activeTab = document.querySelector('.nav-item.active');
        const idx = tabs.indexOf(activeTab);
        focusIdx = idx >= 0 ? idx : 0;
        applyFocus();
        return;
      }
      return;
    }
  }

  if (dir > 0) {
    if (inNavZone) {
      focusIdx = contentStart;
      applyFocus();
    }
  } else {
    if (curIdx >= contentStart) {
      const tabs = Array.from(document.querySelectorAll('.nav-item'));
      const activeTab = document.querySelector('.nav-item.active');
      const idx = tabs.indexOf(activeTab);
      focusIdx = idx >= 0 ? idx : 0;
      applyFocus();
    }
  }
}

export function selectFocused() {
  const el = document.querySelector('[data-focused]');
  if (!el) return;

  if (el.classList.contains('nav-item')) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    activeSection = el.dataset.section;
    focusIdx = 0;
    render();
    applyFocus();
    return;
  }

  if (el.id === 'btn-back') {
    if (onClose) onClose();
    return;
  }

  if (el.id === 'settings-xtream-btn') {
    if (onXtreamRequested) onXtreamRequested();
    return;
  }

  if (el.classList.contains('toggle')) {
    // Trigger the click handler registered in render() — it saves the setting
    // and applies it to the player. (classList.toggle alone never persisted.)
    el.click();
    return;
  }

  if (el.tagName === 'INPUT') {
    // On TV the remote layer intercepts Enter/OK and routes it here, so the
    // desktop-only keydown Enter handlers never run. Make OK inside a text
    // field act like pressing Enter on a desktop form.
    if (el.id === 'settings-proxy-url') {
      handleProxySave();
    } else {
      el.focus();
    }
    return;
  }

  if (el.classList.contains('btn')) {
    el.click();
    return;
  }
}

function buildFocusOrder() {
  focusOrder = [];
  document.querySelectorAll('.nav-item').forEach(el => focusOrder.push(el));
  focusOrder.push(document.getElementById('btn-back'));

  if (activeSection === 'source') {
    const xtreamBtn = document.getElementById('settings-xtream-btn');
    if (xtreamBtn) focusOrder.push(xtreamBtn);
  } else if (activeSection === 'connection') {
    focusOrder.push(document.getElementById('settings-proxy-url'));
    focusOrder.push(document.getElementById('settings-proxy-save-btn'));
  } else if (activeSection === 'playback') {
    focusOrder.push(document.getElementById('toggle-autoq'));
    focusOrder.push(document.getElementById('toggle-auto-refresh'));
    focusOrder.push(document.getElementById('toggle-update-check'));
  }
}

function clearFocus() {
  document.querySelectorAll('[data-focused]').forEach(el => el.removeAttribute('data-focused'));
}

function applyFocus() {
  clearFocus();
  buildFocusOrder();
  if (focusIdx >= 0 && focusIdx < focusOrder.length) {
    const el = focusOrder[focusIdx];
    if (el) {
      el.setAttribute('data-focused', '');
      el.scrollIntoView({ block: 'nearest' });
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.focus();
      } else {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          activeEl.blur();
        }
      }
    }
  }
}

function render() {
  const s = getSettings();

  const navHtml = NAV_ITEMS.map(item =>
    '<div class="nav-item' + (activeSection === item.id ? ' active' : '') + '" data-section="' + item.id + '">' +
      '<span class="nav-icon">' + item.icon + '</span> ' + item.label +
    '</div>'
  ).join('');

  let mainHtml = '';
  mainHtml += '<div class="page-title">';
  mainHtml += '<button class="back-btn" id="btn-back">\u2039</button>';
  mainHtml += UI_COPY.settings;
  mainHtml += '</div>';

  if (activeSection === 'source') {
    mainHtml += renderSourceCard();
  } else if (activeSection === 'connection') {
    mainHtml += renderConnectionCard(s);
  } else if (activeSection === 'playback') {
    mainHtml += renderPlaybackCard();
  } else {
    mainHtml += renderAboutCard();
  }

  mainHtml += '<div class="settings-footer">';
  mainHtml += '<span class="footer-info">Tüm ayarlar otomatik kaydedilir</span>';
  mainHtml += '<span class="footer-version">' + APP_VERSION + '</span>';
  mainHtml += '</div>';

  container.innerHTML =
    '<div class="bg-glow"></div>' +
    '<div class="settings-layout">' +
      '<nav class="settings-nav">' +
        '<div class="nav-header">' +
          '<div class="nav-logo">' +
            '<div class="icon">B</div>' +
            '<div class="text">Babuş<span>TV</span></div>' +
          '</div>' +
          '<div class="nav-sub">' + UI_COPY.settings + '</div>' +
        '</div>' +
        '<div class="nav-items">' + navHtml + '</div>' +
      '</nav>' +
      '<main class="settings-main">' + mainHtml + '</main>' +
    '</div>' +
    '<div id="remote-hints">' +
      '<div class="hint-group"><kbd>&#9650;</kbd> <kbd>&#9660;</kbd> <span class="sep">|</span> Gezin</div>' +
      '<div class="hint-group"><kbd>Enter</kbd> <span class="sep">|</span> Seç / Değiştir</div>' +
      '<div class="hint-group"><kbd>&#9664;</kbd> <span class="sep">|</span> Geri</div>' +
      '<div class="hint-group"><kbd>Back</kbd> <span class="sep">|</span> ' + UI_COPY.close + '</div>' +
    '</div>';

  buildFocusOrder();

  document.getElementById('btn-back').addEventListener('click', () => {
    if (onClose) onClose();
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      activeSection = item.dataset.section;
      focusIdx = 0;
      render();
      applyFocus();
    });
  });

  if (activeSection === 'source') {
    const xtreamBtn = document.getElementById('settings-xtream-btn');
    if (xtreamBtn) {
      xtreamBtn.addEventListener('click', () => {
        if (onXtreamRequested) onXtreamRequested();
      });
    }
  } else if (activeSection === 'connection') {
    document.getElementById('settings-proxy-save-btn').addEventListener('click', handleProxySave);
    document.getElementById('settings-proxy-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleProxySave();
    });
  } else if (activeSection === 'playback') {
    document.querySelectorAll('.toggle').forEach(t => {
      t.addEventListener('click', function() {
        this.classList.toggle('on');
        if (this.id === 'toggle-autoq') {
          const enabled = this.classList.contains('on');
          saveSettings({ autoQuality: enabled });
          player.setAutoQuality(enabled);
        } else if (this.id === 'toggle-auto-refresh') {
          const enabled = this.classList.contains('on');
          saveSettings({ autoRefreshPlaylist: enabled });
        } else if (this.id === 'toggle-update-check') {
          const enabled = this.classList.contains('on');
          setConsented(enabled);
        }
      });
    });
  }

  if (typeof onRender === 'function') onRender();
}

function renderSourceCard() {
  let html = '';
  html += '<div class="setting-card">';
  html += '<div class="card-header"><h3><span class="card-icon">\u{1F4E1}</span> Kanal Kaynağı</h3></div>';
  html += '<div class="card-body">';
  html += '<p class="hint" style="margin-bottom:32px;">M3U kaynakları ve kimlik bilgileri Sağlayıcı Yönetimi ekranındaki güvenli sağlayıcı akışıyla yönetilir. Bu ayarlar ekranı kaynak adresi saklamaz.</p>';
  html += '<div class="btn-group">';
  html += '<button id="settings-xtream-btn" class="btn btn-secondary">' + UI_COPY.xtreamEntry.title + '</button>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function renderConnectionCard(s) {
  let html = '';
  html += '<div class="setting-card">';
  html += '<div class="card-header"><h3><span class="card-icon">\u{1F517}</span> Bağlantı</h3><span class="status-dot connected"></span></div>';
  html += '<div class="card-body">';
  html += '<div class="status-row">';
  html += '<span class="status-dot connected"></span>';
  html += '<div><div class="status-info">Proxy Sunucusu</div><div class="status-label">Gereken kanallar için proxy ayarlayın</div></div>';
  html += '</div>';
  html += '<div class="input-group">';
  html += '<label for="settings-proxy-url">Proxy URL\'si</label>';
  html += '<div class="input-row">';
  html += '<input id="settings-proxy-url" class="input-field" type="text" placeholder="http://localhost:5000/proxy/" value="' + escapeHtml(s.proxyUrl || '') + '" />';
  html += '<button id="settings-proxy-save-btn" class="btn btn-primary">Kaydet</button>';
  html += '</div>';
  html += '<div id="settings-proxy-status" class="status-info hidden" style="margin-top:8px;"></div>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function renderPlaybackCard() {
  const s = getSettings();
  const autoQ = s.autoQuality !== false;
  const autoRefresh = s.autoRefreshPlaylist !== false;
  const updateCheck = s.updateCheck === true;
  let html = '';
  html += '<div class="setting-card">';
  html += '<div class="card-header"><h3><span class="card-icon">&#x25B6;</span> Oynatma</h3></div>';
  html += '<div class="card-body">';
  html += '<div class="toggle-row">';
  html += '<div><div class="toggle-label">Otomatik kalite</div><div class="toggle-desc">Bant genişliğine göre çözünürlüğü otomatik ayarla</div></div>';
  html += '<div class="toggle' + (autoQ ? ' on' : '') + '" id="toggle-autoq"><div class="knob"></div></div>';
  html += '</div>';
  html += '<div class="toggle-row">';
  html += '<div><div class="toggle-label">Oynatma listesini otomatik yenile</div><div class="toggle-desc">Uygulama açılışında kaynaktan indirip güncelle</div></div>';
  html += '<div class="toggle' + (autoRefresh ? ' on' : '') + '" id="toggle-auto-refresh"><div class="knob"></div></div>';
  html += '</div>';
  html += '<div class="toggle-row">';
  html += '<div><div class="toggle-label">Güncellemeleri denetle</div><div class="toggle-desc">Yeni sürüm olduğunda anonim olarak bildir</div></div>';
  html += '<div class="toggle' + (updateCheck ? ' on' : '') + '" id="toggle-update-check"><div class="knob"></div></div>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function renderAboutCard() {
  let html = '';
  html += '<div class="setting-card">';
  html += '<div class="card-header"><h3><span class="card-icon">\u2139</span> Hakkında</h3></div>';
  html += '<div class="card-body">';
  html += '<div class="input-group">';
  html += '<label>BabuşTV</label>';
  html += '<div class="hint" style="margin-top:4px;">Tizen TV Uygulaması &middot; Sürüm ' + APP_VERSION + '</div>';
  html += '<div class="hint" style="margin-top:2px;">Samsung Tizen TV\'ler ve masaüstü tarayıcılar için açık kaynak TV oynatıcısı.</div>';
  html += '<div class="hint" style="margin-top:2px;">Shaka Player ve yerel CORS proxy ile çalışır.</div>';
  html += '<div class="hint" style="margin-top:2px;">Yerel oynatma: ' + (player.isNativeAvailable() ? 'kullanılabilir' : 'kullanılamıyor') + '</div>';
  html += '</div>';
  html += '</div></div>';
  return html;
}

function handleProxySave() {
  const proxyInput = document.getElementById('settings-proxy-url');
  const statusEl = document.getElementById('settings-proxy-status');
  if (!proxyInput || !statusEl) return;
  const url = proxyInput.value.trim();
  saveSettings({ proxyUrl: url });
  statusEl.className = 'status-info';
  statusEl.textContent = 'Proxy URL\'si kaydedildi';
  statusEl.classList.remove('hidden');
  setTimeout(() => statusEl.classList.add('hidden'), 2000);
}
