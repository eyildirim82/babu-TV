import type {
  ChannelId,
  EpgProgram,
  ProviderId,
} from '../domain/models.js';
import type { EpgProgramRepository } from './contracts.js';

export interface EpgQueryBounds {
  lookBehindMs: number;
  lookAheadMs: number;
}

export class RepositoryEpgQuery {
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
}
