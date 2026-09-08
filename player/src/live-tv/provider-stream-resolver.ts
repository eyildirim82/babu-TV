import type { CredentialStore } from '../credentials/contracts.js';
import type { ChannelId, ProviderId } from '../domain/models.js';
import type { StreamRequest } from '../playback/contracts.js';
import type { ProviderAdapterFactory } from '../providers/contracts.js';
import { ProviderError } from '../providers/errors.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import type { ChannelStreamResolver } from './contracts.js';

export class ProviderStreamResolver implements ChannelStreamResolver {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly credentials: CredentialStore,
    private readonly adapters: ProviderAdapterFactory,
  ) {}

  async resolve(providerId: ProviderId, channelId: ChannelId): Promise<StreamRequest> {
    const provider = await this.providers.getProvider(providerId);
    if (provider === null) {
      throw new ProviderError('NOT_FOUND', null, 'Provider configuration was not found.');
    }

    const credential = await this.credentials.load(providerId);
    if (credential === null) {
      throw new ProviderError('UNAVAILABLE', null, 'Provider credential is unavailable.');
    }

    return this.adapters.create(provider, credential).resolveStream(channelId);
  }
}
