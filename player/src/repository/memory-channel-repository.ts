import type { Channel, ChannelId, ProviderId } from '../domain/models.js';
import type { ChannelRepository } from './contracts.js';

export class MemoryChannelRepository implements ChannelRepository {
  private readonly channelsByProvider = new Map<ProviderId, Map<ChannelId, Channel>>();

  async replaceProviderChannels(
    providerId: ProviderId,
    channels: readonly Channel[],
  ): Promise<void> {
    const next = new Map<ChannelId, Channel>();
    for (const channel of channels) {
      next.set(channel.id, channel);
    }
    this.channelsByProvider.set(providerId, next);
  }

  async listChannels(providerId: ProviderId): Promise<readonly Channel[]> {
    return Array.from(this.channelsByProvider.get(providerId)?.values() ?? []);
  }

  async getChannel(
    providerId: ProviderId,
    channelId: ChannelId,
  ): Promise<Channel | null> {
    return this.channelsByProvider.get(providerId)?.get(channelId) ?? null;
  }
}
