import type { ChannelId, ProviderId } from '../domain/models.js';
import type { FavoriteRecord, FavoriteRepository } from './contracts.js';

export class FavoriteService {
  constructor(
    private readonly repository: FavoriteRepository,
    private readonly nowMs: () => number = Date.now,
  ) {}

  list(providerId: ProviderId): Promise<readonly FavoriteRecord[]> {
    return this.repository.list(providerId);
  }

  isFavorite(providerId: ProviderId, channelId: ChannelId): Promise<boolean> {
    return this.repository.has(providerId, channelId);
  }

  async add(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    if (await this.repository.has(providerId, channelId)) return;
    await this.repository.put({ providerId, channelId, addedAtMs: this.nowMs() });
  }

  remove(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    return this.repository.delete(providerId, channelId);
  }

  async toggle(providerId: ProviderId, channelId: ChannelId): Promise<boolean> {
    if (await this.repository.has(providerId, channelId)) {
      await this.repository.delete(providerId, channelId);
      return false;
    }

    await this.add(providerId, channelId);
    return true;
  }
}
