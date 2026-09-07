import type {
  Category,
  Channel,
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

export class FakeProvider implements ProviderAdapter {
  readonly kind: ProviderKind;

  constructor(_options: FakeProviderOptions) {
    this.kind = _options.kind;
  }

  async listCategories(_providerId: ProviderId): Promise<readonly Category[]> {
    return [];
  }

  async listChannels(_providerId: ProviderId): Promise<readonly Channel[]> {
    return [];
  }

  async resolveStream(
    _providerId: ProviderId,
    _channelId: string,
  ): Promise<StreamRequest> {
    return { url: 'https://example.invalid/not-implemented.m3u8' };
  }
}
