import type { ChannelId, ProviderId } from '../domain/models.js';
import type { LastWatchedRecord, WatchStateRepository } from './contracts.js';

export interface MeaningfulWatchPolicy {
  minimumSessionMs: number;
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
}
