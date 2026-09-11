import type { Channel } from '../domain/models.js';
import type { LiveTvState } from './contracts.js';
import { scopeKey } from './live-tv-state.js';
import type { LiveTvView, LiveTvViewModel } from './live-tv-controller.js';
import { UI_COPY } from '../ui/copy.js';

function channelLabel(channel: Channel): string {
  return channel.number === null
    ? channel.name
    : `${channel.number} ${channel.name}`;
}

function required(document: Document, id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Required Live TV element is missing: ${id}`);
  return element;
}

export class DomLiveTvView implements LiveTvView {
  private readonly sidebar: HTMLElement;
  private readonly channelList: HTMLElement;
  private readonly groupList: HTMLElement;
  private readonly channelName: HTMLElement;
  private readonly status: HTMLElement;
  private readonly numeric: HTMLElement;
  private readonly featureRoot: HTMLElement;

  constructor(private readonly document: Document) {
    this.sidebar = required(document, 'sidebar');
    this.channelList = required(document, 'channel-list');
    this.groupList = required(document, 'group-list');
    this.channelName = required(document, 'channel-name');
    this.status = required(document, 'live-tv-status');
    this.numeric = required(document, 'numeric-zap');
    this.featureRoot = document.createElement('div');
    this.featureRoot.className = 'live-tv-feature-root';
    this.featureRoot.dataset.featureRoot = 'm4';
    this.featureRoot.classList.add('hidden');
    this.sidebar.append(this.featureRoot);
  }

  render(state: LiveTvState, model: LiveTvViewModel): void {
    this.sidebar.classList.add('babu-live-tv-overlay');
    this.sidebar.classList.toggle('closed', !state.overlayOpen);
    this.renderChannels(state, model);
    this.renderCategories(state, model);
    this.renderFeatures(model);
    this.renderNowPlaying(state, model);
    this.renderPlaybackStatus(state);
    this.renderNumeric(state.numericInput);
  }

  private renderChannels(state: LiveTvState, model: LiveTvViewModel): void {
    const items = model.visibleChannels.map((channel) => {
      const item = this.document.createElement('div');
      const highlighted = channel.id === state.highlightedChannelId;
      const focused = highlighted && state.overlayZone === 'CHANNEL';
      const playing = channel.id === state.playingChannelId;
      const epgCurrent = model.features?.epg.channelContext.find(
        (entry) => entry.channelId === channel.id,
      )?.current;
      const labelParts = [channelLabel(channel)];
      if (epgCurrent?.status === 'available') {
        labelParts.push(`${epgCurrent.title} ${epgCurrent.timeLabel}`);
      }

      item.className = 'channel-item';
      item.dataset.channelId = channel.id;
      item.textContent = labelParts.join(' · ');
      item.classList.toggle('highlighted', highlighted);
      item.classList.toggle('focused', focused);
      item.classList.toggle('playing', playing);
      item.dataset.presentationState = focused && playing
        ? 'focused-playing'
        : focused
          ? 'focused'
          : playing
            ? 'playing'
            : highlighted
              ? 'highlighted'
              : 'idle';
      return item;
    });

    this.channelList.replaceChildren(...items);
    this.channelList.classList.toggle('hidden', false);
    this.channelList.classList.toggle('zone-active', state.overlayZone === 'CHANNEL');
  }

  private renderCategories(state: LiveTvState, model: LiveTvViewModel): void {
    const activeKey = scopeKey(state.activeScope);
    const favoriteEntry = model.features === undefined
      ? []
      : [{
          key: model.features.favorites.categoryKey,
          name: model.features.favorites.categoryLabel,
        }];
    const entries = [
      { key: 'all', name: 'Tümü' },
      ...favoriteEntry,
      ...model.categories.map((category) => ({
        key: `category:${category.id}`,
        name: category.name,
      })),
    ];
    const items = entries.map((entry) => {
      const item = this.document.createElement('div');
      const active = entry.key === activeKey;
      const focused = active && state.overlayZone === 'CATEGORY';

      item.className = 'group-item';
      item.dataset.scopeKey = entry.key;
      item.textContent = entry.name;
      item.classList.toggle('active', active);
      item.classList.toggle('focused', focused);
      item.dataset.presentationState = focused ? 'focused' : active ? 'active' : 'idle';
      return item;
    });

    this.groupList.replaceChildren(...items);
    this.groupList.classList.toggle('hidden', false);
    this.groupList.classList.toggle('zone-active', state.overlayZone === 'CATEGORY');
  }

  private renderFeatures(model: LiveTvViewModel): void {
    const features = model.features;
    if (features === undefined) {
      this.featureRoot.replaceChildren();
      this.featureRoot.classList.add('hidden');
      return;
    }

    const sections: HTMLElement[] = [];
    const selected = features.epg.selected;
    if (selected !== null) {
      const section = this.document.createElement('div');
      section.className = 'live-tv-selected-epg';
      section.dataset.featureSection = 'selected-epg';
      const copy: string[] = [];
      if (selected.current.status === 'available') {
        copy.push(`Şimdi: ${selected.current.title} ${selected.current.timeLabel}`);
      }
      if (selected.next.status === 'available') {
        copy.push(`Sonraki: ${selected.next.title} ${selected.next.timeLabel}`);
      }
      section.textContent = copy.join(' · ');
      sections.push(section);
    }

    const favorites = this.document.createElement('div');
    favorites.className = 'live-tv-favorites';
    favorites.dataset.featureSection = 'favorites';
    favorites.dataset.categoryKey = features.favorites.categoryKey;
    favorites.dataset.presentationState = features.favorites.status;
    if (features.favorites.status === 'empty') {
      const empty = features.favorites.emptyState;
      favorites.textContent = empty === null
        ? features.favorites.categoryLabel
        : `${features.favorites.categoryLabel} · ${empty.title} · ${empty.message}`;
    } else {
      favorites.textContent = `${features.favorites.categoryLabel} · ${features.favorites.channels
        .map((channel) => channel.name)
        .join(' · ')}`;
    }
    sections.push(favorites);

    if (features.layer === 'search') {
      const search = this.document.createElement('div');
      search.className = 'live-tv-search';
      search.dataset.featureSection = 'search';
      search.dataset.presentationState = features.search.status;

      const input = this.document.createElement('input');
      input.className = 'live-tv-search-input';
      input.type = 'search';
      input.value = features.search.query;
      input.dataset.presentationState = features.search.focusZone === 'input' ? 'focused' : 'idle';
      search.append(input);

      for (const item of features.search.items) {
        const result = this.document.createElement('div');
        result.className = 'live-tv-search-result';
        result.dataset.resultKey = item.key;
        result.dataset.presentationState = item.key === features.search.focusedResultKey
          ? 'focused'
          : 'idle';
        result.textContent = item.numberText === null
          ? item.primaryText
          : `${item.numberText} ${item.primaryText}`;
        search.append(result);
      }
      sections.push(search);
    }

    if (
      features.actions !== null
      && (features.layer === 'actions' || features.layer === 'program-info')
    ) {
      const actions = this.document.createElement('div');
      actions.className = 'live-tv-actions';
      actions.dataset.featureSection = 'actions';
      for (const item of features.actions.items) {
        const action = this.document.createElement('button');
        action.className = 'live-tv-action';
        action.dataset.actionId = item.id;
        action.dataset.presentationState = item.id === features.actions.state.focusedActionId
          ? 'focused'
          : 'idle';
        action.textContent = item.label;
        actions.append(action);
      }
      sections.push(actions);
    }

    if (features.layer === 'program-info' && features.programInfo !== null) {
      const programInfo = this.document.createElement('div');
      programInfo.className = 'live-tv-program-info';
      programInfo.dataset.featureSection = 'program-info';
      programInfo.textContent = [
        features.programInfo.title,
        features.programInfo.timeLabel,
        features.programInfo.description,
      ].filter((part): part is string => part !== null && part.length > 0).join(' · ');
      sections.push(programInfo);
    }

    this.featureRoot.replaceChildren(...sections);
    this.featureRoot.classList.remove('hidden');
    this.featureRoot.dataset.activeLayer = features.layer;
  }

  private renderNowPlaying(state: LiveTvState, model: LiveTvViewModel): void {
    const playing = state.playingChannelId === null
      ? null
      : model.channels.find((channel) => channel.id === state.playingChannelId) ?? null;
    this.channelName.textContent = playing?.name ?? UI_COPY.noChannel;
  }

  private renderPlaybackStatus(state: LiveTvState): void {
    let text = '';
    if (state.playbackStatus === 'RESOLVING' || state.playbackStatus === 'PREPARING') {
      text = UI_COPY.streamOpening;
    } else if (state.playbackStatus === 'RECOVERING') {
      text = UI_COPY.recovering;
    } else if (state.playbackStatus === 'FAILED') {
      text = UI_COPY.streamFailed;
    }

    this.status.dataset.playbackStatus = state.playbackStatus;
    this.status.textContent = text;
    this.status.classList.toggle('hidden', text.length === 0);
  }

  private renderNumeric(value: string): void {
    this.numeric.dataset.presentationState = value.length > 0 ? 'active' : 'idle';
    this.numeric.textContent = value;
    this.numeric.classList.toggle('hidden', value.length === 0);
  }
}
