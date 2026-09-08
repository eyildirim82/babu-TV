import type { Channel } from '../domain/models.js';
import type { LiveTvState } from './contracts.js';
import { scopeKey } from './live-tv-state.js';
import type { LiveTvView, LiveTvViewModel } from './live-tv-controller.js';

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
      item.className = 'channel-item';
      item.dataset.channelId = channel.id;
      item.textContent = channelLabel(channel);
      item.classList.toggle('focused', channel.id === state.highlightedChannelId);
      item.classList.toggle('playing', channel.id === state.playingChannelId);
      return item;
    });

    this.channelList.replaceChildren(...items);
    this.channelList.classList.toggle('hidden', state.overlayZone === 'CATEGORY');
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
      item.className = 'group-item';
      item.dataset.scopeKey = entry.key;
      item.textContent = entry.name;
      item.classList.toggle('focused', entry.key === activeKey);
      return item;
    });

    this.groupList.replaceChildren(...items);
    this.groupList.classList.toggle('hidden', state.overlayZone !== 'CATEGORY');
  }

  private renderNowPlaying(state: LiveTvState, model: LiveTvViewModel): void {
    const playing = state.playingChannelId === null
      ? null
      : model.channels.find((channel) => channel.id === state.playingChannelId) ?? null;
    this.channelName.textContent = playing?.name ?? 'No Channel';
  }

  private renderPlaybackStatus(state: LiveTvState): void {
    let text = '';
    if (state.playbackStatus === 'RESOLVING' || state.playbackStatus === 'PREPARING') {
      text = 'Yayın açılıyor...';
    } else if (state.playbackStatus === 'RECOVERING') {
      text = 'Önceki yayın geri yükleniyor...';
    } else if (state.playbackStatus === 'FAILED') {
      text = 'Yayın açılamadı';
    }

    this.status.textContent = text;
    this.status.classList.toggle('hidden', text.length === 0);
  }

  private renderNumeric(value: string): void {
    this.numeric.textContent = value;
    this.numeric.classList.toggle('hidden', value.length === 0);
  }
}
