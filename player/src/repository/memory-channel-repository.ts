import type { Channel, ChannelId, ProviderId } from '../domain/models.js';
import type { ChannelRepository } from './contracts.js';

export class MemoryChannelRepository implements ChannelRepository {
  async replaceProviderChannels(
    _providerId: ProviderId,
    _channels: readonly Channel[],
  ): Promise<void> {}

  async listChannels(_providerId: ProviderId): Promise<readonly Channel[]> {
    return [];
  }

  async getChannel(
    _providerId: ProviderId,
    _channelId: ChannelId,
  ): Promise<Channel | null> {
    return null;
  }
}
