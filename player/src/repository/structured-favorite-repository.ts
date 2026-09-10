import type { ChannelId, ProviderId } from '../domain/models.js';
import type { FavoriteRecord, FavoriteRepository } from '../favorites/contracts.js';
import type { StructuredStore } from '../storage/contracts.js';

const FAVORITE_KIND = 'user.favorite.v1';

interface StoredFavoriteRecord extends FavoriteRecord {
  key: string;
  kind: typeof FAVORITE_KIND;
}

function favoriteKey(providerId: ProviderId, channelId: ChannelId): string {
  return `user.favorite:${JSON.stringify([providerId, channelId])}`;
}

function storedFavorite(record: FavoriteRecord): StoredFavoriteRecord {
  return {
    key: favoriteKey(record.providerId, record.channelId),
    kind: FAVORITE_KIND,
    providerId: record.providerId,
    channelId: record.channelId,
    addedAtMs: record.addedAtMs,
  };
}

function isStoredFavorite(value: unknown): value is StoredFavoriteRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.kind === FAVORITE_KIND
    && typeof record.key === 'string'
    && typeof record.providerId === 'string'
    && typeof record.channelId === 'string'
    && typeof record.addedAtMs === 'number';
}

function favoriteFromStored(record: StoredFavoriteRecord): FavoriteRecord {
  return {
    providerId: record.providerId,
    channelId: record.channelId,
    addedAtMs: record.addedAtMs,
  };
}

export class StructuredFavoriteRepository implements FavoriteRepository {
  constructor(private readonly store: StructuredStore) {}

  async list(providerId: ProviderId): Promise<readonly FavoriteRecord[]> {
    return (await this.store.getAll<unknown>('app_state'))
      .filter(isStoredFavorite)
      .filter((record) => record.providerId === providerId)
      .map(favoriteFromStored)
      .sort((a, b) => a.addedAtMs - b.addedAtMs || a.channelId.localeCompare(b.channelId));
  }

  async has(providerId: ProviderId, channelId: ChannelId): Promise<boolean> {
    const record = await this.store.get<unknown>('app_state', favoriteKey(providerId, channelId));
    return isStoredFavorite(record)
      && record.providerId === providerId
      && record.channelId === channelId;
  }

  async put(record: FavoriteRecord): Promise<void> {
    await this.store.put('app_state', storedFavorite(record));
  }

  delete(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    return this.store.delete('app_state', favoriteKey(providerId, channelId));
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    const records = await this.store.getAll<unknown>('app_state');
    for (const record of records) {
      if (isStoredFavorite(record) && record.providerId === providerId) {
        await this.store.delete('app_state', record.key);
      }
    }
  }
}
