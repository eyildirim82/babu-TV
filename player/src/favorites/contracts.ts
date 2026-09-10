import type { ChannelId, ProviderId } from '../domain/models.js';

export interface FavoriteRecord {
  providerId: ProviderId;
  channelId: ChannelId;
  addedAtMs: number;
}

export interface FavoriteRepository {
  list(providerId: ProviderId): Promise<readonly FavoriteRecord[]>;
  has(providerId: ProviderId, channelId: ChannelId): Promise<boolean>;
  put(record: FavoriteRecord): Promise<void>;
  delete(providerId: ProviderId, channelId: ChannelId): Promise<void>;
  deleteProvider(providerId: ProviderId): Promise<void>;
}
