import type {
  Category,
  Channel,
  ChannelId,
  ProviderId,
  ProviderKind,
} from '../domain/models.js';
import type { StreamRequest } from '../playback/contracts.js';
import type { ProviderAdapter } from './contracts.js';

export type FakeProviderFailure = 401 | 403 | 404 | 500 | 'timeout' | 'malformed';
export type FakeProviderErrorCode =
  | 'HTTP_401'
  | 'HTTP_403'
  | 'HTTP_404'
  | 'HTTP_500'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE';

export interface FakeCategoryInput {
  id: string;
  name: string;
}

export interface FakeChannelInput {
  id: string;
  name: string;
  categoryId: string | null;
  logoUrl: string | null;
  number: number | null;
}

export interface FakeProviderOptions {
  kind: ProviderKind;
  categories: readonly FakeCategoryInput[];
  channels: readonly FakeChannelInput[];
  failure?: FakeProviderFailure | null;
}

export class FakeProviderError extends Error {
  constructor(
    public readonly code: FakeProviderErrorCode,
    public readonly status: number | null,
  ) {
    super(code);
    this.name = 'FakeProviderError';
  }
}

function toFailureError(failure: FakeProviderFailure): FakeProviderError {
  if (typeof failure === 'number') {
    return new FakeProviderError(`HTTP_${failure}` as FakeProviderErrorCode, failure);
  }
  if (failure === 'timeout') {
    return new FakeProviderError('TIMEOUT', null);
  }
  return new FakeProviderError('MALFORMED_RESPONSE', null);
}

export class FakeProvider implements ProviderAdapter {
  readonly kind: ProviderKind;
  private readonly categories: readonly FakeCategoryInput[];
  private readonly channels: readonly FakeChannelInput[];
  private readonly failure: FakeProviderFailure | null;

  constructor(options: FakeProviderOptions) {
    this.kind = options.kind;
    this.categories = options.categories;
    this.channels = options.channels;
    this.failure = options.failure ?? null;
  }

  private assertAvailable(): void {
    if (this.failure !== null) throw toFailureError(this.failure);
  }

  async listCategories(providerId: ProviderId): Promise<readonly Category[]> {
    this.assertAvailable();
    return this.categories.map((category) => ({
      providerId,
      id: category.id,
      name: category.name,
    }));
  }

  async listChannels(providerId: ProviderId): Promise<readonly Channel[]> {
    this.assertAvailable();
    return this.channels.map((channel) => ({
      providerId,
      id: channel.id,
      name: channel.name,
      categoryId: channel.categoryId,
      logoUrl: channel.logoUrl,
      number: channel.number,
    }));
  }

  async resolveStream(
    providerId: ProviderId,
    channelId: ChannelId,
  ): Promise<StreamRequest> {
    this.assertAvailable();
    return {
      url: `https://example.com/live/${encodeURIComponent(providerId)}/${encodeURIComponent(channelId)}.m3u8`,
    };
  }
}
