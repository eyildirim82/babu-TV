import type {
  Channel,
  ChannelId,
  EpgProgram,
  ProviderId,
  ProviderKind,
  ProviderRecord,
} from '../domain/models.js';
import type { FavoriteRecord } from '../favorites/contracts.js';
import type { LastWatchedRecord, WatchAggregate } from '../watch/contracts.js';
import {
  rankFrequentlyWatched,
  type WatchScorePolicy,
} from '../watch/score.js';

export type HomeActionIntent =
  | { readonly type: 'SELECT_PROVIDER'; readonly providerId: ProviderId }
  | {
      readonly type: 'OPEN_LIVE_TV';
      readonly providerId: ProviderId;
      readonly scope: 'all' | 'favorites';
    }
  | {
      readonly type: 'OPEN_LIVE_TV_CHANNEL';
      readonly providerId: ProviderId;
      readonly channelId: ChannelId;
    }
  | { readonly type: 'OPEN_SETTINGS' };

export interface HomeProviderOption {
  readonly providerId: ProviderId;
  readonly kind: ProviderKind;
  readonly name: string;
  readonly isActive: boolean;
  readonly intent: Extract<HomeActionIntent, { type: 'SELECT_PROVIDER' }>;
}

export interface HomeProviderSelectorState {
  readonly activeProviderId: ProviderId | null;
  readonly options: readonly HomeProviderOption[];
}

export interface HomeChannelCard {
  readonly providerId: ProviderId;
  readonly channelId: ChannelId;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly number: number | null;
  readonly currentProgram: EpgProgram | null;
  readonly intent: Extract<HomeActionIntent, { type: 'OPEN_LIVE_TV_CHANNEL' }>;
}

export interface HomeLastWatchedCard extends HomeChannelCard {
  readonly lastPlayedAtMs: number;
}

export interface HomeLiveTvState {
  readonly available: boolean;
  readonly intent: Extract<HomeActionIntent, { type: 'OPEN_LIVE_TV' }> | null;
}

export interface HomeFavoritesState {
  readonly items: readonly HomeChannelCard[];
  readonly viewAllIntent: Extract<HomeActionIntent, { type: 'OPEN_LIVE_TV' }> | null;
}

export interface HomeFrequentlyWatchedState {
  readonly items: readonly HomeChannelCard[];
}

export interface HomeSettingsState {
  readonly intent: Extract<HomeActionIntent, { type: 'OPEN_SETTINGS' }>;
}

export type HomeFocusTarget =
  | { readonly kind: 'provider-selector' }
  | { readonly kind: 'last-watched'; readonly channelId: ChannelId }
  | { readonly kind: 'live-tv' };

export interface HomeProjectionInput {
  readonly providers: readonly ProviderRecord[];
  readonly activeProviderId: ProviderId | null;
  /** Catalog rows supplied for Home. HOME-D filters them to the valid active provider. */
  readonly channels: readonly Channel[];
  readonly lastWatched: LastWatchedRecord | null;
  readonly favorites: readonly FavoriteRecord[];
  readonly watchAggregates: readonly WatchAggregate[];
  readonly nowMs: number;
  readonly watchScorePolicy: WatchScorePolicy;
  /** Optional current EPG values must already come from the active provider's EpgQuery partition. */
  readonly currentPrograms?: ReadonlyMap<ChannelId, EpgProgram>;
}

export interface HomeViewModel {
  readonly providerSelector: HomeProviderSelectorState;
  readonly lastWatched: HomeLastWatchedCard | null;
  readonly liveTv: HomeLiveTvState;
  readonly favorites: HomeFavoritesState;
  readonly frequentlyWatched: HomeFrequentlyWatchedState;
  readonly settings: HomeSettingsState;
  readonly defaultFocus: HomeFocusTarget;
}

function compareStableId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function currentProgramFor(
  input: HomeProjectionInput,
  channelId: ChannelId,
): EpgProgram | null {
  const program = input.currentPrograms?.get(channelId) ?? null;
  return program?.channelId === channelId ? program : null;
}

function channelCard(
  input: HomeProjectionInput,
  providerId: ProviderId,
  channel: Channel,
): HomeChannelCard {
  return {
    providerId,
    channelId: channel.id,
    name: channel.name,
    logoUrl: channel.logoUrl,
    number: channel.number,
    currentProgram: currentProgramFor(input, channel.id),
    intent: {
      type: 'OPEN_LIVE_TV_CHANNEL',
      providerId,
      channelId: channel.id,
    },
  };
}

function providerSelector(
  providers: readonly ProviderRecord[],
  activeProviderId: ProviderId | null,
): HomeProviderSelectorState {
  const sorted = [...providers].sort((a, b) =>
    a.createdAtMs - b.createdAtMs || compareStableId(a.id, b.id),
  );
  const effectiveActiveProviderId = activeProviderId !== null
    && sorted.some((provider) => provider.id === activeProviderId)
    ? activeProviderId
    : null;

  return {
    activeProviderId: effectiveActiveProviderId,
    options: sorted.map((provider) => ({
      providerId: provider.id,
      kind: provider.kind,
      name: provider.name,
      isActive: provider.id === effectiveActiveProviderId,
      intent: { type: 'SELECT_PROVIDER', providerId: provider.id },
    })),
  };
}

export function createHomeViewModel(input: HomeProjectionInput): HomeViewModel {
  const selector = providerSelector(input.providers, input.activeProviderId);
  const providerId = selector.activeProviderId;

  if (providerId === null) {
    return {
      providerSelector: selector,
      lastWatched: null,
      liveTv: { available: false, intent: null },
      favorites: { items: [], viewAllIntent: null },
      frequentlyWatched: { items: [] },
      settings: { intent: { type: 'OPEN_SETTINGS' } },
      defaultFocus: { kind: 'provider-selector' },
    };
  }

  const activeChannels = input.channels.filter((channel) => channel.providerId === providerId);
  const channelsById = new Map(activeChannels.map((channel) => [channel.id, channel] as const));

  let lastWatched: HomeLastWatchedCard | null = null;
  if (input.lastWatched?.providerId === providerId) {
    const channel = channelsById.get(input.lastWatched.channelId);
    if (channel !== undefined) {
      lastWatched = {
        ...channelCard(input, providerId, channel),
        lastPlayedAtMs: input.lastWatched.lastPlayedAtMs,
      };
    }
  }

  const favoriteItems = input.favorites
    .filter((record) => record.providerId === providerId && channelsById.has(record.channelId))
    .slice()
    .sort((a, b) => b.addedAtMs - a.addedAtMs || compareStableId(a.channelId, b.channelId))
    .map((record) => channelCard(input, providerId, channelsById.get(record.channelId)!));

  const aggregateCandidates = input.watchAggregates.filter((record) =>
    record.providerId === providerId && channelsById.has(record.channelId),
  );
  const frequentItems = rankFrequentlyWatched(
    providerId,
    aggregateCandidates,
    input.nowMs,
    input.watchScorePolicy,
    aggregateCandidates.length,
  ).map(({ record }) => channelCard(input, providerId, channelsById.get(record.channelId)!));

  return {
    providerSelector: selector,
    lastWatched,
    liveTv: {
      available: true,
      intent: { type: 'OPEN_LIVE_TV', providerId, scope: 'all' },
    },
    favorites: {
      items: favoriteItems,
      viewAllIntent: { type: 'OPEN_LIVE_TV', providerId, scope: 'favorites' },
    },
    frequentlyWatched: { items: frequentItems },
    settings: { intent: { type: 'OPEN_SETTINGS' } },
    defaultFocus: lastWatched === null
      ? { kind: 'live-tv' }
      : { kind: 'last-watched', channelId: lastWatched.channelId },
  };
}
