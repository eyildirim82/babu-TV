import { getSettings, saveSettings, getActivePlaylist, APP_VERSION } from './config.js';
import { processStreamUrl, parseM3u, fetchPlaylist, escapeHtml } from './utils.js';
import { setConsented } from './update.js';
import * as player from './player.js';
import * as ui from './ui.js';
import { UI_COPY } from './ui/copy.js';

let container = null;
let onPlaylistFetched = null;
let onClose = null;
let onRender = null;
let onXtreamRequested = null;
let editIndex = -1;
let activeSection = 'source';
let focusIdx = 0;
let focusOrder = [];
let addMode = false;
let editMode = false;

const NAV_ITEMS = [
  { id: 'source', icon: '\u{1F4E1}', label: 'Kanal Kaynağı' },
  { id: 'connection', icon: '\u{1F517}', label: 'Bağlantı' },
  { id: 'playback', icon: '\u25B6', label: 'Oynatma' },
  { id: 'about', icon: '\u2139', label: 'Hakkında' },
];

export function init(settingsContainer, callbacks) {
  container = settingsContainer;
  onPlaylistFetched = callbacks.onPlaylistFetched;
  onClose = callbacks.onClose;
  onRender = callbacks.onRender;
  onXtreamRequested = callbacks.onXtreamRequested || null;
}

export function show() {
  if (!container) return;
  editIndex = -1;
  addMode = false;
  editMode = false;
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
    // field act like pressing Enter on a desktop form: advance to the next
    // field, or save from the last field (proxy URL / playlist URL).
    if (el.id === 'settings-proxy-url') {
      handleProxySave();
    } else if (el.id === 'pl-add-name') {
      moveSettingsFocus('pl-add-url');
    } else if (el.id === 'pl-add-url') {
      saveAddPlaylist();
    } else if (el.id === 'pl-edit-name') {
      moveSettingsFocus('pl-edit-url');
    } else if (el.id === 'pl-edit-url') {
      saveEditPlaylist();
    } else {
      el.focus();
    }
    return;
  }

  if (el.id === 'pl-add-btn') {
    addMode = true;
    render();
    applyFocus();
    return;
  }

  // NOTE: only match per-row buttons like "pl-edit-0". The edit form's
  // "pl-edit-save"/"pl-edit-cancel" buttons start with the same prefix and
  // used to be swallowed here, so editing a playlist never saved.
  if (el.id && /^pl-edit-\d+$/.test(el.id)) {
    const idx = parseInt(el.id.split('-')[2], 10);
    editMode = true;
    editIndex = idx;
    render();
    applyFocus();
    return;
  }

  if (el.id && /^pl-delete-\d+$/.test(el.id)) {
    const idx = parseInt(el.id.split('-')[2], 10);
    const p = getSettings().playlists[idx];
    const name = p ? p.name : 'bu oynatma listesi';
    ui.showConfirmDialog(`"${name}" silinsin mi?`, (confirmed) => {
      if (!confirmed) return;
      const playlists = getSettings().playlists.filter((_, j) => j !== idx);
      let active = getSettings().activePlaylistIndex;
      if (active >= playlists.length) active = playlists.length - 1;
      if (active < 0) active = -1;
      saveSettings({ playlists, activePlaylistIndex: active });
      render();
      applyFocus();
    });
    return;
  }

  if (el.id === 'pl-add-save') {
    saveAddPlaylist();
    return;
  }

  if (el.id === 'pl-add-cancel') {
    addMode = false;
    render();
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      activeEl.blur();
    }
    document.body.focus();
    focusIdx = 0;
    applyFocus();
    return;
  }

  if (el.id === 'pl-edit-save') {
    saveEditPlaylist();
    return;
  }

  if (el.id === 'pl-edit-cancel') {
    editMode = false;
    editIndex = -1;
    render();
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      activeEl.blur();
    }
    document.body.focus();
    focusIdx = 0;
    applyFocus();
    return;
  }

  if (el.classList.contains('btn') || el.classList.contains('playlist-entry')) {
    el.click();
    return;
  }
}

// Move focus to another element by id through the normal focus-order machinery.
// Used to make Enter/OK advance from the name field to the URL field.
function moveSettingsFocus(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  buildFocusOrder();
  const idx = focusOrder.indexOf(target);
  if (idx >= 0) {
    focusIdx = idx;
    applyFocus();
  }
}

function saveAddPlaylist() {
  const nameEl = document.getElementById('pl-add-name');
  const urlEl = document.getElementById('pl-add-url');
  const name = nameEl ? nameEl.value.trim() : '';
  const url = urlEl ? urlEl.value.trim() : '';
  if (!url) return;
  const playlists = getSettings().playlists;
  playlists.push({ name: name || 'Adsız', url });
  saveSettings({ playlists, activePlaylistIndex: playlists.length - 1 });
  addMode = false;
  render();
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    activeEl.blur();
  }
  document.body.focus();
  focusIdx = 0;
  applyFocus();
}

function saveEditPlaylist() {
  const nameEl = document.getElementById('pl-edit-name');
  const urlEl = document.getElementById('pl-edit-url');
  const name = nameEl ? nameEl.value.trim() : '';
  const url = urlEl ? urlEl.value.trim() : '';
  if (!url || editIndex < 0) return;
  const playlists = getSettings().playlists;
  playlists[editIndex] = { name: name || 'Adsız', url };
  saveSettings({ playlists });
  editMode = false;
  editIndex = -1;
  render();
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    activeEl.blur();
  }
  document.body.focus();
  focusIdx = 0;
  applyFocus();
}

function buildFocusOrder() {
  focusOrder = [];
  document.querySelectorAll('.nav-item').forEach(el => focusOrder.push(el));
  focusOrder.push(document.getElementById('btn-back'));

  if (activeSection === 'source') {
    if (addMode) {
      focusOrder.push(document.getElementById('pl-add-name'));
      focusOrder.push(document.getElementById('pl-add-url'));
      focusOrder.push(document.getElementById('pl-add-save'));
      focusOrder.push(document.getElementById('pl-add-cancel'));
    } else if (editMode && editIndex >= 0) {
      focusOrder.push(document.getElementById('pl-edit-name'));
      focusOrder.push(document.getElementById('pl-edit-url'));
      focusOrder.push(document.getElementById('pl-edit-save'));
      focusOrder.push(document.getElementById('pl-edit-cancel'));
    } else {
      const s = getSettings();
      for (let i = 0; i < s.playlists.length; i++) {
        const entry = document.getElementById('playlist-entry-' + i);
        if (entry) focusOrder.push(entry);
        const editBtn = document.getElementById('pl-edit-' + i);
        if (editBtn) focusOrder.push(editBtn);
        const deleteBtn = document.getElementById('pl-delete-' + i);
        if (deleteBtn) focusOrder.push(deleteBtn);
      }
      const xtreamBtn = document.getElementById('settings-xtream-btn');
      if (xtreamBtn) focusOrder.push(xtreamBtn);
      const addBtn = document.getElementById('pl-add-btn');
      if (addBtn) focusOrder.push(addBtn);
      focusOrder.push(document.getElementById('settings-fetch-btn'));
    }
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
  const lastFetched = s.channelsFetched ? timeAgo(s.channelsFetched) : 'Hiç';

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
    mainHtml += renderSourceCard(s, lastFetched);
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
    for (let i = 0; i < s.playlists.length; i++) {
      const entry = document.getElementById('playlist-entry-' + i);
      if (entry) {
        entry.addEventListener('click', () => {
          saveSettings({ activePlaylistIndex: i });
          render();
          applyFocus();
        });
      }
      const editBtn = document.getElementById('pl-edit-' + i);
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          editMode = true;
          editIndex = i;
          render();
          applyFocus();
        });
      }
      const deleteBtn = document.getElementById('pl-delete-' + i);
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const p = getSettings().playlists[i];
          const name = p ? p.name : 'bu oynatma listesi';
          ui.showConfirmDialog(`"${name}" silinsin mi?`, (confirmed) => {
            if (!confirmed) return;
            const playlists = getSettings().playlists.filter((_, j) => j !== i);
            let active = getSettings().activePlaylistIndex;
            if (active >= playlists.length) active = playlists.length - 1;
            if (active < 0) active = -1;
            saveSettings({ playlists, activePlaylistIndex: active });
            render();
            applyFocus();
          });
        });
      }
    }
    const addBtn = document.getElementById('pl-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        addMode = true;
        render();
        applyFocus();
      });
    }
    const saveBtn = document.getElementById('pl-add-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const nameEl = document.getElementById('pl-add-name');
        const urlEl = document.getElementById('pl-add-url');
        const name = nameEl ? nameEl.value.trim() : '';
        const url = urlEl ? urlEl.value.trim() : '';
        if (url) {
          const playlists = getSettings().playlists;
          playlists.push({ name: name || 'Adsız', url });
          saveSettings({ playlists, activePlaylistIndex: playlists.length - 1 });
          addMode = false;
          render();
          applyFocus();
        }
      });
    }
    const cancelBtn = document.getElementById('pl-add-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        addMode = false;
        render();
        applyFocus();
      });
    }
    const editSaveBtn = document.getElementById('pl-edit-save');
    if (editSaveBtn) {
      editSaveBtn.addEventListener('click', () => {
        const nameEl = document.getElementById('pl-edit-name');
        const urlEl = document.getElementById('pl-edit-url');
        const name = nameEl ? nameEl.value.trim() : '';
        const url = urlEl ? urlEl.value.trim() : '';
        if (url && editIndex >= 0) {
          const playlists = getSettings().playlists;
          playlists[editIndex] = { name: name || 'Adsız', url };
          saveSettings({ playlists });
          editMode = false;
          editIndex = -1;
          render();
          applyFocus();
        }
      });
    }
    const editCancelBtn = document.getElementById('pl-edit-cancel');
    if (editCancelBtn) {
      editCancelBtn.addEventListener('click', () => {
        editMode = false;
        editIndex = -1;
        render();
        applyFocus();
      });
    }
    document.getElementById('settings-fetch-btn').addEventListener('click', handleFetch);
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

function renderSourceCard(s, lastFetched) {
  let html = '';
  html += '<div class="setting-card">';
  html += '<div class="card-header"><h3><span class="card-icon">\u{1F4E1}</span> Kanal Kaynağı</h3></div>';
  html += '<div class="card-body">';
  html += '<p class="hint" style="margin-bottom:32px;">Kayıtlı oynatma listeleri (' + s.playlists.length + '/8). Birini seçip kanalları yenileyin.</p>';
  if (addMode) {
    html += '<div class="input-group">';
    html += '<label for="pl-add-name">Oynatma Listesi Adı</label>';
    html += '<input id="pl-add-name" class="input-field" type="text" placeholder="Oynatma listem" />';
    html += '</div>';
    html += '<div class="input-group">';
    html += '<label for="pl-add-url">Oynatma Listesi URL\'si</label>';
    html += '<input id="pl-add-url" class="input-field" type="text" placeholder="https://..." />';
    html += '</div>';
    html += '<div class="btn-group">';
    html += '<button id="pl-add-save" class="btn btn-primary">Kaydet</button>';
    html += '<button id="pl-add-cancel" class="btn btn-secondary">' + UI_COPY.cancel + '</button>';
    html += '</div>';
  } else {
    html += '<div class="playlist-list">';
    for (let i = 0; i < s.playlists.length; i++) {
      const p = s.playlists[i];
      const isActive = i === s.activePlaylistIndex;
      if (editMode && editIndex === i) {
        html += '<div id="playlist-entry-' + i + '" class="playlist-entry active">';
        html += '<div class="input-group">';
        html += '<label for="pl-edit-name">Oynatma Listesi Adı</label>';
        html += '<input id="pl-edit-name" class="input-field" type="text" value="' + escapeHtml(p.name || '') + '" placeholder="Oynatma listem" />';
        html += '</div>';
        html += '<div class="input-group">';
        html += '<label for="pl-edit-url">Oynatma Listesi URL\'si</label>';
        html += '<input id="pl-edit-url" class="input-field" type="text" value="' + escapeHtml(p.url || '') + '" placeholder="https://..." />';
        html += '</div>';
        html += '<div class="btn-group">';
        html += '<button id="pl-edit-save" class="btn btn-primary">Kaydet</button>';
        html += '<button id="pl-edit-cancel" class="btn btn-secondary">' + UI_COPY.cancel + '</button>';
        html += '</div>';
        html += '</div>';
      } else {
        html += '<div id="playlist-entry-' + i + '" class="playlist-entry' + (isActive ? ' active' : '') + '">';
        html += '<div class="playlist-header">';
        html += '<span class="playlist-indicator">' + (isActive ? '\u25B6' : '\u25CB') + '</span>';
        html += '<span class="playlist-name">' + escapeHtml(p.name || 'Adsız') + '</span>';
        if (isActive) {
          html += '<span class="selected-badge">\u2713 Seçili</span>';
        }
        html += '</div>';
        html += '<span class="playlist-url">' + escapeHtml(p.url || '') + '</span>';
        html += '<div class="btn-group">';
        html += '<button id="pl-edit-' + i + '" class="btn btn-secondary">Düzenle</button>';
        html += '<button id="pl-delete-' + i + '" class="btn btn-secondary">Sil</button>';
        html += '</div>';
        html += '</div>';
      }
    }
    html += '</div>';
    html += '<div class="btn-group">';
    html += '<button id="settings-xtream-btn" class="btn btn-secondary">' + UI_COPY.xtreamEntry.title + '</button>';
    if (s.playlists.length < 8) {
      html += '<button id="pl-add-btn" class="btn btn-secondary">+ Oynatma Listesi Ekle</button>';
    }
    html += '<button id="settings-fetch-btn" class="btn btn-primary">' + UI_COPY.refreshChannels + '</button>';
    html += '</div>';
    html += '<div id="settings-fetch-status" class="status-info hidden" style="margin-top:24px;"></div>';
    html += '<p class="hint" style="margin-top:32px;">Son yenileme: ' + lastFetched + '</p>';
  }
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

async function handleFetch() {
  const fetchBtn = document.getElementById('settings-fetch-btn');
  const statusEl = document.getElementById('settings-fetch-status');
  if (!statusEl) return;
  const active = getActivePlaylist();
  if (!active || !active.url) {
    statusEl.className = 'status-info';
    statusEl.textContent = 'Önce URL içeren bir oynatma listesi seçin veya ekleyin';
    statusEl.classList.remove('hidden');
    return;
  }
  // Disable button to prevent double-click during fetch
  if (fetchBtn) fetchBtn.disabled = true;
  statusEl.className = 'status-info';
  statusEl.textContent = 'Kanallar yenileniyor…';
  statusEl.classList.remove('hidden');
  try {
    const channels = await fetchPlaylist(active.url);
    saveSettings({ channels, channelsFetched: new Date().toISOString() });
    statusEl.textContent = channels.length + ' kanal yenilendi';
    if (onPlaylistFetched) onPlaylistFetched(channels);
  } catch (e) {
    statusEl.textContent = 'Oynatma listesi yüklenemedi';
  } finally {
    if (fetchBtn) fetchBtn.disabled = false;
  }
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

function timeAgo(isoString) {
  if (!isoString) return 'Hiç';
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'Az önce';
  if (seconds < 60) return seconds + ' sn önce';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + ' dk önce';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' sa önce';
  return new Date(isoString).toLocaleDateString();
}

