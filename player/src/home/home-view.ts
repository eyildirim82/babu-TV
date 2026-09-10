import type { HomeActionIntent, HomeChannelCard, HomeViewModel } from './home-domain.js';

export type HomeInputAction = 'left' | 'right' | 'up' | 'down' | 'select' | 'back';

export type HomePresentationState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly model: HomeViewModel };

export interface HomeViewCallbacks {
  onIntent(intent: HomeActionIntent): void;
  onBack(): void;
}

type HomeFocusKey =
  | 'home-live-tv'
  | 'home-favorites-view-all'
  | 'home-settings'
  | `home-provider:${string}`
  | `home-last-watched:${string}`
  | `home-favorite:${string}`
  | `home-frequent:${string}`;

function appendText(
  document: Document,
  parent: HTMLElement,
  tag: string,
  text: string,
  className: string,
): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function appendSection(
  document: Document,
  root: HTMLElement,
  title: string,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'home-section';
  appendText(document, section, 'h2', title, 'home-section-title');
  root.appendChild(section);
  return section;
}

function channelMeta(card: HomeChannelCard): string | null {
  if (card.currentProgram?.title) return card.currentProgram.title;
  if (card.number !== null) return `Kanal ${card.number}`;
  return null;
}

export class HomeView {
  private state: HomePresentationState = { kind: 'loading' };
  private readonly actionMap = new Map<HomeFocusKey, HomeActionIntent>();

  constructor(
    private readonly document: Document,
    private readonly callbacks: HomeViewCallbacks,
  ) {}

  show(state: HomePresentationState): void {
    this.state = state;
    let root = this.document.getElementById('home-page');
    if (root === null) {
      root = this.document.createElement('main');
      root.id = 'home-page';
      root.className = 'home-page';
      this.document.body.appendChild(root);
    }
    this.render(root);
  }

  setState(state: HomePresentationState): void {
    this.state = state;
    const root = this.document.getElementById('home-page');
    if (root !== null) this.render(root);
  }

  hide(): void {
    this.document.getElementById('home-page')?.remove();
    this.actionMap.clear();
  }

  isVisible(): boolean {
    return this.document.getElementById('home-page') !== null;
  }

  handleAction(_action: HomeInputAction): void {
    // Remote focus and explicit intent dispatch are added in the next bounded TDD task.
  }

  private render(root: HTMLElement): void {
    while (root.firstChild) root.removeChild(root.firstChild);
    this.actionMap.clear();

    if (this.state.kind === 'loading') {
      root.setAttribute('aria-busy', 'true');
      appendText(this.document, root, 'p', 'Ana sayfa hazırlanıyor…', 'home-status');
      return;
    }

    root.setAttribute('aria-busy', 'false');
    if (this.state.kind === 'error') {
      appendText(this.document, root, 'p', this.state.message, 'home-status home-status-error');
      return;
    }

    this.renderReady(root, this.state.model);
  }

  private renderReady(root: HTMLElement, model: HomeViewModel): void {
    const providerSection = appendSection(this.document, root, 'Sağlayıcı');
    const providerRow = this.appendRow(providerSection);
    for (const provider of model.providerSelector.options) {
      const button = this.appendAction(
        providerRow,
        `home-provider:${provider.providerId}`,
        provider.name,
        provider.intent,
      );
      button.setAttribute('aria-pressed', provider.isActive ? 'true' : 'false');
    }

    if (model.lastWatched !== null) {
      const lastSection = appendSection(this.document, root, 'Son İzlenen');
      const lastRow = this.appendRow(lastSection);
      this.appendChannelAction(
        lastRow,
        `home-last-watched:${model.lastWatched.channelId}`,
        model.lastWatched,
        model.lastWatched.intent,
      );
    }

    const liveSection = appendSection(this.document, root, 'Canlı TV');
    const liveRow = this.appendRow(liveSection);
    if (model.liveTv.available && model.liveTv.intent !== null) {
      this.appendAction(liveRow, 'home-live-tv', 'Canlı TV’yi Aç', model.liveTv.intent);
    }

    const favoritesSection = appendSection(this.document, root, 'Favoriler');
    const favoritesRow = this.appendRow(favoritesSection);
    for (const card of model.favorites.items) {
      this.appendChannelAction(
        favoritesRow,
        `home-favorite:${card.channelId}`,
        card,
        card.intent,
      );
    }
    if (model.favorites.viewAllIntent !== null) {
      this.appendAction(
        favoritesRow,
        'home-favorites-view-all',
        'Tüm Favoriler',
        model.favorites.viewAllIntent,
      );
    }

    const frequentSection = appendSection(this.document, root, 'Sık İzlenenler');
    const frequentRow = this.appendRow(frequentSection);
    for (const card of model.frequentlyWatched.items) {
      this.appendChannelAction(
        frequentRow,
        `home-frequent:${card.channelId}`,
        card,
        card.intent,
      );
    }

    const settingsSection = appendSection(this.document, root, 'Ayarlar');
    const settingsRow = this.appendRow(settingsSection);
    this.appendAction(settingsRow, 'home-settings', 'Ayarları Aç', model.settings.intent);
  }

  private appendRow(section: HTMLElement): HTMLElement {
    const row = this.document.createElement('div');
    row.className = 'home-row';
    section.appendChild(row);
    return row;
  }

  private appendAction(
    parent: HTMLElement,
    key: HomeFocusKey,
    label: string,
    intent: HomeActionIntent,
  ): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.className = 'home-action';
    button.setAttribute('data-home-focus-key', key);
    button.textContent = label;
    parent.appendChild(button);
    this.actionMap.set(key, intent);
    return button;
  }

  private appendChannelAction(
    parent: HTMLElement,
    key: HomeFocusKey,
    card: HomeChannelCard,
    intent: HomeActionIntent,
  ): void {
    const button = this.appendAction(parent, key, card.name, intent);
    button.className = 'home-action home-channel-card';
    const meta = channelMeta(card);
    if (meta !== null) appendText(this.document, button, 'span', meta, 'home-channel-meta');
  }
}
