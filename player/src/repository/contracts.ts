import type {
  Channel,
  ChannelId,
  ProviderId,
} from '../domain/models.js';

export interface ChannelRepository {
  replaceProviderChannels(
    providerId: ProviderId,
    channels: readonly Channel[],
  ): Promise<void>;

  listChannels(providerId: ProviderId): Promise<readonly Channel[]>;

  getChannel(
    providerId: ProviderId,
    channelId: ChannelId,
  ): Promise<Channel | null>;
}
