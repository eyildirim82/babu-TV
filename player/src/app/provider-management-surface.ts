import {
  ProviderManagementPresenter,
  type ProviderManagementState,
} from '../provider-management/provider-management-presenter.js';

export type ProviderManagementSurfaceAction = 'up' | 'down' | 'select' | 'back';

export interface ProviderManagementSurfaceCallbacks {
  onBack(): void;
  onOpenLegacySettings(): void;
}

function appendText(
  document: Document,
  parent: HTMLElement,
  tag: 'h1' | 'p' | 'span',
  text: string,
  className?: string,
): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className !== undefined) element.className = className;
  parent.appendChild(element);
  return element;
}

function appendButton(
  document: Document,
  parent: HTMLElement,
  id: string,
  text: string,
  disabled = false,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = text;
  button.disabled = disabled;
  button.className = 'provider-management-button';
  parent.appendChild(button);
  return button;
}

export class ProviderManagementSurface {
  private settingsFocused = false;

  constructor(
    private readonly document: Document,
    private readonly presenter: ProviderManagementPresenter,
    private readonly callbacks: ProviderManagementSurfaceCallbacks,
  ) {}

  async show(): Promise<void> {
    this.settingsFocused = false;
    await this.presenter.load();
    this.render();
  }

  hide(): void {
    this.document.getElementById('provider-management-page')?.remove();
    this.settingsFocused = false;
  }

  async handleAction(action: ProviderManagementSurfaceAction): Promise<void> {
    const state = this.presenter.state;

    if (state.confirmation !== null) {
      if (action === 'back') {
        if (this.presenter.state.focusedId !== 'cancel-delete') {
          this.presenter.moveFocus('previous');
        }
        await this.presenter.activateFocused();
        this.render();
        return;
      }
      if (action === 'up' || action === 'down') {
        this.presenter.moveFocus(action === 'down' ? 'next' : 'previous');
        this.render();
        return;
      }
      if (action === 'select') {
        await this.presenter.activateFocused();
        this.render();
      }
      return;
    }

    if (this.settingsFocused) {
      if (action === 'up') {
        this.settingsFocused = false;
        this.applyFocus();
        return;
      }
      if (action === 'select') {
        this.callbacks.onOpenLegacySettings();
        return;
      }
      if (action === 'back') {
        this.settingsFocused = false;
        this.callbacks.onBack();
      }
      return;
    }

    if (action === 'back') {
      this.callbacks.onBack();
      return;
    }

    if (
      action === 'down'
      && state.focusedId !== null
      && state.focusedId === state.focusOrder[state.focusOrder.length - 1]
    ) {
      this.settingsFocused = true;
      this.applyFocus();
      return;
    }

    if (action === 'up' || action === 'down') {
      this.presenter.moveFocus(action === 'down' ? 'next' : 'previous');
      this.render();
      return;
    }

    if (action === 'select') {
      await this.presenter.activateFocused();
      this.render();
    }
  }

  private render(): void {
    this.document.getElementById('provider-management-page')?.remove();

    const root = this.document.createElement('section');
    root.id = 'provider-management-page';
    root.className = 'provider-management-page';

    const panel = this.document.createElement('div');
    panel.className = 'provider-management-panel';
    root.appendChild(panel);

    appendText(this.document, panel, 'h1', 'Sağlayıcılar', 'provider-management-title');
    this.renderStatus(panel, this.presenter.state);

    if (this.presenter.state.confirmation !== null) {
      this.renderConfirmation(panel, this.presenter.state);
    } else {
      this.renderProviders(panel, this.presenter.state);
      appendButton(
        this.document,
        panel,
        'app-settings',
        'Uygulama Ayarları',
        this.presenter.state.busyAction !== null,
      );
    }

    this.document.body.appendChild(root);
    this.applyFocus();
  }

  private renderStatus(parent: HTMLElement, state: ProviderManagementState): void {
    if (state.status === 'loading') {
      appendText(this.document, parent, 'p', 'Sağlayıcılar yükleniyor…', 'provider-management-status');
      return;
    }
    if (state.errorMessage !== null) {
      appendText(this.document, parent, 'p', state.errorMessage, 'provider-management-status');
      return;
    }
    if (state.status === 'empty') {
      appendText(this.document, parent, 'p', 'Henüz sağlayıcı eklenmedi.', 'provider-management-status');
    }
  }

  private renderProviders(parent: HTMLElement, state: ProviderManagementState): void {
    for (const provider of state.providers) {
      const row = this.document.createElement('div');
      row.className = 'provider-management-row';
      parent.appendChild(row);

      const label = provider.isActive ? `${provider.name} · Aktif` : provider.name;
      appendText(this.document, row, 'span', label, 'provider-management-name');

      const actions = this.document.createElement('div');
      actions.className = 'provider-management-actions';
      row.appendChild(actions);
      appendButton(
        this.document,
        actions,
        provider.switchFocusId,
        provider.isActive ? 'Aktif' : 'Kullan',
        state.busyAction !== null,
      );
      appendButton(
        this.document,
        actions,
        provider.deleteFocusId,
        'Sil',
        state.busyAction !== null,
      );
    }

    appendButton(
      this.document,
      parent,
      'add-provider',
      'Sağlayıcı Ekle',
      state.busyAction !== null,
    );
  }

  private renderConfirmation(parent: HTMLElement, state: ProviderManagementState): void {
    const confirmation = state.confirmation;
    if (confirmation === null) return;

    const dialog = this.document.createElement('div');
    dialog.className = 'provider-management-confirmation';
    parent.appendChild(dialog);
    appendText(
      this.document,
      dialog,
      'p',
      `${confirmation.providerName} sağlayıcısı silinsin mi?`,
      'provider-management-confirmation-copy',
    );
    const actions = this.document.createElement('div');
    actions.className = 'provider-management-actions';
    dialog.appendChild(actions);
    appendButton(this.document, actions, 'cancel-delete', 'Vazgeç', state.busyAction !== null);
    appendButton(this.document, actions, 'confirm-delete', 'Sil', state.busyAction !== null);
  }

  private applyFocus(): void {
    const focusId = this.settingsFocused
      ? 'app-settings'
      : this.presenter.state.focusedId;
    if (focusId === null) return;
    this.document.getElementById(focusId)?.focus();
  }
}
