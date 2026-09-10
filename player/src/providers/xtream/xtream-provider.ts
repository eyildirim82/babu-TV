import type { XtreamCredential } from '../../credentials/contracts.js';
import type { Category, Channel, ChannelId, ProviderId } from '../../domain/models.js';
import type { EpgSourceProgram, EpgWindow } from '../../epg/contracts.js';
import { loadXtreamChannelEpg } from '../../epg/xtream-source.js';
import type { StreamRequest } from '../../playback/contracts.js';
import type { ProviderAdapter, ProviderEpgCapability, ProviderProfile } from '../contracts.js';
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

function intersects(program: EpgSourceProgram, window: EpgWindow): boolean {
  return program.startMs < window.endMs && program.endMs > window.startMs;
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

  get epg(): ProviderEpgCapability {
    return {
      describeChannels: (channels) => channels
        .filter((channel) => channel.providerId === this.providerId)
        .map((channel) => ({
          providerId: this.providerId,
          channelId: channel.id,
          name: channel.name,
          epgIds: [channel.id],
        })),
      createSource: (channels) => {
        const scopedChannels = channels.filter((channel) => channel.providerId === this.providerId);
        return {
          providerId: this.providerId,
          listPrograms: async (window) => {
            const programs: EpgSourceProgram[] = [];
            for (const channel of scopedChannels) {
              const requestUrl = new URL(this.apiUrl('get_short_epg'));
              requestUrl.searchParams.set('stream_id', channel.id);
              const partition = await loadXtreamChannelEpg(
                this.http,
                requestUrl.toString(),
                channel.id,
              );
              programs.push(...partition.filter((program) => intersects(program, window)));
            }
            return programs;
          },
        };
      },
    };
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
