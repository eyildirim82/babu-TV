import type {
  ChannelId,
  EpgProgram,
  ProviderId,
} from '../domain/models.js';
import type {
  EpgProgramRepository,
  EpgQuery,
  EpgWindow,
} from './contracts.js';

export interface EpgQueryBounds {
  lookBehindMs: number;
  lookAheadMs: number;
}

export class RepositoryEpgQuery implements EpgQuery {
  constructor(
    private readonly repository: EpgProgramRepository,
    private readonly bounds: EpgQueryBounds,
  ) {
    if (!Number.isFinite(bounds.lookBehindMs) || bounds.lookBehindMs <= 0) {
      throw new RangeError('lookBehindMs must be positive.');
    }
    if (!Number.isFinite(bounds.lookAheadMs) || bounds.lookAheadMs <= 0) {
      throw new RangeError('lookAheadMs must be positive.');
    }
  }

  async getCurrent(
    providerId: ProviderId,
    channelId: ChannelId,
    atMs: number,
  ): Promise<EpgProgram | null> {
    const programs = await this.repository.listPrograms(providerId, channelId, {
      startMs: atMs - this.bounds.lookBehindMs,
      endMs: atMs + 1,
    });
    const matches = programs.filter(
      (program) => program.startMs <= atMs && atMs < program.endMs,
    );
    matches.sort(
      (a, b) => b.startMs - a.startMs || a.endMs - b.endMs || a.title.localeCompare(b.title),
    );
    return matches[0] ?? null;
  }

  async getNext(
    providerId: ProviderId,
    channelId: ChannelId,
    atMs: number,
  ): Promise<EpgProgram | null> {
    const current = await this.getCurrent(providerId, channelId, atMs);
    const threshold = current?.endMs ?? atMs;
    const endMs = atMs + this.bounds.lookAheadMs;
    if (endMs <= threshold) {
      return null;
    }

    const programs = await this.repository.listPrograms(providerId, channelId, {
      startMs: threshold,
      endMs,
    });
    const matches = programs.filter((program) => program.startMs >= threshold);
    matches.sort(
      (a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.title.localeCompare(b.title),
    );
    return matches[0] ?? null;
  }

  async listWindow(
    providerId: ProviderId,
    channelId: ChannelId,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]> {
    if (
      !Number.isFinite(window.startMs) ||
      !Number.isFinite(window.endMs) ||
      window.startMs >= window.endMs
    ) {
      throw new RangeError('EPG query window must be finite and non-empty.');
    }
    return this.repository.listPrograms(providerId, channelId, window);
  }
}
