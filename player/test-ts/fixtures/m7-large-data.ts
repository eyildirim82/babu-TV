import type {
  Category,
  Channel,
  EpgProgram,
  ProviderRecord,
} from '../../src/domain/models.js';
import type { FavoriteRecord } from '../../src/favorites/contracts.js';
import type { WatchAggregate } from '../../src/watch/contracts.js';

export const M7_PRIMARY_PROVIDER_ID = 'perf-provider-a';
export const M7_SECONDARY_PROVIDER_ID = 'perf-provider-b';
export const M7_CHANNEL_COUNT = 1_200;
export const M7_CATEGORY_COUNT = 200;
export const M7_PROGRAMS_PER_CHANNEL = 48;
export const M7_PROGRAM_DURATION_MS = 30 * 60 * 1_000;
export const M7_EPG_START_MS = 1_800_000_000_000;
export const M7_NOW_MS = M7_EPG_START_MS + 15 * 60 * 1_000;

function threeDigits(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function fourDigits(value: number): string {
  if (value < 10) return `000${value}`;
  if (value < 100) return `00${value}`;
  if (value < 1_000) return `0${value}`;
  return String(value);
}

function primaryChannelName(index: number): string {
  const turkishNames = [
    'İstanbul Haber',
    'Işık Spor',
    'Şeker Gündem',
    'Ğüneş Çocuk',
    'Üsküdar Kültür',
    'Özel Yaşam',
    'Çiçek TV',
  ];
  return turkishNames[index] ?? `Kanal ${fourDigits(index)}`;
}

export interface M7LargeDataFixture {
  readonly providers: readonly ProviderRecord[];
  readonly primaryCategories: readonly Category[];
  readonly secondaryCategories: readonly Category[];
  readonly allCategories: readonly Category[];
  readonly primaryChannels: readonly Channel[];
  readonly secondaryChannels: readonly Channel[];
  readonly allChannels: readonly Channel[];
  readonly epgPrograms: readonly EpgProgram[];
  readonly favorites: readonly FavoriteRecord[];
  readonly watchAggregates: readonly WatchAggregate[];
}

export function createM7LargeDataFixture(): M7LargeDataFixture {
  const primaryCategories: Category[] = Array.from({ length: M7_CATEGORY_COUNT }, (_, index) => ({
    providerId: M7_PRIMARY_PROVIDER_ID,
    id: `category-${threeDigits(index)}`,
    name: `Kategori ${threeDigits(index)} Şğüöç`,
  }));

  const secondaryCategories: Category[] = [
    {
      providerId: M7_SECONDARY_PROVIDER_ID,
      id: 'category-007',
      name: 'Foreign category',
    },
    {
      providerId: M7_SECONDARY_PROVIDER_ID,
      id: 'category-011',
      name: 'Secondary only',
    },
  ];

  const primaryChannels: Channel[] = Array.from({ length: M7_CHANNEL_COUNT }, (_, index) => ({
    providerId: M7_PRIMARY_PROVIDER_ID,
    id: `channel-${index}`,
    name: primaryChannelName(index),
    categoryId: `category-${threeDigits(index % M7_CATEGORY_COUNT)}`,
    logoUrl: null,
    number: index + 1,
  }));

  const secondaryChannels: Channel[] = [7, 207, 407].map((index) => ({
    providerId: M7_SECONDARY_PROVIDER_ID,
    id: `channel-${index}`,
    name: `Secondary ${index}`,
    categoryId: 'category-007',
    logoUrl: null,
    number: 10_000 + index,
  }));

  const epgPrograms: EpgProgram[] = [];
  for (const channel of primaryChannels) {
    for (let slot = 0; slot < M7_PROGRAMS_PER_CHANNEL; slot += 1) {
      const startMs = M7_EPG_START_MS + slot * M7_PROGRAM_DURATION_MS;
      epgPrograms.push({
        channelId: channel.id,
        startMs,
        endMs: startMs + M7_PROGRAM_DURATION_MS,
        title: `Program ${channel.id} ${slot}`,
        description: null,
      });
    }
  }

  const favorites: FavoriteRecord[] = [];
  const watchAggregates: WatchAggregate[] = [];
  for (let index = 0; index < M7_CHANNEL_COUNT; index += 1) {
    const channelId = `channel-${index}`;
    if (index % 3 === 0) {
      favorites.push({
        providerId: M7_PRIMARY_PROVIDER_ID,
        channelId,
        addedAtMs: M7_NOW_MS - index,
      });
    }
    if (index % 2 === 0) {
      watchAggregates.push({
        providerId: M7_PRIMARY_PROVIDER_ID,
        channelId,
        meaningfulWatchMs: (index + 1) * 1_000,
        meaningfulOpenCount: index % 7,
        lastMeaningfulWatchAtMs: M7_NOW_MS - index * 10,
      });
    }
  }

  favorites.push({
    providerId: M7_SECONDARY_PROVIDER_ID,
    channelId: 'channel-7',
    addedAtMs: M7_NOW_MS + 1,
  });
  watchAggregates.push({
    providerId: M7_SECONDARY_PROVIDER_ID,
    channelId: 'channel-7',
    meaningfulWatchMs: 999_999_999,
    meaningfulOpenCount: 999,
    lastMeaningfulWatchAtMs: M7_NOW_MS,
  });

  const providers: ProviderRecord[] = [
    {
      id: M7_PRIMARY_PROVIDER_ID,
      kind: 'xtream',
      name: 'Synthetic Primary',
      createdAtMs: 1,
      lastSuccessfulSyncAtMs: null,
    },
    {
      id: M7_SECONDARY_PROVIDER_ID,
      kind: 'm3u',
      name: 'Synthetic Secondary',
      createdAtMs: 2,
      lastSuccessfulSyncAtMs: null,
    },
  ];

  return {
    providers,
    primaryCategories,
    secondaryCategories,
    allCategories: [...primaryCategories, ...secondaryCategories],
    primaryChannels,
    secondaryChannels,
    allChannels: [...primaryChannels, ...secondaryChannels],
    epgPrograms,
    favorites,
    watchAggregates,
  };
}
