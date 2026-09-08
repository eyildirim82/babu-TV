import type { M3uCredential } from '../../credentials/contracts.js';
import type {
  Category,
  Channel,
  ChannelId,
  ProviderId,
} from '../../domain/models.js';
import type { StreamRequest } from '../../playback/contracts.js';
import type { ProviderAdapter, ProviderProfile } from '../contracts.js';
import { ProviderError } from '../errors.js';
import type { ProviderHttpClient } from '../http/contracts.js';
import {
  makeM3uCategoryId,
  makeM3uChannelId,
} from './m3u-identity.js';
import {
  M3uParseError,
  parseM3uDocument,
  type ParsedM3uEntry,
} from './m3u-parser.js';

interface M3uCatalog {
  categories: readonly Category[];
  channels: readonly Channel[];
  entriesByChannelId: ReadonlyMap<ChannelId, ParsedM3uEntry>;
}

function safeNetworkError(): ProviderError {
  return new ProviderError('NETWORK', null, 'Provider network request failed.');
}

function safeMalformedError(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Provider playlist was malformed.');
}

function normalizeGroup(group: string | null): string | null {
  if (group === null) return null;
  const trimmed = group.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildCatalog(providerId: ProviderId, entries: readonly ParsedM3uEntry[]): M3uCatalog {
  const categories: Category[] = [];
  const channels: Channel[] = [];
  const entriesByChannelId = new Map<ChannelId, ParsedM3uEntry>();
  const categoryIdByGroup = new Map<string, string>();
  const seenChannelIds = new Set<ChannelId>();

  for (const entry of entries) {
    const channelId = makeM3uChannelId(entry);
    if (seenChannelIds.has(channelId)) continue;
    seenChannelIds.add(channelId);

    const group = normalizeGroup(entry.group);
    let categoryId: string | null = null;
    if (group !== null) {
      const groupKey = group.toLowerCase();
      const existingId = categoryIdByGroup.get(groupKey);
      if (existingId) {
        categoryId = existingId;
      } else {
        categoryId = makeM3uCategoryId(group);
        categoryIdByGroup.set(groupKey, categoryId);
        categories.push({ providerId, id: categoryId, name: group });
      }
    }

    channels.push({
      providerId,
      id: channelId,
      name: entry.name,
      categoryId,
      logoUrl: entry.logoUrl,
      number: entry.channelNumber,
    });
    entriesByChannelId.set(channelId, entry);
  }

  return { categories, channels, entriesByChannelId };
}

function toStreamRequest(entry: ParsedM3uEntry): StreamRequest {
  const request: StreamRequest = { url: entry.streamUrl };

  if (entry.userAgent !== null) request.userAgent = entry.userAgent;
  if (Object.keys(entry.headers).length > 0) request.headers = entry.headers;
  if (entry.drm !== null) request.drm = entry.drm;
  request.useProxy = entry.useProxy;
  if (entry.proxyUrl !== null) request.proxyUrl = entry.proxyUrl;

  return request;
}

export class M3uProvider implements ProviderAdapter {
  readonly kind = 'm3u' as const;
  private catalogPromise: Promise<M3uCatalog> | null = null;

  constructor(
    public readonly providerId: ProviderId,
    private readonly credential: M3uCredential,
    private readonly http: ProviderHttpClient,
  ) {}

  private async loadCatalog(): Promise<M3uCatalog> {
    if (this.catalogPromise !== null) return this.catalogPromise;

    const load = async (): Promise<M3uCatalog> => {
      let text: string;
      try {
        text = await this.http.getText(this.credential.playlistUrl);
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw safeNetworkError();
      }

      try {
        return buildCatalog(this.providerId, parseM3uDocument(text));
      } catch (error) {
        if (error instanceof M3uParseError) throw safeMalformedError();
        if (error instanceof ProviderError) throw error;
        throw safeMalformedError();
      }
    };

    this.catalogPromise = load();
    try {
      return await this.catalogPromise;
    } catch (error) {
      this.catalogPromise = null;
      throw error;
    }
  }

  async getProfile(): Promise<ProviderProfile> {
    await this.loadCatalog();
    return {
      providerId: this.providerId,
      kind: 'm3u',
      accountName: null,
      expiresAtMs: null,
      maxConnections: null,
    };
  }

  async listCategories(): Promise<readonly Category[]> {
    return (await this.loadCatalog()).categories;
  }

  async listChannels(): Promise<readonly Channel[]> {
    return (await this.loadCatalog()).channels;
  }

  async resolveStream(channelId: ChannelId): Promise<StreamRequest> {
    const entry = (await this.loadCatalog()).entriesByChannelId.get(channelId);
    if (!entry) {
      throw new ProviderError('NOT_FOUND', null, 'Provider channel was not found.');
    }
    return toStreamRequest(entry);
  }
}
