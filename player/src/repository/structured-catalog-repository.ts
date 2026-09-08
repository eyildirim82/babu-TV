import type {
  Category,
  Channel,
  ChannelId,
  ProviderId,
} from '../domain/models.js';
import { makeChannelKey } from '../domain/models.js';
import type { StructuredStore } from '../storage/contracts.js';
import type { CatalogRepository } from './catalog-repository.js';

interface StoredCategory extends Category {
  key: string;
}

interface StoredChannel extends Channel {
  key: string;
}

function categoryKey(providerId: ProviderId, categoryId: string): string {
  return `${providerId}:${categoryId}`;
}

function storeCategory(providerId: ProviderId, category: Category): StoredCategory {
  return {
    key: categoryKey(providerId, category.id),
    providerId,
    id: category.id,
    name: category.name,
  };
}

function storeChannel(providerId: ProviderId, channel: Channel): StoredChannel {
  return {
    key: makeChannelKey(providerId, channel.id),
    providerId,
    id: channel.id,
    name: channel.name,
    categoryId: channel.categoryId,
    logoUrl: channel.logoUrl,
    number: channel.number,
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
      categories.map((category) => storeCategory(providerId, category)),
    );
  }

  async listCategories(providerId: ProviderId): Promise<readonly Category[]> {
    const categories = await this.store.getAllByIndex<StoredCategory>(
      'categories',
      'providerId',
      providerId,
    );
    return categories.map(categoryFromStored);
  }

  async replaceChannels(providerId: ProviderId, channels: readonly Channel[]): Promise<void> {
    await this.store.replaceByIndex(
      'channels',
      'providerId',
      providerId,
      channels.map((channel) => storeChannel(providerId, channel)),
    );
  }

  async listChannels(providerId: ProviderId): Promise<readonly Channel[]> {
    const channels = await this.store.getAllByIndex<StoredChannel>(
      'channels',
      'providerId',
      providerId,
    );
    return channels.map(channelFromStored);
  }

  async getChannel(providerId: ProviderId, channelId: ChannelId): Promise<Channel | null> {
    const channel = await this.store.get<StoredChannel>(
      'channels',
      makeChannelKey(providerId, channelId),
    );
    return channel === null ? null : channelFromStored(channel);
  }

  async removeProviderCatalog(providerId: ProviderId): Promise<void> {
    await this.store.deleteByIndex('categories', 'providerId', providerId);
    await this.store.deleteByIndex('channels', 'providerId', providerId);
  }
}
