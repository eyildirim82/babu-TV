import { makeChannelKey } from '../../src/domain/models.js';
import type {
  ChannelId,
  EpgProgram,
  ProviderId,
} from '../../src/domain/models.js';
import type {
  EpgProgramRepository,
  EpgWindow,
} from '../../src/epg/contracts.js';
import type {
  FavoriteRecord,
  FavoriteRepository,
} from '../../src/favorites/contracts.js';
import type {
  LastWatchedRecord,
  WatchAggregate,
  WatchStateRepository,
} from '../../src/watch/contracts.js';

function intersects(program: EpgProgram, window: EpgWindow): boolean {
  return program.startMs < window.endMs && program.endMs > window.startMs;
}

export class MemoryEpgProgramRepository implements EpgProgramRepository {
  private readonly programs = new Map<ProviderId, EpgProgram[]>();

  async replaceWindow(
    providerId: ProviderId,
    window: EpgWindow,
    programs: readonly EpgProgram[],
  ): Promise<void> {
    const retained = (this.programs.get(providerId) ?? [])
      .filter((program) => !intersects(program, window));
    this.programs.set(providerId, [
      ...retained.map((program) => ({ ...program })),
      ...programs.map((program) => ({ ...program })),
    ]);
  }

  async listPrograms(
    providerId: ProviderId,
    channelId: ChannelId,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]> {
    return (this.programs.get(providerId) ?? [])
      .filter((program) => program.channelId === channelId && intersects(program, window))
      .sort((a, b) => a.startMs - b.startMs)
      .map((program) => ({ ...program }));
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    this.programs.delete(providerId);
  }
}

export class MemoryFavoriteRepository implements FavoriteRepository {
  private readonly records = new Map<string, FavoriteRecord>();

  async list(providerId: ProviderId): Promise<readonly FavoriteRecord[]> {
    return Array.from(this.records.values())
      .filter((record) => record.providerId === providerId)
      .sort((a, b) => a.addedAtMs - b.addedAtMs || a.channelId.localeCompare(b.channelId))
      .map((record) => ({ ...record }));
  }

  async has(providerId: ProviderId, channelId: ChannelId): Promise<boolean> {
    return this.records.has(makeChannelKey(providerId, channelId));
  }

  async put(record: FavoriteRecord): Promise<void> {
    this.records.set(makeChannelKey(record.providerId, record.channelId), { ...record });
  }

  async delete(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    this.records.delete(makeChannelKey(providerId, channelId));
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.providerId === providerId) this.records.delete(key);
    }
  }
}

export class MemoryWatchStateRepository implements WatchStateRepository {
  private readonly lastWatched = new Map<ProviderId, LastWatchedRecord>();
  private readonly aggregates = new Map<string, WatchAggregate>();

  async getLastWatched(providerId: ProviderId): Promise<LastWatchedRecord | null> {
    const record = this.lastWatched.get(providerId);
    return record ? { ...record } : null;
  }

  async setLastWatched(record: LastWatchedRecord): Promise<void> {
    this.lastWatched.set(record.providerId, { ...record });
  }

  async getAggregate(
    providerId: ProviderId,
    channelId: ChannelId,
  ): Promise<WatchAggregate | null> {
    const record = this.aggregates.get(makeChannelKey(providerId, channelId));
    return record ? { ...record } : null;
  }

  async listAggregates(providerId: ProviderId): Promise<readonly WatchAggregate[]> {
    return Array.from(this.aggregates.values())
      .filter((record) => record.providerId === providerId)
      .map((record) => ({ ...record }));
  }

  async putAggregate(record: WatchAggregate): Promise<void> {
    this.aggregates.set(makeChannelKey(record.providerId, record.channelId), { ...record });
  }

  async deleteChannel(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    this.aggregates.delete(makeChannelKey(providerId, channelId));
    const last = this.lastWatched.get(providerId);
    if (last?.channelId === channelId) this.lastWatched.delete(providerId);
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    this.lastWatched.delete(providerId);
    for (const [key, record] of this.aggregates) {
      if (record.providerId === providerId) this.aggregates.delete(key);
    }
  }
}
