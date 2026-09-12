import type { ProviderId } from '../domain/models.js';
import { createPairingPhoneUrl } from './bootstrap-link.js';
import type { PairingTvBootstrapV1, PairingTvPollResult } from './tv-controller.js';

export interface PairingTvCorePort {
  start(): Promise<PairingTvBootstrapV1>;
  poll(sessionId: string): Promise<PairingTvPollResult>;
}

export interface PairingTvViewCallbacks {
  onBack(): void;
  onCompleted(providerId: ProviderId): void;
}

export interface PairingTvViewConfig {
  phoneBaseUrl: string;
  pollIntervalMs: number;
}

export interface PairingQrPort {
  toDataUrl(value: string): Promise<string>;
}

export interface PairingSchedulerPort {
  setTimeout(callback: () => void | Promise<void>, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const BROWSER_SCHEDULER: PairingSchedulerPort = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(() => {
      void callback();
    }, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as number);
  },
};

export class PairingTvView {
  private visible = false;
  private sessionId: string | null = null;
  private timer: unknown | null = null;
  private completed = false;

  constructor(
    private readonly document: Document,
    private readonly core: PairingTvCorePort,
    private readonly callbacks: PairingTvViewCallbacks,
    private readonly config: PairingTvViewConfig,
    private readonly qr: PairingQrPort,
    private readonly scheduler: PairingSchedulerPort = BROWSER_SCHEDULER,
  ) {}

  async show(): Promise<void> {
    if (this.visible) return;

    this.visible = true;
    this.completed = false;
    this.renderShell();
    this.setStatus('Telefonla eşleştirme hazırlanıyor…');

    try {
      const bootstrap = await this.core.start();
      if (!this.visible) return;

      this.sessionId = bootstrap.sessionId;
      const phoneUrl = createPairingPhoneUrl(this.config.phoneBaseUrl, bootstrap);
      const qrDataUrl = await this.qr.toDataUrl(phoneUrl);
      if (!this.visible || this.sessionId !== bootstrap.sessionId) return;

      const image = this.document.getElementById('pairing-tv-qr') as HTMLImageElement | null;
      if (image) image.src = qrDataUrl;
      this.setStatus('QR kodunu telefonunuzla tarayın.');
      this.schedulePoll();
    } catch {
      this.sessionId = null;
      this.cancelPoll();
      if (this.visible) this.setStatus('Telefonla eşleştirme şu anda kullanılamıyor.');
    }
  }

  hide(): void {
    this.visible = false;
    this.sessionId = null;
    this.cancelPoll();
    this.document.getElementById('pairing-tv-root')?.remove();
  }

  handleBack(): void {
    if (!this.visible) return;
    this.hide();
    this.callbacks.onBack();
  }

  private renderShell(): void {
    this.document.getElementById('pairing-tv-root')?.remove();

    const root = this.document.createElement('section');
    root.id = 'pairing-tv-root';
    root.className = 'pairing-tv-page';
    root.setAttribute('aria-label', 'Telefonla sağlayıcı ekleme');

    const panel = this.document.createElement('div');
    panel.className = 'pairing-tv-panel';

    const title = this.document.createElement('h1');
    title.className = 'pairing-tv-title';
    title.textContent = 'Telefonla Ekle';

    const copy = this.document.createElement('p');
    copy.className = 'pairing-tv-copy';
    copy.textContent = 'QR kodunu telefonunuzla tarayın ve sağlayıcı bilgilerini telefonunuzdan girin.';

    const image = this.document.createElement('img');
    image.id = 'pairing-tv-qr';
    image.className = 'pairing-tv-qr';
    image.alt = 'Telefon eşleştirme QR kodu';

    const status = this.document.createElement('p');
    status.id = 'pairing-tv-status';
    status.className = 'pairing-tv-status';
    status.setAttribute('aria-live', 'polite');

    const back = this.document.createElement('button');
    back.className = 'pairing-tv-back';
    back.type = 'button';
    back.textContent = 'Geri';
    back.addEventListener('click', () => this.handleBack());

    panel.appendChild(title);
    panel.appendChild(copy);
    panel.appendChild(image);
    panel.appendChild(status);
    panel.appendChild(back);
    root.appendChild(panel);
    this.document.body.appendChild(root);
  }

  private setStatus(message: string): void {
    const status = this.document.getElementById('pairing-tv-status');
    if (status) status.textContent = message;
  }

  private schedulePoll(): void {
    if (!this.visible || this.sessionId === null || this.timer !== null) return;
    this.timer = this.scheduler.setTimeout(async () => {
      this.timer = null;
      await this.pollOnce();
    }, this.config.pollIntervalMs);
  }

  private async pollOnce(): Promise<void> {
    const sessionId = this.sessionId;
    if (!this.visible || sessionId === null) return;

    let result: PairingTvPollResult;
    try {
      result = await this.core.poll(sessionId);
    } catch {
      result = { status: 'error', code: 'UNAVAILABLE' };
    }

    if (!this.visible || this.sessionId !== sessionId) return;

    if (result.status === 'pending') {
      this.schedulePoll();
      return;
    }

    this.sessionId = null;
    this.cancelPoll();

    if (result.status === 'completed') {
      this.setStatus('Eşleştirme tamamlandı.');
      if (!this.completed) {
        this.completed = true;
        this.callbacks.onCompleted(result.providerId);
      }
      return;
    }

    if (result.status === 'expired') {
      this.setStatus('Eşleştirme süresi doldu.');
      return;
    }

    if (result.status === 'consumed') {
      this.setStatus('Bu eşleştirme kodu daha önce kullanılmış.');
      return;
    }

    this.setStatus('Telefonla eşleştirme tamamlanamadı.');
  }

  private cancelPoll(): void {
    if (this.timer === null) return;
    this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }
}
