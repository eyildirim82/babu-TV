import { ProviderError, type ProviderErrorCode } from './providers/errors.js';
import { UI_COPY } from './ui/copy.js';

export interface XtreamEntrySubmission {
  serverUrl: string;
  username: string;
  password: string;
}

export interface XtreamEntryCallbacks {
  onSubmit(input: XtreamEntrySubmission): Promise<void>;
  onBack(): void;
}

export type XtreamEntryAction = 'up' | 'down' | 'select' | 'back';

export const XTREAM_ENTRY_FOCUS_IDS = Object.freeze([
  'xtream-server-url',
  'xtream-username',
  'xtream-password',
  'xtream-connect',
  'xtream-back',
] as const);

export function xtreamEntryMessageForCode(code: ProviderErrorCode): string {
  switch (code) {
    case 'AUTH': return UI_COPY.xtreamEntry.auth;
    case 'NETWORK': return UI_COPY.xtreamEntry.network;
    case 'TIMEOUT': return UI_COPY.xtreamEntry.timeout;
    case 'NOT_FOUND': return UI_COPY.xtreamEntry.notFound;
    case 'SERVER': return UI_COPY.xtreamEntry.server;
    case 'MALFORMED': return UI_COPY.xtreamEntry.malformed;
    case 'UNAVAILABLE':
    default:
      return UI_COPY.xtreamEntry.unavailable;
  }
}

export function renderXtreamEntryMarkup(): string {
  return [
    '<section id="xtream-entry-page" class="xtream-entry-page">',
    `<h1>${UI_COPY.xtreamEntry.title}</h1>`,
    `<label for="xtream-server-url">${UI_COPY.xtreamEntry.serverUrl}</label>`,
    '<input id="xtream-server-url" type="url" autocomplete="off">',
    `<label for="xtream-username">${UI_COPY.xtreamEntry.username}</label>`,
    '<input id="xtream-username" type="text" autocomplete="off">',
    `<label for="xtream-password">${UI_COPY.xtreamEntry.password}</label>`,
    '<input id="xtream-password" type="password" autocomplete="off">',
    `<button id="xtream-connect" type="button">${UI_COPY.xtreamEntry.connect}</button>`,
    `<button id="xtream-back" type="button">${UI_COPY.xtreamEntry.back}</button>`,
    '<div id="xtream-status" aria-live="polite"></div>',
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

function appendInput(
  document: Document,
  parent: HTMLElement,
  id: string,
  type: 'url' | 'text' | 'password',
  labelText: string,
): HTMLInputElement {
  const label = document.createElement('label');
  label.textContent = labelText;
  label.setAttribute('for', id);
  parent.appendChild(label);

  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.autocomplete = 'off';
  input.className = 'xtream-entry-input';
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
  button.className = 'xtream-entry-button';
  parent.appendChild(button);
  return button;
}

export class XtreamEntryView {
  private focusIndex = 0;
  private pending = false;

  constructor(
    private readonly document: Document,
    private readonly callbacks: XtreamEntryCallbacks,
  ) {}

  show(): void {
    if (this.isVisible()) {
      this.focusIndex = 0;
      this.applyFocus();
      return;
    }

    const root = this.document.createElement('section');
    root.id = 'xtream-entry-page';
    root.className = 'xtream-entry-page';

    const panel = this.document.createElement('div');
    panel.className = 'xtream-entry-panel';
    root.appendChild(panel);

    appendTextElement(this.document, panel, 'h1', UI_COPY.xtreamEntry.title, 'xtream-entry-title');
    appendTextElement(
      this.document,
      panel,
      'p',
      'Xtream Codes hesap bilgileriniz yalnız güvenli sağlayıcı deposunda saklanır.',
      'xtream-entry-note',
    );

    appendInput(this.document, panel, 'xtream-server-url', 'url', UI_COPY.xtreamEntry.serverUrl);
    appendInput(this.document, panel, 'xtream-username', 'text', UI_COPY.xtreamEntry.username);
    appendInput(this.document, panel, 'xtream-password', 'password', UI_COPY.xtreamEntry.password);

    const actions = this.document.createElement('div');
    actions.className = 'xtream-entry-actions';
    panel.appendChild(actions);
    appendButton(this.document, actions, 'xtream-connect', UI_COPY.xtreamEntry.connect);
    appendButton(this.document, actions, 'xtream-back', UI_COPY.xtreamEntry.back);

    const status = this.document.createElement('div');
    status.id = 'xtream-status';
    status.className = 'xtream-entry-status';
    status.setAttribute('aria-live', 'polite');
    panel.appendChild(status);

    this.document.body.appendChild(root);
    this.focusIndex = 0;
    this.pending = false;
    this.applyFocus();
  }

  hide(): void {
    const root = this.document.getElementById('xtream-entry-page');
    if (root) root.remove();
    this.focusIndex = 0;
    this.pending = false;
  }

  isVisible(): boolean {
    return this.document.getElementById('xtream-entry-page') !== null;
  }

  handleAction(action: XtreamEntryAction): void {
    if (!this.isVisible()) return;

    if (action === 'back') {
      if (!this.pending) this.callbacks.onBack();
      return;
    }

    if (action === 'up' || action === 'down') {
      const delta = action === 'up' ? -1 : 1;
      this.focusIndex = Math.max(
        0,
        Math.min(XTREAM_ENTRY_FOCUS_IDS.length - 1, this.focusIndex + delta),
      );
      this.applyFocus();
      return;
    }

    if (action !== 'select') return;
    const id = XTREAM_ENTRY_FOCUS_IDS[this.focusIndex];
    if (id === 'xtream-connect') {
      void this.submit();
      return;
    }
    if (id === 'xtream-back') {
      if (!this.pending) this.callbacks.onBack();
      return;
    }
    this.document.getElementById(id)?.focus();
  }

  private applyFocus(): void {
    const id = XTREAM_ENTRY_FOCUS_IDS[this.focusIndex];
    const target = this.document.getElementById(id);
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }

  private async submit(): Promise<void> {
    if (this.pending) return;

    const server = this.document.getElementById('xtream-server-url') as HTMLInputElement | null;
    const username = this.document.getElementById('xtream-username') as HTMLInputElement | null;
    const password = this.document.getElementById('xtream-password') as HTMLInputElement | null;
    const connect = this.document.getElementById('xtream-connect') as HTMLButtonElement | null;
    const status = this.document.getElementById('xtream-status');
    if (!server || !username || !password || !connect || !status) return;

    const submission: XtreamEntrySubmission = {
      serverUrl: server.value.trim(),
      username: username.value.trim(),
      password: password.value.trim(),
    };

    if (!submission.serverUrl || !submission.username || !submission.password) {
      status.textContent = UI_COPY.xtreamEntry.required;
      this.focusIndex = 3;
      this.applyFocus();
      return;
    }

    this.pending = true;
    connect.disabled = true;
    status.textContent = UI_COPY.xtreamEntry.connecting;

    try {
      await this.callbacks.onSubmit(submission);
      // Integration reloads after success. Keep the submit guard active until then.
    } catch (error) {
      this.pending = false;
      connect.disabled = false;
      const code = error instanceof ProviderError ? error.code : 'UNAVAILABLE';
      status.textContent = xtreamEntryMessageForCode(code);
      this.focusIndex = 3;
      this.applyFocus();
    }
  }
}
