import type { LogicalAction, LogicalInput } from '../domain/actions.js';
import type {
  Category,
  Channel,
  ChannelId,
  ProviderId,
} from '../domain/models.js';
import type { Platform } from '../platform/contracts.js';
import type { ProviderSnapshot } from '../providers/provider-core-service.js';
import type { SearchKeyboardEvent } from '../search/search-input-boundary.js';
import type { ChannelIntentEvent, LiveTvScope, LiveTvState } from './contracts.js';
import type {
  LiveTvFeatureComposition,
  LiveTvFeatureRefreshInput,
  LiveTvFeatureState,
  LiveTvSearchActivation,
} from './live-tv-feature-composition.js';
import {
  channelsForScope,
  createInitialLiveTvState,
  reduceLiveTv,
  scopeKey,
} from './live-tv-state.js';
import {
  NumericZapBuffer,
  type NumericZapTimers,
} from './numeric-zap-buffer.js';

export interface LiveTvViewModel {
  categories: readonly Category[];
  channels: readonly Channel[];
  visibleChannels: readonly Channel[];
  features?: LiveTvFeatureState;
}

export interface LiveTvView {
  render(state: LiveTvState, model: LiveTvViewModel): void;
}

export interface ChannelIntentPort {
  requestChannel(input: {
    providerId: ProviderId;
    channelId: ChannelId;
    previousChannelId: ChannelId | null;
  }): Promise<'playing' | 'failed' | 'stale'>;
}

export interface LiveTvControllerDependencies {
  intent: ChannelIntentPort;
  platform: Platform;
  view: LiveTvView;
  numericTimers?: NumericZapTimers;
  features?: LiveTvFeatureComposition;
}

const defaultNumericTimers: NumericZapTimers = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

function modelFor(
  snapshot: ProviderSnapshot,
  state: LiveTvState,
  features: LiveTvFeatureState | null,
): LiveTvViewModel {
  const model: LiveTvViewModel = {
    categories: snapshot.categories,
    channels: snapshot.channels,
    visibleChannels: channelsForScope(
      snapshot.channels,
      state.activeScope,
      state.favoriteChannelIds,
    ),
  };
  return features === null ? model : { ...model, features };
}

function searchEventFor(action: LogicalAction): SearchKeyboardEvent | null {
  switch (action) {
    case 'UP':
      return { key: 'ArrowUp', keyCode: 38 };
    case 'DOWN':
      return { key: 'ArrowDown', keyCode: 40 };
    case 'LEFT':
      return { key: 'ArrowLeft', keyCode: 37 };
    case 'RIGHT':
      return { key: 'ArrowRight', keyCode: 39 };
    case 'SELECT':
      return { key: 'Enter', keyCode: 13 };
    default:
      return null;
  }
}

export class LiveTvController {
  private current: LiveTvState | null = null;
  private snapshot: ProviderSnapshot | null = null;
  private optionLayerOpen = false;
  private numericBuffer: NumericZapBuffer | null = null;
  private featureState: LiveTvFeatureState | null = null;
  private featureGeneration = 0;

  constructor(private readonly deps: LiveTvControllerDependencies) {}

  enter(snapshot: ProviderSnapshot): void {
    this.snapshot = snapshot;
    this.current = reduceLiveTv(
      createInitialLiveTvState(snapshot.provider.id),
      { type: 'ENTER', channels: snapshot.channels },
    );
    this.optionLayerOpen = false;
    this.featureState = null;
    this.featureGeneration += 1;
    this.numericBuffer = new NumericZapBuffer({
      timers: this.deps.numericTimers ?? defaultNumericTimers,
      onChange: (value) => {
        if (this.current === null) return;
        this.current = { ...this.current, numericInput: value };
        this.render();
      },
      onCommit: (value) => {
        this.commitNumeric(value);
      },
    });
    this.render();
    this.refreshFeatures();
  }

  syncCatalog(snapshot: ProviderSnapshot): void {
    if (this.current === null || this.snapshot === null) return;
    if (snapshot.provider.id !== this.current.providerId) return;

    this.snapshot = snapshot;
    const currentCategoryId = this.current.activeScope.kind === 'category'
      ? this.current.activeScope.categoryId
      : null;
    if (
      currentCategoryId !== null
      && !snapshot.categories.some((category) => category.id === currentCategoryId)
    ) {
      this.current = reduceLiveTv(this.current, {
        type: 'SET_SCOPE',
        scope: { kind: 'all' },
        channels: snapshot.channels,
      });
    } else {
      this.current = reduceLiveTv(this.current, {
        type: 'SYNC_CHANNELS',
        channels: snapshot.channels,
      });
    }
    this.render();
    this.refreshFeatures();
  }

  state(): LiveTvState {
    if (this.current === null) {
      throw new Error('Live TV controller has not entered a provider snapshot.');
    }
    return this.current;
  }

  openSearch(query = ''): void {
    const input = this.featureInput();
    if (input === null || this.deps.features === undefined || this.featureState === null) return;
    this.featureState = this.deps.features.openSearch(input, query);
    this.render();
  }

  updateSearchQuery(query: string): void {
    const input = this.featureInput();
    if (input === null || this.deps.features === undefined || this.featureState === null) return;
    this.featureState = this.deps.features.updateSearchQuery(input, query);
    this.render();
  }

  handleSearchKeyboard(event: SearchKeyboardEvent): boolean {
    if (this.deps.features === undefined || this.featureState?.layer !== 'search') return false;
    const interaction = this.deps.features.handleSearchKeyboard(event);
    this.featureState = interaction.state;
    if (interaction.activation !== null) {
      this.applySearchActivation(interaction.activation);
    } else {
      this.render();
    }
    return interaction.handled;
  }

  async handleInput(input: LogicalInput): Promise<void> {
    if (this.current === null || this.snapshot === null) return;

    if (input.type === 'DIGIT') {
      if (this.featureState?.layer !== undefined && this.featureState.layer !== 'none') return;
      if (!this.numericEnabled()) return;
      this.numericBuffer?.push(input.digit);
      return;
    }

    const action = input.action;
    if (action === 'BACK') {
      this.numericBuffer?.clear();
      if (this.closeFeatureLayer()) return;
      if (this.optionLayerOpen) {
        this.optionLayerOpen = false;
        this.render();
        return;
      }
      if (this.current.overlayOpen) {
        this.current = reduceLiveTv(this.current, { type: 'CLOSE_OVERLAY' });
        this.render();
        return;
      }
      this.deps.platform.exitApp();
      return;
    }

    if (await this.handleFeatureLayerAction(action)) return;

    if (action === 'OPTIONS') {
      this.optionLayerOpen = true;
      this.render();
      return;
    }

    if (action === 'CHANNEL_UP' || action === 'CHANNEL_DOWN') {
      const target = this.zapTarget(action === 'CHANNEL_DOWN' ? 'NEXT' : 'PREVIOUS');
      if (target !== null) await this.requestPlayback(target);
      return;
    }

    if (!this.current.overlayOpen) {
      if (action === 'SELECT' || action === 'LEFT' || action === 'RIGHT' || action === 'UP' || action === 'DOWN') {
        this.current = reduceLiveTv(this.current, {
          type: 'OPEN_OVERLAY',
          channels: this.snapshot.channels,
        });
        this.render();
        this.refreshFeatures();
      }
      return;
    }

    if (action === 'LEFT' || action === 'RIGHT') {
      this.moveZone(action === 'RIGHT' ? 1 : -1);
      return;
    }

    if (action === 'UP' || action === 'DOWN') {
      if (this.current.overlayZone === 'CATEGORY') {
        this.moveCategory(action === 'DOWN' ? 1 : -1);
      } else if (this.current.overlayZone === 'CHANNEL') {
        this.current = reduceLiveTv(this.current, {
          type: 'MOVE_HIGHLIGHT',
          direction: action === 'DOWN' ? 'NEXT' : 'PREVIOUS',
          channels: this.snapshot.channels,
        });
        this.render();
        this.refreshFeatures();
      }
      return;
    }

    if (action === 'SELECT') {
      if (this.current.overlayZone === 'CATEGORY') {
        this.current = { ...this.current, overlayZone: 'CHANNEL' };
        this.render();
        return;
      }
      if (this.current.overlayZone === 'ACTIONS') {
        const featureInput = this.featureInput();
        if (
          featureInput !== null
          && this.deps.features !== undefined
          && this.featureState !== null
        ) {
          this.featureState = this.deps.features.openActions(featureInput);
          this.render();
        }
        return;
      }
      if (this.current.overlayZone === 'CHANNEL' && this.current.highlightedChannelId !== null) {
        await this.requestPlayback(this.current.highlightedChannelId);
      }
    }
  }

  handleIntentEvent(event: ChannelIntentEvent): void {
    if (this.current === null || event.intent.channelId.length === 0) return;
    const pendingId = this.current.pendingIntent?.id ?? 0;
    if (pendingId > event.intent.id) return;

    switch (event.type) {
      case 'RESOLVING':
        this.current = {
          ...this.current,
          highlightedChannelId: event.intent.channelId,
          playbackStatus: 'RESOLVING',
          pendingIntent: event.intent,
          playbackError: null,
        };
        break;
      case 'PREPARING':
        this.current = {
          ...this.current,
          playbackStatus: 'PREPARING',
          pendingIntent: event.intent,
          playbackError: null,
        };
        break;
      case 'RECOVERING':
        this.current = {
          ...this.current,
          playbackStatus: 'RECOVERING',
          pendingIntent: event.intent,
        };
        break;
      case 'PLAYING':
        this.current = {
          ...this.current,
          playingChannelId: event.intent.channelId,
          highlightedChannelId: event.intent.channelId,
          playbackStatus: 'PLAYING',
          pendingIntent: null,
          playbackError: null,
          overlayOpen: false,
          numericInput: '',
        };
        this.optionLayerOpen = false;
        break;
      case 'FAILED': {
        let playingChannelId = this.current.playingChannelId;
        if (event.rollback === 'restored') {
          playingChannelId = event.intent.previousChannelId;
        } else if (event.rollback === 'failed') {
          playingChannelId = null;
        }
        this.current = {
          ...this.current,
          playingChannelId,
          highlightedChannelId: event.intent.channelId,
          playbackStatus: 'FAILED',
          pendingIntent: null,
          playbackError: event.error,
          overlayOpen: true,
          numericInput: '',
        };
        break;
      }
    }
    this.render();
  }

  private featureInput(): LiveTvFeatureRefreshInput | null {
    if (this.current === null || this.snapshot === null) return null;
    return {
      providerId: this.current.providerId,
      channels: this.snapshot.channels,
      visibleChannels: channelsForScope(
        this.snapshot.channels,
        this.current.activeScope,
        this.current.favoriteChannelIds,
      ),
      categories: this.snapshot.categories,
      highlightedChannelId: this.current.highlightedChannelId,
    };
  }

  private refreshFeatures(): void {
    const input = this.featureInput();
    if (input === null || this.deps.features === undefined) return;
    const generation = ++this.featureGeneration;
    const providerId = input.providerId;
    const highlightedChannelId = input.highlightedChannelId;
    void this.deps.features.refresh(input).then((state) => {
      if (generation !== this.featureGeneration || this.current === null) return;
      if (
        this.current.providerId !== providerId
        || this.current.highlightedChannelId !== highlightedChannelId
      ) {
        return;
      }
      this.featureState = state;
      if (this.syncFavoriteScope(state.favorites.focusItemIds)) {
        this.refreshFeatures();
        return;
      }
      this.render();
    }).catch(() => {
      // Presentation feature failure must never make M3 Live TV unusable.
    });
  }

  private syncFavoriteScope(channelIds: readonly ChannelId[]): boolean {
    if (this.current === null || this.snapshot === null) return false;
    const previousHighlight = this.current.highlightedChannelId;
    this.current = reduceLiveTv(this.current, {
      type: 'SYNC_FAVORITES',
      channelIds,
      channels: this.snapshot.channels,
    });
    return this.current.highlightedChannelId !== previousHighlight;
  }

  private closeFeatureLayer(): boolean {
    if (
      this.deps.features === undefined
      || this.featureState === null
      || this.featureState.layer === 'none'
    ) {
      return false;
    }
    if (!this.deps.features.closeTopLayer()) return false;
    this.featureState = this.deps.features.current();
    this.render();
    return true;
  }

  private async handleFeatureLayerAction(action: LogicalAction): Promise<boolean> {
    if (
      this.deps.features === undefined
      || this.featureState === null
      || this.featureState.layer === 'none'
    ) {
      return false;
    }

    if (this.featureState.layer === 'program-info') return true;

    if (this.featureState.layer === 'search') {
      const event = searchEventFor(action);
      if (event !== null) this.handleSearchKeyboard(event);
      return true;
    }

    if (this.featureState.layer === 'actions') {
      if (action === 'UP' || action === 'DOWN') {
        this.featureState = this.deps.features.moveAction(
          action === 'DOWN' ? 'NEXT' : 'PREVIOUS',
        );
        this.render();
      } else if (action === 'SELECT') {
        await this.activateFeatureAction();
      }
      return true;
    }

    return true;
  }

  private async activateFeatureAction(): Promise<void> {
    if (this.current === null || this.deps.features === undefined) return;
    const intent = this.deps.features.activateFocusedAction();
    if (intent === null || intent.providerId !== this.current.providerId) return;
    if (intent.channelId !== this.current.highlightedChannelId) return;

    if (intent.type === 'PLAY_CHANNEL') {
      this.deps.features.closeTopLayer();
      this.featureState = this.deps.features.current();
      this.render();
      await this.requestPlayback(intent.channelId);
      return;
    }

    if (intent.type === 'SHOW_PROGRAM_INFO') {
      this.featureState = this.deps.features.openProgramInfo();
      this.render();
      return;
    }

    const input = this.featureInput();
    if (input === null) return;
    const providerId = input.providerId;
    const channelId = input.highlightedChannelId;
    const state = await this.deps.features.toggleFavorite(input);
    if (
      this.current === null
      || this.current.providerId !== providerId
      || this.current.highlightedChannelId !== channelId
    ) {
      this.refreshFeatures();
      return;
    }
    this.featureState = state;
    if (this.syncFavoriteScope(state.favorites.focusItemIds)) {
      this.refreshFeatures();
      return;
    }
    this.render();
  }

  private applySearchActivation(activation: LiveTvSearchActivation): void {
    if (this.current === null || this.snapshot === null) return;
    if (activation.providerId !== this.current.providerId) return;
    const target = this.snapshot.channels.find(
      (channel) => channel.providerId === activation.providerId && channel.id === activation.channelId,
    );
    if (target === undefined) return;

    const allScope = { kind: 'all' as const };
    this.current = reduceLiveTv(this.current, {
      type: 'SET_SCOPE',
      scope: allScope,
      channels: this.snapshot.channels,
    });
    this.current = {
      ...this.current,
      overlayOpen: true,
      overlayZone: 'CHANNEL',
      highlightedChannelId: target.id,
      restoreChannelIdByScope: {
        ...this.current.restoreChannelIdByScope,
        [scopeKey(allScope)]: target.id,
      },
    };
    this.render();
    this.refreshFeatures();
  }

  private render(): void {
    if (this.current === null || this.snapshot === null) return;
    this.deps.view.render(
      this.current,
      modelFor(this.snapshot, this.current, this.featureState),
    );
  }

  private moveZone(delta: -1 | 1): void {
    if (this.current === null) return;
    const zones = ['CATEGORY', 'CHANNEL', 'ACTIONS'] as const;
    const currentIndex = zones.indexOf(this.current.overlayZone);
    const nextIndex = Math.max(0, Math.min(zones.length - 1, currentIndex + delta));
    const nextZone = zones[nextIndex];
    if (nextZone === undefined || nextZone === this.current.overlayZone) return;
    this.current = { ...this.current, overlayZone: nextZone };
    this.render();
  }

  private moveCategory(delta: -1 | 1): void {
    if (this.current === null || this.snapshot === null) return;
    const scopes: LiveTvScope[] = [{ kind: 'all' }];
    if (this.featureState !== null) scopes.push({ kind: 'favorites' });
    scopes.push(...this.snapshot.categories.map((category) => ({
      kind: 'category' as const,
      categoryId: category.id,
    })));

    const currentKey = scopeKey(this.current.activeScope);
    const currentIndex = scopes.findIndex((scope) => scopeKey(scope) === currentKey);
    const start = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = Math.max(0, Math.min(scopes.length - 1, start + delta));
    const scope = scopes[nextIndex];
    if (scope === undefined) return;
    this.current = reduceLiveTv(this.current, {
      type: 'SET_SCOPE',
      scope,
      channels: this.snapshot.channels,
    });
    this.render();
    this.refreshFeatures();
  }

  private zapTarget(direction: 'PREVIOUS' | 'NEXT'): ChannelId | null {
    if (this.current === null || this.snapshot === null) return null;
    const visible = channelsForScope(
      this.snapshot.channels,
      this.current.activeScope,
      this.current.favoriteChannelIds,
    );
    if (visible.length === 0) return null;
    const anchorId = this.current.playingChannelId ?? this.current.highlightedChannelId;
    const anchorIndex = anchorId === null
      ? -1
      : visible.findIndex((channel) => channel.id === anchorId);
    const start = anchorIndex < 0 ? 0 : anchorIndex;
    const delta = direction === 'NEXT' ? 1 : -1;
    const targetIndex = Math.max(0, Math.min(visible.length - 1, start + delta));
    if (targetIndex === start && anchorIndex >= 0) return null;
    return visible[targetIndex]?.id ?? null;
  }

  private numericEnabled(): boolean {
    if (this.snapshot === null) return false;
    if (!this.deps.platform.capabilities().numericKeys) return false;
    return this.snapshot.channels.some((channel) => channel.number !== null);
  }

  private commitNumeric(number: number): void {
    if (this.current === null || this.snapshot === null || !this.numericEnabled()) return;
    const matches = this.snapshot.channels.filter((channel) => channel.number === number);
    if (matches.length !== 1) return;
    const target = matches[0];
    if (target !== undefined) void this.requestPlayback(target.id);
  }

  private async requestPlayback(channelId: ChannelId): Promise<void> {
    if (this.current === null || this.snapshot === null) return;
    const target = this.snapshot.channels.find(
      (channel) => channel.providerId === this.current?.providerId && channel.id === channelId,
    );
    if (target === undefined) return;

    this.current = {
      ...this.current,
      highlightedChannelId: target.id,
      numericInput: '',
    };
    this.render();
    this.refreshFeatures();
    await this.deps.intent.requestChannel({
      providerId: this.current.providerId,
      channelId: target.id,
      previousChannelId: this.current.playingChannelId,
    });
  }
}
