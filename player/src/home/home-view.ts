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

type HomeChannelDisplay = Pick<HomeChannelCard, 'name' | 'number' | 'currentProgram'>;

type HomeFocusKey =
  | 'home-live-tv'
  | 'home-favorites-view-all'
  | 'home-settings'
  | `home-provider:${string}`
  | `home-last-watched:${string}:${string}`
  | `home-favorite:${string}:${string}`
  | `home-frequent:${string}:${string}`;

interface HomeFocusPosition {
  readonly row: number;
  readonly column: number;
  readonly key: HomeFocusKey;
}

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

function channelMeta(card: HomeChannelDisplay): string | null {
  if (card.currentProgram?.title) return card.currentProgram.title;
  if (card.number !== null) return `Kanal ${card.number}`;
  return null;
}

export class HomeView {
  private state: HomePresentationState = { kind: 'loading' };
  private readonly actionMap = new Map<HomeFocusKey, HomeActionIntent>();
  private readonly elementMap = new Map<HomeFocusKey, HTMLElement>();
  private focusRows: HomeFocusKey[][] = [];
  private focusPosition: HomeFocusPosition | null = null;
  private restoreKey: HomeFocusKey | null = null;

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
    this.elementMap.clear();
    this.focusRows = [];
    this.focusPosition = null;
    this.restoreKey = null;
  }

  isVisible(): boolean {
    return this.document.getElementById('home-page') !== null;
  }

  handleAction(action: HomeInputAction): void {
    if (!this.isVisible()) return;

    if (action === 'back') {
      this.callbacks.onBack();
      return;
    }

    const current = this.focusPosition;
    if (current === null) return;

    if (action === 'select') {
      const intent = this.actionMap.get(current.key);
      if (intent !== undefined) this.callbacks.onIntent(intent);
      return;
    }

    if (action === 'left' || action === 'right') {
      const row = this.focusRows[current.row];
      if (row === undefined) return;
      const nextColumn = action === 'left'
        ? Math.max(0, current.column - 1)
        : Math.min(row.length - 1, current.column + 1);
      const key = row[nextColumn];
      if (key !== undefined) this.focusKey(key);
      return;
    }

    if (action === 'up' || action === 'down') {
      const nextRowIndex = action === 'up'
        ? Math.max(0, current.row - 1)
        : Math.min(this.focusRows.length - 1, current.row + 1);
      const row = this.focusRows[nextRowIndex];
      if (row === undefined) return;
      const key = row[Math.min(current.column, row.length - 1)];
      if (key !== undefined) this.focusKey(key);
    }
  }

  private render(root: HTMLElement): void {
    const stableKey = this.focusPosition?.key ?? this.restoreKey;
    while (root.firstChild) root.removeChild(root.firstChild);
    this.actionMap.clear();
    this.elementMap.clear();
    this.focusRows = [];
    this.focusPosition = null;
    this.restoreKey = stableKey;

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
    const target = this.resolveFocusKey(this.state.model, stableKey);
    if (target !== null) this.focusKey(target);
  }

  private renderReady(root: HTMLElement, model: HomeViewModel): void {
    const providerSection = appendSection(this.document, root, 'Sağlayıcı');
    const providerRow = this.appendRow(providerSection);
    const providerKeys: HomeFocusKey[] = [];
    for (const provider of model.providerSelector.options) {
      const key: HomeFocusKey = `home-provider:${provider.providerId}`;
      const button = this.appendAction(providerRow, key, provider.name, provider.intent);
      button.setAttribute('aria-pressed', provider.isActive ? 'true' : 'false');
      providerKeys.push(key);
    }
    this.addFocusRow(providerKeys);

    if (model.lastWatched !== null) {
      const lastSection = appendSection(this.document, root, 'Son İzlenen');
      const lastRow = this.appendRow(lastSection);
      const key: HomeFocusKey = `home-last-watched:${model.lastWatched.providerId}:${model.lastWatched.channelId}`;
      this.appendChannelAction(lastRow, key, model.lastWatched, model.lastWatched.intent);
      this.addFocusRow([key]);
    }

    const liveSection = appendSection(this.document, root, 'Canlı TV');
    const liveRow = this.appendRow(liveSection);
    if (model.liveTv.available && model.liveTv.intent !== null) {
      this.appendAction(liveRow, 'home-live-tv', 'Canlı TV’yi Aç', model.liveTv.intent);
      this.addFocusRow(['home-live-tv']);
    }

    const favoritesSection = appendSection(this.document, root, 'Favoriler');
    const favoritesRow = this.appendRow(favoritesSection);
    const favoriteKeys: HomeFocusKey[] = [];
    for (const card of model.favorites.items) {
      const key: HomeFocusKey = `home-favorite:${card.providerId}:${card.channelId}`;
      this.appendChannelAction(favoritesRow, key, card, card.intent);
      favoriteKeys.push(key);
    }
    if (model.favorites.viewAllIntent !== null) {
      this.appendAction(
        favoritesRow,
        'home-favorites-view-all',
        'Tüm Favoriler',
        model.favorites.viewAllIntent,
      );
      favoriteKeys.push('home-favorites-view-all');
    }
    this.addFocusRow(favoriteKeys);

    const frequentSection = appendSection(this.document, root, 'Sık İzlenenler');
    const frequentRow = this.appendRow(frequentSection);
    const frequentKeys: HomeFocusKey[] = [];
    for (const card of model.frequentlyWatched.items) {
      const key: HomeFocusKey = `home-frequent:${card.providerId}:${card.channelId}`;
      this.appendChannelAction(frequentRow, key, card, card.intent);
      frequentKeys.push(key);
    }
    this.addFocusRow(frequentKeys);

    const settingsSection = appendSection(this.document, root, 'Ayarlar');
    const settingsRow = this.appendRow(settingsSection);
    this.appendAction(settingsRow, 'home-settings', 'Ayarları Aç', model.settings.intent);
    this.addFocusRow(['home-settings']);
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
    this.elementMap.set(key, button);
    return button;
  }

  private appendChannelAction(
    parent: HTMLElement,
    key: HomeFocusKey,
    card: HomeChannelDisplay,
    intent: HomeActionIntent,
  ): void {
    const button = this.appendAction(parent, key, card.name, intent);
    button.className = 'home-action home-channel-card';
    const meta = channelMeta(card);
    if (meta !== null) appendText(this.document, button, 'span', meta, 'home-channel-meta');
  }

  private addFocusRow(keys: HomeFocusKey[]): void {
    if (keys.length > 0) this.focusRows.push(keys);
  }

  private resolveFocusKey(model: HomeViewModel, stableKey: HomeFocusKey | null): HomeFocusKey | null {
    if (stableKey !== null && this.actionMap.has(stableKey)) return stableKey;

    const defaultKey = this.defaultFocusKey(model);
    if (defaultKey !== null && this.actionMap.has(defaultKey)) return defaultKey;

    return this.focusRows[0]?.[0] ?? null;
  }

  private defaultFocusKey(model: HomeViewModel): HomeFocusKey | null {
    if (model.defaultFocus.kind === 'live-tv') return 'home-live-tv';
    if (model.defaultFocus.kind === 'last-watched') {
      const lastWatched = model.lastWatched;
      if (lastWatched === null || lastWatched.channelId !== model.defaultFocus.channelId) return null;
      return `home-last-watched:${lastWatched.providerId}:${lastWatched.channelId}`;
    }

    const activeProviderId = model.providerSelector.activeProviderId;
    if (activeProviderId !== null) return `home-provider:${activeProviderId}`;
    const firstProvider = model.providerSelector.options[0];
    return firstProvider === undefined ? null : `home-provider:${firstProvider.providerId}`;
  }

  private focusKey(key: HomeFocusKey): void {
    for (let row = 0; row < this.focusRows.length; row += 1) {
      const column = this.focusRows[row]?.indexOf(key) ?? -1;
      if (column < 0) continue;

      this.focusPosition = { row, column, key };
      this.restoreKey = key;
      const element = this.elementMap.get(key);
      element?.focus();
      element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
  }
}
