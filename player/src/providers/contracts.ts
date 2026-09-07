import type {
  Category,
  Channel,
  ChannelId,
  ProviderId,
  ProviderKind,
} from '../domain/models.js';
import type { StreamRequest } from '../playback/contracts.js';

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  listCategories(providerId: ProviderId): Promise<readonly Category[]>;
  listChannels(providerId: ProviderId): Promise<readonly Channel[]>;
  resolveStream(providerId: ProviderId, channelId: ChannelId): Promise<StreamRequest>;
}
