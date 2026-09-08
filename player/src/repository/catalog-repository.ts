import type {
  Category,
  Channel,
  ChannelId,
  ProviderId,
} from '../domain/models.js';

export interface CatalogRepository {
  replaceCategories(providerId: ProviderId, categories: readonly Category[]): Promise<void>;
  listCategories(providerId: ProviderId): Promise<readonly Category[]>;
  replaceChannels(providerId: ProviderId, channels: readonly Channel[]): Promise<void>;
  listChannels(providerId: ProviderId): Promise<readonly Channel[]>;
  getChannel(providerId: ProviderId, channelId: ChannelId): Promise<Channel | null>;
  removeProviderCatalog(providerId: ProviderId): Promise<void>;
}
