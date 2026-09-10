import type { Category, Channel, ChannelId, ProviderId } from '../domain/models.js';
import { makeChannelKey } from '../domain/models.js';
import type { EpgQuery } from '../epg/contracts.js';
import type { FavoriteReconciliation } from '../favorites/service.js';
import {
  buildFavoritesViewModel,
  type FavoritesViewModel,
} from '../favorites/view-model.js';
import {
  activateChannelAction,
  buildChannelActions,
  createChannelActionsState,
  reduceChannelActions,
  type ChannelActionContext,
  type ChannelActionIntent,
  type ChannelActionItem,
  type ChannelActionsState,
} from '../channel-actions/channel-actions-model.js';
import { searchCatalog } from '../search/search-core.js';
import {
  handleSearchKeyboard,
  type SearchKeyboardEvent,
} from '../search/search-input-boundary.js';
import {
  projectSearchView,
  type SearchViewModel,
} from '../search/search-view-model.js';
import {
  presentEpgLiveTv,
  type EpgLiveTvPresentation,
  type EpgProgramDetailPresentation,
} from './epg-live-tv-presentation.js';
import { buildEpgLiveTvViewModel } from './epg-live-tv-view-model.js';

export interface LiveTvFavoritePort {
  isFavorite(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  toggle(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  reconcile(
    providerId: ProviderId,
    availableChannelIds: ReadonlySet<ChannelId>,
  ): Promise<FavoriteReconciliation>;
}

export interface LiveTvFeaturePorts {
  epg: Pick<EpgQuery, 'getCurrent' | 'getNext'>;
  favorites: LiveTvFavoritePort;
  nowMs(): number;
}

export type LiveTvFeatureLayer = 'none' | 'search' | 'actions' | 'program-info';

export interface LiveTvFeatureRefreshInput {
  providerId: ProviderId;
  channels: readonly Channel[];
  visibleChannels: readonly Channel[];
  categories: readonly Category[];
  highlightedChannelId: ChannelId | null;
}

export interface LiveTvChannelActionsPresentation {
  context: ChannelActionContext;
  items: readonly ChannelActionItem[];
  state: ChannelActionsState;
}

export interface LiveTvFeatureState {
  layer: LiveTvFeatureLayer;
  epg: EpgLiveTvPresentation;
  selectedFavorite: boolean;
  favorites: FavoritesViewModel;
  search: SearchViewModel;
  actions: LiveTvChannelActionsPresentation | null;
  programInfo: EpgProgramDetailPresentation | null;
}

export interface LiveTvSearchActivation {
  providerId: ProviderId;
  channelId: ChannelId;
}

export interface LiveTvSearchInteraction {
  handled: boolean;
  state: LiveTvFeatureState;
  activation: LiveTvSearchActivation | null;
}

export interface LiveTvFeatureComposition {
  current(): LiveTvFeatureState;
  refresh(input: LiveTvFeatureRefreshInput): Promise<LiveTvFeatureState>;
  openSearch(input: LiveTvFeatureRefreshInput, query?: string): LiveTvFeatureState;
  updateSearchQuery(input: LiveTvFeatureRefreshInput, query: string): LiveTvFeatureState;
  handleSearchKeyboard(event: SearchKeyboardEvent): LiveTvSearchInteraction;
  openActions(input: LiveTvFeatureRefreshInput): LiveTvFeatureState;
  moveAction(direction: 'PREVIOUS' | 'NEXT'): LiveTvFeatureState;
  activateFocusedAction(): ChannelActionIntent | null;
  toggleFavorite(input: LiveTvFeatureRefreshInput): Promise<LiveTvFeatureState>;
  openProgramInfo(): LiveTvFeatureState;
  closeTopLayer(): boolean;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function emptyReconciliation(): FavoriteReconciliation {
  return { available: [], missing: [] };
}

function providerChannels(input: LiveTvFeatureRefreshInput): readonly Channel[] {
  return input.channels.filter((channel) => channel.providerId === input.providerId);
}

function providerCategories(input: LiveTvFeatureRefreshInput): readonly Category[] {
  return input.categories.filter((category) => category.providerId === input.providerId);
}

function providerVisibleChannels(input: LiveTvFeatureRefreshInput): readonly Channel[] {
  return input.visibleChannels.filter((channel) => channel.providerId === input.providerId);
}

function idleSearch(): SearchViewModel {
  return projectSearchView({
    query: '',
    results: [],
    focusZone: 'input',
    focusedResultKey: null,
    restoreResultKey: null,
  });
}

export function createLiveTvFeatureComposition(
  ports: LiveTvFeaturePorts,
): LiveTvFeatureComposition {
  let currentState: LiveTvFeatureState | null = null;
  let searchLookup = new Map<string, LiveTvSearchActivation>();
  let programInfoReturnLayer: LiveTvFeatureLayer = 'none';

  function current(): LiveTvFeatureState {
    if (currentState === null) {
      throw new Error('Live TV feature composition has not been refreshed.');
    }
    return currentState;
  }

  function projectSearch(
    input: LiveTvFeatureRefreshInput,
    query: string,
    focusZone: SearchViewModel['focusZone'],
    focusedResultKey: string | null,
    restoreResultKey: string | null,
  ): SearchViewModel {
    const results = searchCatalog({
      channels: providerChannels(input),
      categories: providerCategories(input),
      query,
    });
    searchLookup = new Map(
      results.map((result) => [
        makeChannelKey(result.channel.providerId, result.channel.id),
        { providerId: result.channel.providerId, channelId: result.channel.id },
      ]),
    );
    return projectSearchView({
      query,
      results,
      focusZone,
      focusedResultKey,
      restoreResultKey,
    });
  }

  function actionsFor(
    input: LiveTvFeatureRefreshInput,
    epg: EpgLiveTvPresentation,
    selectedFavorite: boolean,
    previous: LiveTvChannelActionsPresentation | null,
  ): LiveTvChannelActionsPresentation | null {
    const channelId = input.highlightedChannelId;
    if (channelId === null) return null;
    if (!providerChannels(input).some((channel) => channel.id === channelId)) return null;

    const context = { providerId: input.providerId, channelId };
    const items = buildChannelActions({
      ...context,
      isFavorite: selectedFavorite,
      programInfoAvailable: epg.selected?.channelId === channelId && epg.selected.detail !== null,
    });
    const state = previous !== null
      && previous.context.providerId === context.providerId
      && previous.context.channelId === context.channelId
      ? reduceChannelActions(previous.state, { type: 'SYNC', actions: items })
      : createChannelActionsState(items);
    return { context, items, state };
  }

  async function refresh(input: LiveTvFeatureRefreshInput): Promise<LiveTvFeatureState> {
    const channels = providerChannels(input);
    const visibleChannels = providerVisibleChannels(input);
    const availableChannelIds = new Set(channels.map((channel) => channel.id));
    const epgModel = await buildEpgLiveTvViewModel({
      providerId: input.providerId,
      visibleChannels,
      highlightedChannelId: input.highlightedChannelId,
      atMs: ports.nowMs(),
      query: ports.epg,
    });
    const epg = presentEpgLiveTv(epgModel, {
      formatTimeRange(startMs, endMs) {
        return `${formatTime(startMs)}–${formatTime(endMs)}`;
      },
    });

    let reconciliation: FavoriteReconciliation;
    try {
      reconciliation = await ports.favorites.reconcile(input.providerId, availableChannelIds);
    } catch {
      reconciliation = emptyReconciliation();
    }

    let selectedFavorite = false;
    if (input.highlightedChannelId !== null) {
      try {
        selectedFavorite = await ports.favorites.isFavorite(
          input.providerId,
          input.highlightedChannelId,
        );
      } catch {
        selectedFavorite = false;
      }
    }

    const previous = currentState;
    const search = previous === null
      ? idleSearch()
      : projectSearch(
          input,
          previous.search.query,
          previous.search.focusZone,
          previous.search.focusedResultKey,
          previous.search.restoreResultKey,
        );
    const actions = previous?.actions === undefined
      ? null
      : actionsFor(input, epg, selectedFavorite, previous.actions);

    let layer = previous?.layer ?? 'none';
    if (layer === 'actions' && actions === null) layer = 'none';
    const selectedDetail = epg.selected?.detail ?? null;
    if (layer === 'program-info' && selectedDetail === null) {
      layer = actions === null ? 'none' : 'actions';
    }

    currentState = {
      layer,
      epg,
      selectedFavorite,
      favorites: buildFavoritesViewModel({
        providerId: input.providerId,
        channels,
        reconciliation,
      }),
      search,
      actions,
      programInfo: layer === 'program-info' ? selectedDetail : null,
    };
    return currentState;
  }

  function openSearch(input: LiveTvFeatureRefreshInput, query = ''): LiveTvFeatureState {
    const previous = current();
    currentState = {
      ...previous,
      layer: 'search',
      search: projectSearch(
        input,
        query,
        'input',
        null,
        previous.search.restoreResultKey,
      ),
      programInfo: null,
    };
    return currentState;
  }

  function updateSearchQuery(
    input: LiveTvFeatureRefreshInput,
    query: string,
  ): LiveTvFeatureState {
    const previous = current();
    currentState = {
      ...previous,
      layer: 'search',
      search: projectSearch(
        input,
        query,
        previous.search.focusZone,
        previous.search.focusedResultKey,
        previous.search.restoreResultKey,
      ),
    };
    return currentState;
  }

  function handleSearchEvent(event: SearchKeyboardEvent): LiveTvSearchInteraction {
    const previous = current();
    if (previous.layer !== 'search') {
      return { handled: false, state: previous, activation: null };
    }

    const output = handleSearchKeyboard({
      state: {
        zone: previous.search.focusZone,
        focusedResultKey: previous.search.focusedResultKey,
        restoreResultKey: previous.search.restoreResultKey,
      },
      resultKeys: previous.search.items.map((item) => item.key),
      event,
    });
    let activation: LiveTvSearchActivation | null = null;
    let layer: LiveTvFeatureLayer = 'search';
    if (output.intent?.type === 'CLOSE_SEARCH') {
      layer = 'none';
    } else if (output.intent?.type === 'ACTIVATE_RESULT') {
      activation = searchLookup.get(output.intent.resultKey) ?? null;
      layer = 'none';
    }

    currentState = {
      ...previous,
      layer,
      search: {
        ...previous.search,
        focusZone: output.state.zone,
        focusedResultKey: output.state.focusedResultKey,
        restoreResultKey: output.state.restoreResultKey,
      },
    };
    return { handled: output.handled, state: currentState, activation };
  }

  function openActions(input: LiveTvFeatureRefreshInput): LiveTvFeatureState {
    const previous = current();
    const actions = actionsFor(input, previous.epg, previous.selectedFavorite, null);
    currentState = {
      ...previous,
      layer: actions === null ? previous.layer : 'actions',
      actions,
      programInfo: null,
    };
    return currentState;
  }

  function moveAction(direction: 'PREVIOUS' | 'NEXT'): LiveTvFeatureState {
    const previous = current();
    if (previous.layer !== 'actions' || previous.actions === null) return previous;
    currentState = {
      ...previous,
      actions: {
        ...previous.actions,
        state: reduceChannelActions(previous.actions.state, {
          type: 'MOVE',
          direction,
          actions: previous.actions.items,
        }),
      },
    };
    return currentState;
  }

  function activateFocusedAction(): ChannelActionIntent | null {
    const state = current();
    if (state.layer !== 'actions' || state.actions === null) return null;
    const actionId = state.actions.state.focusedActionId;
    if (actionId === null) return null;
    return activateChannelAction(actionId, state.actions.context);
  }

  async function toggleFavorite(input: LiveTvFeatureRefreshInput): Promise<LiveTvFeatureState> {
    const previous = current();
    const channelId = input.highlightedChannelId;
    if (channelId === null) return previous;

    let toggled: boolean;
    try {
      toggled = await ports.favorites.toggle(input.providerId, channelId);
    } catch {
      return previous;
    }

    const refreshed = await refresh(input);
    currentState = {
      ...refreshed,
      selectedFavorite: toggled,
      actions: actionsFor(input, refreshed.epg, toggled, refreshed.actions),
    };
    return currentState;
  }

  function openProgramInfo(): LiveTvFeatureState {
    const previous = current();
    const detail = previous.epg.selected?.detail ?? null;
    if (detail === null) return previous;
    programInfoReturnLayer = previous.layer === 'actions' ? 'actions' : 'none';
    currentState = {
      ...previous,
      layer: 'program-info',
      programInfo: detail,
    };
    return currentState;
  }

  function closeTopLayer(): boolean {
    const previous = current();
    if (previous.layer === 'none') return false;
    if (previous.layer === 'program-info') {
      currentState = {
        ...previous,
        layer: programInfoReturnLayer === 'actions' && previous.actions !== null
          ? 'actions'
          : 'none',
        programInfo: null,
      };
      programInfoReturnLayer = 'none';
      return true;
    }
    currentState = {
      ...previous,
      layer: 'none',
      programInfo: null,
    };
    return true;
  }

  return {
    current,
    refresh,
    openSearch,
    updateSearchQuery,
    handleSearchKeyboard: handleSearchEvent,
    openActions,
    moveAction,
    activateFocusedAction,
    toggleFavorite,
    openProgramInfo,
    closeTopLayer,
  };
}
