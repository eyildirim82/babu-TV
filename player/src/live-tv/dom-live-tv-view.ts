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

  constructor(private readonly document: Document) {
    this.sidebar = required(document, 'sidebar');
    this.channelList = required(document, 'channel-list');
    this.groupList = required(document, 'group-list');
    this.channelName = required(document, 'channel-name');
    this.status = required(document, 'live-tv-status');
    this.numeric = required(document, 'numeric-zap');
  }

  render(state: LiveTvState, model: LiveTvViewModel): void {
    this.sidebar.classList.add('babu-live-tv-overlay');
    this.sidebar.classList.toggle('closed', !state.overlayOpen);
    this.renderChannels(state, model);
    this.renderCategories(state, model);
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

      item.className = 'channel-item';
      item.dataset.channelId = channel.id;
      item.textContent = channelLabel(channel);
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
    const entries = [
      { key: 'all', name: 'Tümü' },
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
