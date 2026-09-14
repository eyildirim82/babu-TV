import type {
  Category,
  Channel,
  ChannelId,
  ProviderId,
} from '../domain/models.js';
import { makeChannelKey } from '../domain/models.js';
import type { StructuredStore } from '../storage/contracts.js';
import type { CatalogRepository } from './catalog-repository.js';

// `position` records provider order. IndexedDB returns index rows in primary-key
// order, so listing must sort by it. It is optional because rows written before
// it existed (or seeded directly) must stay readable until the next sync.
interface StoredCategory extends Category {
  key: string;
  position?: number;
}

interface StoredChannel extends Channel {
  key: string;
  position?: number;
}

function categoryKey(providerId: ProviderId, categoryId: string): string {
  return `${providerId}:${categoryId}`;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isOptionalPosition(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0);
}

function byProviderPosition<T extends { position?: number }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (
      (a.row.position ?? Number.MAX_SAFE_INTEGER) - (b.row.position ?? Number.MAX_SAFE_INTEGER)
      || a.index - b.index
    ))
    .map(({ row }) => row);
}

function isStoredCategory(value: unknown): value is StoredCategory {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.key === 'string'
    && typeof candidate.providerId === 'string'
    && typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && isOptionalPosition(candidate.position)
    && candidate.key === categoryKey(candidate.providerId, candidate.id);
}

function isStoredChannel(value: unknown): value is StoredChannel {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.key === 'string'
    && typeof candidate.providerId === 'string'
    && typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && isNullableString(candidate.categoryId)
    && isNullableString(candidate.logoUrl)
    && isNullableFiniteNumber(candidate.number)
    && isOptionalPosition(candidate.position)
    && candidate.key === makeChannelKey(candidate.providerId, candidate.id);
}

function storeCategory(providerId: ProviderId, category: Category, position: number): StoredCategory {
  return {
    key: categoryKey(providerId, category.id),
    providerId,
    id: category.id,
    name: category.name,
    position,
  };
}

function storeChannel(providerId: ProviderId, channel: Channel, position: number): StoredChannel {
  return {
    key: makeChannelKey(providerId, channel.id),
    providerId,
    id: channel.id,
    name: channel.name,
    categoryId: channel.categoryId,
    logoUrl: channel.logoUrl,
    number: channel.number,
    position,
  };
}

function categoryFromStored(category: StoredCategory): Category {
  return {
    providerId: category.providerId,
    id: category.id,
    name: category.name,
  };
}

function channelFromStored(channel: StoredChannel): Channel {
  return {
    providerId: channel.providerId,
    id: channel.id,
    name: channel.name,
    categoryId: channel.categoryId,
    logoUrl: channel.logoUrl,
    number: channel.number,
  };
}

export class StructuredCatalogRepository implements CatalogRepository {
  constructor(private readonly store: StructuredStore) {}

  async replaceCategories(providerId: ProviderId, categories: readonly Category[]): Promise<void> {
    await this.store.replaceByIndex(
      'categories',
      'providerId',
      providerId,
      categories.map((category, position) => storeCategory(providerId, category, position)),
    );
  }

  async listCategories(providerId: ProviderId): Promise<readonly Category[]> {
    const categories = await this.store.getAllByIndex<unknown>(
      'categories',
      'providerId',
      providerId,
    );
    return byProviderPosition(categories
      .filter((category): category is StoredCategory => (
        isStoredCategory(category) && category.providerId === providerId
      )))
      .map(categoryFromStored);
  }

  async replaceChannels(providerId: ProviderId, channels: readonly Channel[]): Promise<void> {
    await this.store.replaceByIndex(
      'channels',
      'providerId',
      providerId,
      channels.map((channel, position) => storeChannel(providerId, channel, position)),
    );
  }

  async listChannels(providerId: ProviderId): Promise<readonly Channel[]> {
    const channels = await this.store.getAllByIndex<unknown>(
      'channels',
      'providerId',
      providerId,
    );
    return byProviderPosition(channels
      .filter((channel): channel is StoredChannel => (
        isStoredChannel(channel) && channel.providerId === providerId
      )))
      .map(channelFromStored);
  }

  async getChannel(providerId: ProviderId, channelId: ChannelId): Promise<Channel | null> {
    const channel = await this.store.get<unknown>(
      'channels',
      makeChannelKey(providerId, channelId),
    );
    if (!isStoredChannel(channel)
      || channel.providerId !== providerId
      || channel.id !== channelId) {
      return null;
    }
    return channelFromStored(channel);
  }

  async removeProviderCatalog(providerId: ProviderId): Promise<void> {
    await this.store.deleteByIndex('categories', 'providerId', providerId);
    await this.store.deleteByIndex('channels', 'providerId', providerId);
  }
}