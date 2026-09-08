import type { XtreamCredential } from '../../credentials/contracts.js';
import type { Category, Channel, ChannelId, ProviderId } from '../../domain/models.js';
import type { StreamRequest } from '../../playback/contracts.js';
import type { ProviderAdapter, ProviderProfile } from '../contracts.js';
import type { ProviderHttpClient } from '../http/contracts.js';
import {
  normalizeXtreamCategories,
  normalizeXtreamChannels,
  normalizeXtreamProfile,
} from './xtream-normalize.js';

export class XtreamProvider implements ProviderAdapter {
  readonly kind = 'xtream' as const;

  constructor(
    public readonly providerId: ProviderId,
    private readonly credential: XtreamCredential,
    private readonly http: ProviderHttpClient,
  ) {}

  async getProfile(): Promise<ProviderProfile> {
    void this.credential;
    void this.http;
    return normalizeXtreamProfile(this.providerId, null);
  }

  async listCategories(): Promise<readonly Category[]> {
    return normalizeXtreamCategories(this.providerId, null);
  }

  async listChannels(): Promise<readonly Channel[]> {
    return normalizeXtreamChannels(this.providerId, null).channels;
  }

  async resolveStream(_channelId: ChannelId): Promise<StreamRequest> {
    return { url: '' };
  }
}
