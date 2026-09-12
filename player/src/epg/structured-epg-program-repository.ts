import type {
  ChannelId,
  EpgProgram,
  ProviderId,
} from '../domain/models.js';
import type { StructuredStore } from '../storage/contracts.js';
import type {
  EpgProgramRepository,
  EpgWindow,
} from './contracts.js';

interface StoredEpgProgram extends EpgProgram {
  key: string;
  providerId: ProviderId;
  providerChannelKey: string;
}

function providerChannelKey(providerId: ProviderId, channelId: ChannelId): string {
  return JSON.stringify([providerId, channelId]);
}

function programKey(providerId: ProviderId, program: EpgProgram, index: number): string {
  return JSON.stringify([
    providerId,
    program.channelId,
    program.startMs,
    program.endMs,
    program.title,
    program.description,
    index,
  ]);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStoredEpgProgram(value: unknown): value is StoredEpgProgram {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.key === 'string'
    && typeof candidate.providerId === 'string'
    && typeof candidate.providerChannelKey === 'string'
    && typeof candidate.channelId === 'string'
    && isFiniteNumber(candidate.startMs)
    && isFiniteNumber(candidate.endMs)
    && candidate.endMs > candidate.startMs
    && typeof candidate.title === 'string'
    && (candidate.description === null || typeof candidate.description === 'string')
    && candidate.providerChannelKey === providerChannelKey(candidate.providerId, candidate.channelId);
}

function hasStoredKey(value: unknown): value is { key: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof (value as Record<string, unknown>).key === 'string';
}

function intersects(program: EpgProgram, window: EpgWindow): boolean {
  return program.startMs < window.endMs && program.endMs > window.startMs;
}

function storeProgram(
  providerId: ProviderId,
  program: EpgProgram,
  index: number,
): StoredEpgProgram {
  return {
    key: programKey(providerId, program, index),
    providerId,
    providerChannelKey: providerChannelKey(providerId, program.channelId),
    channelId: program.channelId,
    startMs: program.startMs,
    endMs: program.endMs,
    title: program.title,
    description: program.description,
  };
}

function programFromStored(program: StoredEpgProgram): EpgProgram {
  return {
    channelId: program.channelId,
    startMs: program.startMs,
    endMs: program.endMs,
    title: program.title,
    description: program.description,
  };
}

export class StructuredEpgProgramRepository implements EpgProgramRepository {
  constructor(private readonly store: StructuredStore) {}

  async replaceWindow(
    providerId: ProviderId,
    window: EpgWindow,
    programs: readonly EpgProgram[],
  ): Promise<void> {
    const existing = await this.store.getAllByIndex<unknown>(
      'epg_programs',
      'providerId',
      providerId,
    );

    for (const stored of existing) {
      if (!hasStoredKey(stored)) continue;
      if (!isStoredEpgProgram(stored) || intersects(stored, window)) {
        await this.store.delete('epg_programs', stored.key);
      }
    }

    for (let index = 0; index < programs.length; index += 1) {
      await this.store.put('epg_programs', storeProgram(providerId, programs[index], index));
    }
  }

  async listPrograms(
    providerId: ProviderId,
    channelId: ChannelId,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]> {
    const programs = await this.store.getAllByIndex<unknown>(
      'epg_programs',
      'providerChannelKey',
      providerChannelKey(providerId, channelId),
    );

    return programs
      .filter((program): program is StoredEpgProgram => (
        isStoredEpgProgram(program)
        && program.providerId === providerId
        && program.channelId === channelId
        && intersects(program, window)
      ))
      .sort((a, b) => a.startMs - b.startMs)
      .map(programFromStored);
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    await this.store.deleteByIndex('epg_programs', 'providerId', providerId);
  }
}