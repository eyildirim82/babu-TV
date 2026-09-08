import type { XtreamCredential } from '../../credentials/contracts.js';
import type { Category, Channel, ChannelId, ProviderId } from '../../domain/models.js';
import type { StreamRequest } from '../../playback/contracts.js';
import type { ProviderAdapter, ProviderProfile } from '../contracts.js';
import { ProviderError } from '../errors.js';
import type { ProviderHttpClient } from '../http/contracts.js';
import {
  normalizeXtreamCategories,
  normalizeXtreamChannels,
  normalizeXtreamProfile,
} from './xtream-normalize.js';

function invalidServerUrl(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider server URL is invalid.');
}

function normalizeServerUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw invalidServerUrl();
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw invalidServerUrl();
  }

  parsed.search = '';
  parsed.hash = '';
  parsed.username = '';
  parsed.password = '';

  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
}

export class XtreamProvider implements ProviderAdapter {
  readonly kind = 'xtream' as const;
  private readonly serverUrl: string;
  private streamExtensions = new Map<ChannelId, string>();

  constructor(
    public readonly providerId: ProviderId,
    private readonly credential: XtreamCredential,
    private readonly http: ProviderHttpClient,
  ) {
    this.serverUrl = normalizeServerUrl(credential.serverUrl);
  }

  private apiUrl(action?: string): string {
    const url = new URL(`${this.serverUrl}/player_api.php`);
    url.searchParams.set('username', this.credential.username);
    url.searchParams.set('password', this.credential.password);
    if (action) url.searchParams.set('action', action);
    return url.toString();
  }

  async getProfile(): Promise<ProviderProfile> {
    const raw = await this.http.getJson<unknown>(this.apiUrl());
    return normalizeXtreamProfile(this.providerId, raw);
  }

  async listCategories(): Promise<readonly Category[]> {
    const raw = await this.http.getJson<unknown>(this.apiUrl('get_live_categories'));
    return normalizeXtreamCategories(this.providerId, raw);
  }

  async listChannels(): Promise<readonly Channel[]> {
    const raw = await this.http.getJson<unknown>(this.apiUrl('get_live_streams'));
    const normalized = normalizeXtreamChannels(this.providerId, raw);
    this.streamExtensions = new Map(normalized.extensions);
    return normalized.channels;
  }

  async resolveStream(channelId: ChannelId): Promise<StreamRequest> {
    if (!this.streamExtensions.has(channelId)) {
      await this.listChannels();
    }

    const extension = this.streamExtensions.get(channelId);
    if (!extension) {
      throw new ProviderError('NOT_FOUND', null, 'Provider channel was not found.');
    }

    const username = encodeURIComponent(this.credential.username);
    const password = encodeURIComponent(this.credential.password);
    const streamId = encodeURIComponent(channelId);
    return {
      url: `${this.serverUrl}/live/${username}/${password}/${streamId}.${extension}`,
    };
  }
}
