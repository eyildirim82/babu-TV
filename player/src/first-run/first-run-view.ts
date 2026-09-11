export type FirstRunAction = 'left' | 'right' | 'up' | 'down' | 'select' | 'back';

export type FirstRunErrorCode = 'handoff-unavailable';

export type FirstRunPresentationState =
  | { kind: 'empty' }
  | { kind: 'error'; code: FirstRunErrorCode };

export interface FirstRunCallbacks {
  onXtreamSelected(): void;
  onM3uSelected(): void;
  onPairingSelected?(): void;
  onBack(): void;
}

export const FIRST_RUN_FOCUS_IDS = Object.freeze([
  'first-run-xtream',
  'first-run-m3u',
  'first-run-pairing',
  'first-run-back',
] as const);

type FirstRunFocusId = (typeof FIRST_RUN_FOCUS_IDS)[number];
type ProviderFocusId = Exclude<FirstRunFocusId, 'first-run-back'>;

const COPY = Object.freeze({
  title: "BabuşTV'ye Hoş Geldiniz",
  value: "Canlı TV'nizi kendi sağlayıcınızla, sade ve hızlı bir arayüzde izleyin.",
  providerPrompt: 'Bağlantı türünü seçin',
  xtreamTitle: 'Xtream',
  xtreamDetail: 'Sunucu adresi, kullanıcı adı ve şifre ile bağlanın.',
  m3uTitle: 'M3U',
  m3uDetail: 'M3U veya M3U8 oynatma listesi bağlantısı ile ekleyin.',
  pairingTitle: 'Telefonla Ekle',
  pairingDetail: 'Telefonunuzdan güvenli QR eşleştirmesi ile sağlayıcı ekleyin.',
  empty: 'Henüz bir sağlayıcı eklenmedi. Başlamak için bir bağlantı türü seçin.',
  handoffUnavailable: 'Bağlantı ekranı şu anda açılamıyor. Lütfen yeniden deneyin.',
  privacy: 'Bağlantı bilgileri bu seçim ekranında tutulmaz veya kaydedilmez.',
  back: 'Geri',
});

function statusText(state: FirstRunPresentationState): string {
  if (state.kind === 'error') return COPY.handoffUnavailable;
  return COPY.empty;
}

export function renderFirstRunMarkup(state: FirstRunPresentationState = { kind: 'empty' }): string {
  return [
    '<section id="first-run-page" class="first-run-page">',
    '<div class="first-run-panel">',
    '<img class="first-run-brand" src="/brand/babustv-wordmark.svg" alt="BabuşTV">',
    `<h1 class="first-run-title">${COPY.title}</h1>`,
    `<p class="first-run-value">${COPY.value}</p>`,
    `<p class="first-run-provider-prompt">${COPY.providerPrompt}</p>`,
    '<div class="first-run-provider-grid">',
    `<button id="first-run-xtream" class="first-run-provider-card" type="button"><span class="first-run-provider-title">${COPY.xtreamTitle}</span><span class="first-run-provider-detail">${COPY.xtreamDetail}</span></button>`,
    `<button id="first-run-m3u" class="first-run-provider-card" type="button"><span class="first-run-provider-title">${COPY.m3uTitle}</span><span class="first-run-provider-detail">${COPY.m3uDetail}</span></button>`,
    '</div>',
    `<div id="first-run-status" class="first-run-status" aria-live="polite">${statusText(state)}</div>`,
    `<p class="first-run-privacy">${COPY.privacy}</p>`,
    `<button id="first-run-back" class="first-run-back" type="button">${COPY.back}</button>`,
    '</div>',
    '</section>',
  ].join('');
}

function appendTextElement(
  document: Document,
  parent: HTMLElement,
  tag: string,
  text: string,
  className: string,
): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  parent.appendChild(element);
  return element;
}

function appendProviderButton(
  document: Document,
  parent: HTMLElement,
  id: ProviderFocusId,
  title: string,
  detail: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = 'first-run-provider-card';
  appendTextElement(document, button, 'span', title, 'first-run-provider-title');
  appendTextElement(document, button, 'span', detail, 'first-run-provider-detail');
  parent.appendChild(button);
  return button;
}

export class FirstRunView {
  private focusId: FirstRunFocusId = 'first-run-xtream';
  private lastProviderFocusId: ProviderFocusId = 'first-run-xtream';
  private state: FirstRunPresentationState = { kind: 'empty' };

  constructor(
    private readonly document: Document,
    private readonly callbacks: FirstRunCallbacks,
  ) {}

  show(state: FirstRunPresentationState = { kind: 'empty' }): void {
    this.state = state;

    if (this.isVisible()) {
      this.focusId = 'first-run-xtream';
      this.lastProviderFocusId = 'first-run-xtream';
      this.renderStatus();
      this.applyFocus();
      return;
    }

    const root = this.document.createElement('section');
    root.id = 'first-run-page';
    root.className = 'first-run-page';

    const panel = this.document.createElement('div');
    panel.className = 'first-run-panel';
    root.appendChild(panel);

    const brand = this.document.createElement('img');
    brand.className = 'first-run-brand';
    brand.setAttribute('src', '/brand/babustv-wordmark.svg');
    brand.setAttribute('alt', 'BabuşTV');
    panel.appendChild(brand);

    appendTextElement(this.document, panel, 'h1', COPY.title, 'first-run-title');
    appendTextElement(this.document, panel, 'p', COPY.value, 'first-run-value');
    appendTextElement(this.document, panel, 'p', COPY.providerPrompt, 'first-run-provider-prompt');

    const providerGrid = this.document.createElement('div');
    providerGrid.className = 'first-run-provider-grid';
    panel.appendChild(providerGrid);
    appendProviderButton(this.document, providerGrid, 'first-run-xtream', COPY.xtreamTitle, COPY.xtreamDetail);
    appendProviderButton(this.document, providerGrid, 'first-run-m3u', COPY.m3uTitle, COPY.m3uDetail);
    if (this.callbacks.onPairingSelected) {
      appendProviderButton(this.document, providerGrid, 'first-run-pairing', COPY.pairingTitle, COPY.pairingDetail);
    }

    const status = this.document.createElement('div');
    status.id = 'first-run-status';
    status.className = 'first-run-status';
    status.setAttribute('aria-live', 'polite');
    panel.appendChild(status);

    appendTextElement(this.document, panel, 'p', COPY.privacy, 'first-run-privacy');

    const back = this.document.createElement('button');
    back.id = 'first-run-back';
    back.type = 'button';
    back.className = 'first-run-back';
    back.textContent = COPY.back;
    panel.appendChild(back);

    this.document.body.appendChild(root);
    this.focusId = 'first-run-xtream';
    this.lastProviderFocusId = 'first-run-xtream';
    this.renderStatus();
    this.applyFocus();
  }

  hide(): void {
    this.document.getElementById('first-run-page')?.remove();
    this.focusId = 'first-run-xtream';
    this.lastProviderFocusId = 'first-run-xtream';
    this.state = { kind: 'empty' };
  }

  isVisible(): boolean {
    return this.document.getElementById('first-run-page') !== null;
  }

  setState(state: FirstRunPresentationState): void {
    this.state = state;
    this.renderStatus();
  }

  handleAction(action: FirstRunAction): void {
    if (!this.isVisible()) return;

    if (action === 'back') {
      this.callbacks.onBack();
      return;
    }

    if (action === 'left') {
      if (this.focusId === 'first-run-m3u') this.setProviderFocus('first-run-xtream');
      else if (this.focusId === 'first-run-pairing') this.setProviderFocus('first-run-m3u');
      return;
    }

    if (action === 'right') {
      if (this.focusId === 'first-run-xtream') this.setProviderFocus('first-run-m3u');
      else if (this.focusId === 'first-run-m3u' && this.callbacks.onPairingSelected) {
        this.setProviderFocus('first-run-pairing');
      }
      return;
    }

    if (action === 'down') {
      if (this.focusId !== 'first-run-back') {
        this.lastProviderFocusId = this.focusId;
        this.focusId = 'first-run-back';
        this.applyFocus();
      }
      return;
    }

    if (action === 'up') {
      if (this.focusId === 'first-run-back') {
        this.focusId = this.lastProviderFocusId;
        this.applyFocus();
      }
      return;
    }

    if (action !== 'select') return;
    if (this.focusId === 'first-run-xtream') {
      this.callbacks.onXtreamSelected();
      return;
    }
    if (this.focusId === 'first-run-m3u') {
      this.callbacks.onM3uSelected();
      return;
    }
    if (this.focusId === 'first-run-pairing') {
      this.callbacks.onPairingSelected?.();
      return;
    }
    this.callbacks.onBack();
  }

  private setProviderFocus(id: ProviderFocusId): void {
    this.focusId = id;
    this.lastProviderFocusId = id;
    this.applyFocus();
  }

  private renderStatus(): void {
    const status = this.document.getElementById('first-run-status');
    if (status) status.textContent = statusText(this.state);
  }

  private applyFocus(): void {
    const target = this.document.getElementById(this.focusId);
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }
}
