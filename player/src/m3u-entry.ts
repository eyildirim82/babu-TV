import { ProviderError, type ProviderErrorCode } from './providers/errors.js';
import {
  validateM3uEntry,
  type M3uEntryInput,
  type M3uEntryValidationErrorCode,
} from './providers/m3u/m3u-entry-validation.js';

export type M3uEntrySubmission = M3uEntryInput;

export interface M3uEntryCallbacks {
  onSubmit(input: M3uEntrySubmission): Promise<void>;
  onBack(): void;
}

export type M3uEntryAction = 'up' | 'down' | 'select' | 'back';

export const M3U_ENTRY_FOCUS_IDS = Object.freeze([
  'm3u-playlist-url',
  'm3u-connect',
  'm3u-back',
] as const);

const M3U_ENTRY_COPY = Object.freeze({
  title: 'M3U oynatma listesi',
  playlistUrl: "Oynatma listesi URL'si",
  connect: 'Bağlan',
  back: 'Geri',
  required: "Oynatma listesi URL'si gerekli.",
  invalidUrl: "Geçerli bir oynatma listesi URL'si girin.",
  unsupportedProtocol: 'Yalnızca HTTP veya HTTPS adresleri desteklenir.',
  connecting: 'Oynatma listesi ekleniyor…',
  success: 'Oynatma listesi eklendi.',
  auth: 'Oynatma listesine erişim reddedildi.',
  network: 'Oynatma listesine ulaşılamadı.',
  timeout: 'Oynatma listesi bağlantısı zaman aşımına uğradı.',
  notFound: 'Oynatma listesi bulunamadı.',
  server: 'Sunucu geçici bir hata döndürdü.',
  malformed: 'Oynatma listesi okunamadı.',
  unavailable: 'Oynatma listesi eklenemedi.',
});

export function m3uEntryValidationMessageForCode(
  code: M3uEntryValidationErrorCode,
): string {
  switch (code) {
    case 'REQUIRED':
      return M3U_ENTRY_COPY.required;
    case 'INVALID_URL':
      return M3U_ENTRY_COPY.invalidUrl;
    case 'UNSUPPORTED_PROTOCOL':
      return M3U_ENTRY_COPY.unsupportedProtocol;
  }
}

export function m3uEntryProviderMessageForCode(code: ProviderErrorCode): string {
  switch (code) {
    case 'AUTH':
      return M3U_ENTRY_COPY.auth;
    case 'NETWORK':
      return M3U_ENTRY_COPY.network;
    case 'TIMEOUT':
      return M3U_ENTRY_COPY.timeout;
    case 'NOT_FOUND':
      return M3U_ENTRY_COPY.notFound;
    case 'SERVER':
      return M3U_ENTRY_COPY.server;
    case 'MALFORMED':
      return M3U_ENTRY_COPY.malformed;
    case 'UNAVAILABLE':
    default:
      return M3U_ENTRY_COPY.unavailable;
  }
}

export function renderM3uEntryMarkup(): string {
  return [
    '<section id="m3u-entry-page" class="m3u-entry-page">',
    `<h1>${M3U_ENTRY_COPY.title}</h1>`,
    `<label for="m3u-playlist-url">${M3U_ENTRY_COPY.playlistUrl}</label>`,
    '<input id="m3u-playlist-url" type="url" autocomplete="off">',
    `<button id="m3u-connect" type="button">${M3U_ENTRY_COPY.connect}</button>`,
    `<button id="m3u-back" type="button">${M3U_ENTRY_COPY.back}</button>`,
    '<div id="m3u-status" aria-live="polite"></div>',
    '</section>',
  ].join('');
}

function appendTextElement(
  document: Document,
  parent: HTMLElement,
  tag: string,
  text: string,
  className?: string,
): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}

function appendUrlInput(
  document: Document,
  parent: HTMLElement,
  id: string,
  labelText: string,
): HTMLInputElement {
  const label = document.createElement('label');
  label.textContent = labelText;
  label.setAttribute('for', id);
  parent.appendChild(label);

  const input = document.createElement('input');
  input.id = id;
  input.type = 'url';
  input.autocomplete = 'off';
  input.className = 'm3u-entry-input';
  parent.appendChild(input);
  return input;
}

function appendButton(
  document: Document,
  parent: HTMLElement,
  id: string,
  text: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = text;
  button.className = 'm3u-entry-button';
  parent.appendChild(button);
  return button;
}

export class M3uEntryView {
  private focusIndex = 0;
  private pending = false;

  constructor(
    private readonly document: Document,
    private readonly callbacks: M3uEntryCallbacks,
  ) {}

  show(): void {
    if (this.isVisible()) {
      this.focusIndex = 0;
      this.applyFocus();
      return;
    }

    const root = this.document.createElement('section');
    root.id = 'm3u-entry-page';
    root.className = 'm3u-entry-page';

    const panel = this.document.createElement('div');
    panel.className = 'm3u-entry-panel';
    root.appendChild(panel);

    appendTextElement(
      this.document,
      panel,
      'h1',
      M3U_ENTRY_COPY.title,
      'm3u-entry-title',
    );
    appendUrlInput(
      this.document,
      panel,
      'm3u-playlist-url',
      M3U_ENTRY_COPY.playlistUrl,
    );

    const actions = this.document.createElement('div');
    actions.className = 'm3u-entry-actions';
    panel.appendChild(actions);
    appendButton(this.document, actions, 'm3u-connect', M3U_ENTRY_COPY.connect);
    appendButton(this.document, actions, 'm3u-back', M3U_ENTRY_COPY.back);

    const status = this.document.createElement('div');
    status.id = 'm3u-status';
    status.className = 'm3u-entry-status';
    status.setAttribute('aria-live', 'polite');
    panel.appendChild(status);

    this.document.body.appendChild(root);
    this.focusIndex = 0;
    this.pending = false;
    this.applyFocus();
  }

  hide(): void {
    this.document.getElementById('m3u-entry-page')?.remove();
    this.focusIndex = 0;
    this.pending = false;
  }

  isVisible(): boolean {
    return this.document.getElementById('m3u-entry-page') !== null;
  }

  handleAction(action: M3uEntryAction): void {
    if (!this.isVisible()) return;

    if (action === 'back') {
      if (!this.pending) this.callbacks.onBack();
      return;
    }

    if (action === 'up' || action === 'down') {
      const delta = action === 'up' ? -1 : 1;
      this.focusIndex = Math.max(
        0,
        Math.min(M3U_ENTRY_FOCUS_IDS.length - 1, this.focusIndex + delta),
      );
      this.applyFocus();
      return;
    }

    if (action !== 'select') return;
    const id = M3U_ENTRY_FOCUS_IDS[this.focusIndex];
    if (id === 'm3u-connect') {
      void this.submit();
      return;
    }
    if (id === 'm3u-back') {
      if (!this.pending) this.callbacks.onBack();
      return;
    }
    this.document.getElementById(id)?.focus();
  }

  private applyFocus(): void {
    const id = M3U_ENTRY_FOCUS_IDS[this.focusIndex];
    const target = this.document.getElementById(id);
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }

  private async submit(): Promise<void> {
    if (this.pending) return;

    const input = this.document.getElementById('m3u-playlist-url') as HTMLInputElement | null;
    const connect = this.document.getElementById('m3u-connect') as HTMLButtonElement | null;
    const status = this.document.getElementById('m3u-status');
    if (!input || !connect || !status) return;

    const submission: M3uEntrySubmission = { playlistUrl: input.value };
    const validation = validateM3uEntry(submission);
    if (!validation.ok) {
      status.textContent = m3uEntryValidationMessageForCode(validation.code);
      this.focusIndex = 0;
      this.applyFocus();
      return;
    }

    this.pending = true;
    connect.disabled = true;
    status.textContent = M3U_ENTRY_COPY.connecting;

    try {
      await this.callbacks.onSubmit(submission);
      status.textContent = M3U_ENTRY_COPY.success;
      // The composition owner decides what follows success. Keep this view
      // guarded so repeated Select/Back cannot start a second transaction.
    } catch (error) {
      this.pending = false;
      connect.disabled = false;
      const code = error instanceof ProviderError ? error.code : 'UNAVAILABLE';
      status.textContent = m3uEntryProviderMessageForCode(code);
      this.focusIndex = 1;
      this.applyFocus();
    }
  }
}
