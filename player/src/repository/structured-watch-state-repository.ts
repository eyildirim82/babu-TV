import type { ChannelId, ProviderId } from '../domain/models.js';
import type {
  LastWatchedRecord,
  WatchAggregate,
  WatchStateRepository,
} from '../watch/contracts.js';
import type { StructuredStore } from '../storage/contracts.js';

const LAST_WATCHED_KIND = 'user.watch.last.v1';
const WATCH_AGGREGATE_KIND = 'user.watch.aggregate.v1';

interface StoredLastWatchedRecord extends LastWatchedRecord {
  key: string;
  kind: typeof LAST_WATCHED_KIND;
}

interface StoredWatchAggregate extends WatchAggregate {
  key: string;
  kind: typeof WATCH_AGGREGATE_KIND;
}

function lastWatchedKey(providerId: ProviderId): string {
  return `user.watch.last:${JSON.stringify(providerId)}`;
}

function aggregateKey(providerId: ProviderId, channelId: ChannelId): string {
  return `user.watch.aggregate:${JSON.stringify([providerId, channelId])}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStoredLastWatched(value: unknown): value is StoredLastWatchedRecord {
  if (!isRecord(value)) return false;
  return value.kind === LAST_WATCHED_KIND
    && typeof value.key === 'string'
    && typeof value.providerId === 'string'
    && typeof value.channelId === 'string'
    && typeof value.lastPlayedAtMs === 'number';
}

function isStoredAggregate(value: unknown): value is StoredWatchAggregate {
  if (!isRecord(value)) return false;
  return value.kind === WATCH_AGGREGATE_KIND
    && typeof value.key === 'string'
    && typeof value.providerId === 'string'
    && typeof value.channelId === 'string'
    && typeof value.meaningfulWatchMs === 'number'
    && typeof value.meaningfulOpenCount === 'number'
    && (value.lastMeaningfulWatchAtMs === null || typeof value.lastMeaningfulWatchAtMs === 'number');
}

function lastWatchedFromStored(record: StoredLastWatchedRecord): LastWatchedRecord {
  return {
    providerId: record.providerId,
    channelId: record.channelId,
    lastPlayedAtMs: record.lastPlayedAtMs,
  };
}

function aggregateFromStored(record: StoredWatchAggregate): WatchAggregate {
  return {
    providerId: record.providerId,
    channelId: record.channelId,
    meaningfulWatchMs: record.meaningfulWatchMs,
    meaningfulOpenCount: record.meaningfulOpenCount,
    lastMeaningfulWatchAtMs: record.lastMeaningfulWatchAtMs,
  };
}

export class StructuredWatchStateRepository implements WatchStateRepository {
  constructor(private readonly store: StructuredStore) {}

  async getLastWatched(providerId: ProviderId): Promise<LastWatchedRecord | null> {
    const record = await this.store.get<unknown>('app_state', lastWatchedKey(providerId));
    return isStoredLastWatched(record) && record.providerId === providerId
      ? lastWatchedFromStored(record)
      : null;
  }

  async setLastWatched(record: LastWatchedRecord): Promise<void> {
    await this.store.put<StoredLastWatchedRecord>('app_state', {
      key: lastWatchedKey(record.providerId),
      kind: LAST_WATCHED_KIND,
      providerId: record.providerId,
      channelId: record.channelId,
      lastPlayedAtMs: record.lastPlayedAtMs,
    });
  }

  async getAggregate(
    providerId: ProviderId,
    channelId: ChannelId,
  ): Promise<WatchAggregate | null> {
    const record = await this.store.get<unknown>('app_state', aggregateKey(providerId, channelId));
    return isStoredAggregate(record)
      && record.providerId === providerId
      && record.channelId === channelId
      ? aggregateFromStored(record)
      : null;
  }

  async listAggregates(providerId: ProviderId): Promise<readonly WatchAggregate[]> {
    return (await this.store.getAll<unknown>('app_state'))
      .filter(isStoredAggregate)
      .filter((record) => record.providerId === providerId)
      .map(aggregateFromStored);
  }

  async putAggregate(record: WatchAggregate): Promise<void> {
    await this.store.put<StoredWatchAggregate>('app_state', {
      key: aggregateKey(record.providerId, record.channelId),
      kind: WATCH_AGGREGATE_KIND,
      providerId: record.providerId,
      channelId: record.channelId,
      meaningfulWatchMs: record.meaningfulWatchMs,
      meaningfulOpenCount: record.meaningfulOpenCount,
      lastMeaningfulWatchAtMs: record.lastMeaningfulWatchAtMs,
    });
  }

  async deleteChannel(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    await this.store.delete('app_state', aggregateKey(providerId, channelId));
    const lastWatched = await this.getLastWatched(providerId);
    if (lastWatched?.channelId === channelId) {
      await this.store.delete('app_state', lastWatchedKey(providerId));
    }
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    await this.store.delete('app_state', lastWatchedKey(providerId));
    const records = await this.store.getAll<unknown>('app_state');
    for (const record of records) {
      if (isStoredAggregate(record) && record.providerId === providerId) {
        await this.store.delete('app_state', record.key);
      }
    }
  }
}
