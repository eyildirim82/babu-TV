import type { ChannelId, ProviderId } from '../domain/models.js';
import type {
  LastWatchedRecord,
  WatchAggregate,
  WatchStateRepository,
} from './contracts.js';

export interface MeaningfulWatchPolicy {
  minimumSessionMs: number;
}

export interface CompletedWatchSession {
  providerId: ProviderId;
  channelId: ChannelId;
  durationMs: number;
  endedAtMs: number;
}

export class WatchStateService {
  constructor(
    private readonly repository: WatchStateRepository,
    private readonly policy: MeaningfulWatchPolicy,
  ) {
    if (!Number.isFinite(policy.minimumSessionMs) || policy.minimumSessionMs < 0) {
      throw new RangeError('minimumSessionMs must be finite and non-negative.');
    }
  }

  getLastWatched(providerId: ProviderId): Promise<LastWatchedRecord | null> {
    return this.repository.getLastWatched(providerId);
  }

  getAggregate(
    providerId: ProviderId,
    channelId: ChannelId,
  ): Promise<WatchAggregate | null> {
    return this.repository.getAggregate(providerId, channelId);
  }

  listAggregates(providerId: ProviderId): Promise<readonly WatchAggregate[]> {
    return this.repository.listAggregates(providerId);
  }

  async recordPlaybackStarted(
    providerId: ProviderId,
    channelId: ChannelId,
    atMs: number,
  ): Promise<void> {
    if (!Number.isFinite(atMs)) {
      throw new RangeError('atMs must be finite.');
    }

    await this.repository.setLastWatched({
      providerId,
      channelId,
      lastPlayedAtMs: atMs,
    });
  }

  async recordCompletedSession(
    session: CompletedWatchSession,
  ): Promise<WatchAggregate | null> {
    if (!Number.isFinite(session.durationMs) || session.durationMs < 0) {
      throw new RangeError('durationMs must be finite and non-negative.');
    }
    if (!Number.isFinite(session.endedAtMs)) {
      throw new RangeError('endedAtMs must be finite.');
    }

    if (session.durationMs < this.policy.minimumSessionMs) {
      return this.repository.getAggregate(session.providerId, session.channelId);
    }

    const previous = await this.repository.getAggregate(
      session.providerId,
      session.channelId,
    );
    const next: WatchAggregate = {
      providerId: session.providerId,
      channelId: session.channelId,
      meaningfulWatchMs: (previous?.meaningfulWatchMs ?? 0) + session.durationMs,
      meaningfulOpenCount: (previous?.meaningfulOpenCount ?? 0) + 1,
      lastMeaningfulWatchAtMs: session.endedAtMs,
    };

    await this.repository.putAggregate(next);
    return next;
  }

  deleteChannel(providerId: ProviderId, channelId: ChannelId): Promise<void> {
    return this.repository.deleteChannel(providerId, channelId);
  }

  deleteProvider(providerId: ProviderId): Promise<void> {
    return this.repository.deleteProvider(providerId);
  }
}
