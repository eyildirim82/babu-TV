import {
  PairingPhoneController,
  type PairingPhoneErrorCode,
  type PairingPhoneState,
} from './phone-controller.js';

const ERROR_COPY: Record<PairingPhoneErrorCode, string> = {
  INVALID_BOOTSTRAP: "Eşleştirme bağlantısı geçersiz. TV'den yeniden başlatın.",
  REQUIRED: 'Gerekli alanları doldurun.',
  INVALID_URL: 'Geçerli bir bağlantı adresi girin.',
  UNSUPPORTED_PROTOCOL: 'Yalnızca HTTP veya HTTPS bağlantıları desteklenir.',
  CRYPTO_UNAVAILABLE: 'Güvenli şifreleme şu anda kullanılamıyor.',
  INVALID_TV_KEY: 'TV eşleştirme anahtarı geçersiz. Eşleştirmeyi yeniden başlatın.',
  RELAY_UNAVAILABLE: 'Eşleştirme servisine şu anda ulaşılamıyor.',
  NETWORK: 'Ağ bağlantısı kurulamadı. Lütfen yeniden deneyin.',
};

function appendText(
  document: Document,
  parent: HTMLElement,
  tag: 'h1' | 'p' | 'label',
  text: string,
  id?: string,
): HTMLElement {
  const element = document.createElement(tag);
  if (id !== undefined) element.id = id;
  element.textContent = text;
  parent.appendChild(element);
  return element;
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
  button.className = 'pairing-phone-button';
  parent.appendChild(button);
  return button;
}

function appendInput(
  document: Document,
  parent: HTMLElement,
  id: string,
  label: string,
  type: 'url' | 'text' | 'password',
  value: string,
): HTMLInputElement {
  const labelElement = document.createElement('label');
  labelElement.textContent = label;
  labelElement.setAttribute('for', id);
  parent.appendChild(labelElement);

  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.value = value;
  input.autocomplete = 'off';
  input.className = 'pairing-phone-input';
  parent.appendChild(input);
  return input;
}

export class PairingPhoneView {
  private visible = false;

  constructor(
    private readonly document: Document,
    private readonly controller: PairingPhoneController,
  ) {}

  show(): void {
    this.visible = true;
    this.render();
  }

  hide(): void {
    this.document.getElementById('pairing-phone-page')?.remove();
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible && this.document.getElementById('pairing-phone-page') !== null;
  }

  render(): void {
    if (!this.visible) return;
    this.document.getElementById('pairing-phone-page')?.remove();

    const root = this.document.createElement('main');
    root.id = 'pairing-phone-page';
    root.className = 'pairing-phone-page';

    const panel = this.document.createElement('section');
    panel.className = 'pairing-phone-panel';
    root.appendChild(panel);

    appendText(this.document, panel, 'h1', 'BabuşTV Eşleştirme');

    const status = appendText(
      this.document,
      panel,
      'p',
      '',
      'pairing-phone-status',
    );
    status.setAttribute('aria-live', 'polite');

    this.renderState(panel, status, this.controller.state());
    this.document.body.appendChild(root);
  }

  private renderState(
    panel: HTMLElement,
    status: HTMLElement,
    state: PairingPhoneState,
  ): void {
    switch (state.kind) {
      case 'choose-provider':
        this.renderChoice(panel, status);
        return;
      case 'xtream':
        this.renderXtream(panel, status, state.input, state.error);
        return;
      case 'm3u':
        this.renderM3u(panel, status, state.input, state.error);
        return;
      case 'sending':
        status.textContent = 'Bilgiler güvenli şekilde TV’ye gönderiliyor…';
        return;
      case 'success':
        status.textContent = 'Bilgiler TV’ye güvenli şekilde gönderildi.';
        return;
      case 'expired':
        status.textContent = "Eşleştirme süresi doldu. TV'den yeniden başlatın.";
        return;
      case 'error':
        if (state.code === 'INVALID_BOOTSTRAP' || state.providerKind === null) {
          status.textContent = ERROR_COPY[state.code];
          return;
        }
        this.controller.chooseProvider(state.providerKind);
        this.renderRetryForm(panel, status, state.providerKind, state.code);
    }
  }

  private renderChoice(panel: HTMLElement, status: HTMLElement): void {
    status.textContent = 'TV’ye göndermek istediğiniz sağlayıcı türünü seçin.';
    const actions = this.document.createElement('div');
    actions.className = 'pairing-phone-actions';
    panel.appendChild(actions);

    const xtream = appendButton(this.document, actions, 'pairing-phone-xtream', 'Xtream');
    const m3u = appendButton(this.document, actions, 'pairing-phone-m3u', 'M3U');

    xtream.addEventListener('click', () => {
      this.controller.chooseProvider('xtream');
      this.render();
    });
    m3u.addEventListener('click', () => {
      this.controller.chooseProvider('m3u');
      this.render();
    });
  }

  private renderXtream(
    panel: HTMLElement,
    status: HTMLElement,
    input: { serverUrl: string; username: string; password: string },
    error: PairingPhoneErrorCode | null,
  ): void {
    const server = appendInput(
      this.document,
      panel,
      'pairing-phone-server-url',
      'Sunucu adresi',
      'url',
      input.serverUrl,
    );
    const username = appendInput(
      this.document,
      panel,
      'pairing-phone-username',
      'Kullanıcı adı',
      'text',
      input.username,
    );
    const password = appendInput(
      this.document,
      panel,
      'pairing-phone-password',
      'Şifre',
      'password',
      input.password,
    );

    const sync = () => {
      this.controller.updateXtream({
        serverUrl: server.value,
        username: username.value,
        password: password.value,
      });
    };
    server.addEventListener('input', sync);
    username.addEventListener('input', sync);
    password.addEventListener('input', sync);

    this.renderFormActions(panel, status, 'xtream');
    if (error !== null) {
      status.textContent = ERROR_COPY[error];
      if (error === 'REQUIRED') server.focus();
    }
  }

  private renderM3u(
    panel: HTMLElement,
    status: HTMLElement,
    input: { playlistUrl: string },
    error: PairingPhoneErrorCode | null,
  ): void {
    const playlist = appendInput(
      this.document,
      panel,
      'pairing-phone-playlist-url',
      'Playlist adresi',
      'url',
      input.playlistUrl,
    );
    playlist.addEventListener('input', () => {
      this.controller.updateM3u({ playlistUrl: playlist.value });
    });

    this.renderFormActions(panel, status, 'm3u');
    if (error !== null) {
      status.textContent = ERROR_COPY[error];
      playlist.focus();
    }
  }

  private renderRetryForm(
    panel: HTMLElement,
    status: HTMLElement,
    providerKind: 'xtream' | 'm3u',
    error: PairingPhoneErrorCode,
  ): void {
    const restored = this.controller.state();
    if (providerKind === 'xtream' && restored.kind === 'xtream') {
      this.renderXtream(panel, status, restored.input, error);
      return;
    }
    if (providerKind === 'm3u' && restored.kind === 'm3u') {
      this.renderM3u(panel, status, restored.input, error);
      return;
    }
    status.textContent = ERROR_COPY[error];
  }

  private renderFormActions(
    panel: HTMLElement,
    status: HTMLElement,
    providerKind: 'xtream' | 'm3u',
  ): void {
    const actions = this.document.createElement('div');
    actions.className = 'pairing-phone-actions';
    panel.appendChild(actions);
    const submit = appendButton(this.document, actions, 'pairing-phone-submit', 'TV’ye Gönder');
    const back = appendButton(this.document, actions, 'pairing-phone-back', 'Geri');

    submit.addEventListener('click', async () => {
      if (submit.disabled) return;
      submit.disabled = true;
      back.disabled = true;
      status.textContent = 'Bilgiler güvenli şekilde TV’ye gönderiliyor…';
      await this.controller.submit();
      const next = this.controller.state();
      if (next.kind === 'error' && next.code !== 'INVALID_BOOTSTRAP' && next.providerKind !== null) {
        submit.disabled = false;
        back.disabled = false;
        status.textContent = ERROR_COPY[next.code];
        return;
      }
      if (next.kind === providerKind) {
        submit.disabled = false;
        back.disabled = false;
      }
      this.render();
    });

    back.addEventListener('click', () => {
      if (submit.disabled) return;
      this.controller.back();
      this.render();
    });
  }
}
