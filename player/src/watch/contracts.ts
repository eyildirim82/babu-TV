import type { ChannelId, ProviderId } from '../domain/models.js';

export interface LastWatchedRecord {
  providerId: ProviderId;
  channelId: ChannelId;
  lastPlayedAtMs: number;
}

export interface WatchAggregate {
  providerId: ProviderId;
  channelId: ChannelId;
  meaningfulWatchMs: number;
  meaningfulOpenCount: number;
  lastMeaningfulWatchAtMs: number | null;
}

export interface WatchStateRepository {
  getLastWatched(providerId: ProviderId): Promise<LastWatchedRecord | null>;
  setLastWatched(record: LastWatchedRecord): Promise<void>;
  getAggregate(
    providerId: ProviderId,
    channelId: ChannelId,
  ): Promise<WatchAggregate | null>;
  listAggregates(providerId: ProviderId): Promise<readonly WatchAggregate[]>;
  putAggregate(record: WatchAggregate): Promise<void>;
  deleteChannel(providerId: ProviderId, channelId: ChannelId): Promise<void>;
  deleteProvider(providerId: ProviderId): Promise<void>;
}
