import type { ProviderCredential } from '../credentials/contracts.js';
import type {
  Category,
  Channel,
  ChannelId,
  ProviderId,
  ProviderKind,
  ProviderRecord,
} from '../domain/models.js';
import type { EpgChannelDescriptor, EpgSource } from '../epg/contracts.js';
import type { StreamRequest } from '../playback/contracts.js';

export interface ProviderProfile {
  providerId: ProviderId;
  kind: ProviderKind;
  accountName: string | null;
  expiresAtMs: number | null;
  maxConnections: number | null;
}

export interface ProviderEpgCapability {
  describeChannels(channels: readonly Channel[]): readonly EpgChannelDescriptor[];
  createSource(channels: readonly Channel[]): EpgSource;
}

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  readonly kind: ProviderKind;
  readonly epg?: ProviderEpgCapability;
  getProfile(): Promise<ProviderProfile>;
  listCategories(): Promise<readonly Category[]>;
  listChannels(): Promise<readonly Channel[]>;
  resolveStream(channelId: ChannelId): Promise<StreamRequest>;
}

export interface ProviderAdapterFactory {
  create(provider: ProviderRecord, credential: ProviderCredential): ProviderAdapter;
}
