import type { CredentialStore } from '../credentials/contracts.js';
import type { EpgProgram, ProviderId } from '../domain/models.js';
import { matchEpgChannel } from '../epg/channel-mapper.js';
import type { EpgProgramRepository, EpgSourceProgram, EpgWindow } from '../epg/contracts.js';
import { normalizeEpgPrograms } from '../epg/normalize.js';
import type { CatalogRepository } from '../repository/catalog-repository.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import type { ProviderAdapterFactory } from './contracts.js';
import { ProviderError, type ProviderErrorCode } from './errors.js';

export type ProviderEpgRefreshResult =
  | { providerId: ProviderId; status: 'success'; programCount: number }
  | { providerId: ProviderId; status: 'failed'; code: ProviderErrorCode };

export interface ProviderEpgServiceDependencies {
  providers: Pick<ProviderRepository, 'getProvider'>;
  catalog: Pick<CatalogRepository, 'listChannels'>;
  credentials: Pick<CredentialStore, 'load'>;
  adapters: ProviderAdapterFactory;
  repository: EpgProgramRepository;
}

function errorCode(error: unknown): ProviderErrorCode {
  return error instanceof ProviderError ? error.code : 'UNAVAILABLE';
}

function validWindow(window: EpgWindow): boolean {
  return Number.isFinite(window.startMs)
    && Number.isFinite(window.endMs)
    && window.startMs < window.endMs;
}

function intersects(program: EpgProgram, window: EpgWindow): boolean {
  return program.startMs < window.endMs && program.endMs > window.startMs;
}

function deterministicPrograms(programs: readonly EpgProgram[]): readonly EpgProgram[] {
  return [...programs].sort((a, b) =>
    a.channelId.localeCompare(b.channelId)
      || a.startMs - b.startMs
      || a.endMs - b.endMs
      || a.title.localeCompare(b.title)
      || (a.description ?? '').localeCompare(b.description ?? ''),
  );
}

export class ProviderEpgService {
  private readonly inFlight = new Map<string, Promise<ProviderEpgRefreshResult>>();

  constructor(private readonly deps: ProviderEpgServiceDependencies) {}

  async refresh(providerId: ProviderId, window: EpgWindow): Promise<ProviderEpgRefreshResult> {
    if (!validWindow(window)) return { providerId, status: 'failed', code: 'MALFORMED' };

    try {
      const provider = await this.deps.providers.getProvider(providerId);
      if (provider === null) return { providerId, status: 'failed', code: 'NOT_FOUND' };

      const credential = await this.deps.credentials.load(providerId);
      if (credential === null) return { providerId, status: 'failed', code: 'UNAVAILABLE' };

      const adapter = this.deps.adapters.create(provider, credential);
      if (adapter.epg === undefined) {
        return { providerId, status: 'failed', code: 'UNAVAILABLE' };
      }

      const channels = (await this.deps.catalog.listChannels(providerId))
        .filter((channel) => channel.providerId === providerId);
      const descriptors = adapter.epg.describeChannels(channels);
      const source = adapter.epg.createSource(channels);
      if (source.providerId !== providerId) {
        return { providerId, status: 'failed', code: 'MALFORMED' };
      }

      const sourcePrograms = await source.listPrograms(window);
      if (sourcePrograms.length === 0) {
        return { providerId, status: 'success', programCount: 0 };
      }

      const byChannel = new Map<string, EpgSourceProgram[]>();
      for (const sourceProgram of sourcePrograms) {
        const channelId = matchEpgChannel(providerId, sourceProgram.sourceChannel, descriptors);
        if (channelId === null) continue;
        const channelPrograms = byChannel.get(channelId) ?? [];
        channelPrograms.push(sourceProgram);
        byChannel.set(channelId, channelPrograms);
      }

      const normalizedByChannel = new Map<string, readonly EpgProgram[]>();
      const refreshedPrograms: EpgProgram[] = [];
      for (const [channelId, programs] of byChannel) {
        const normalized = normalizeEpgPrograms(channelId, programs)
          .filter((program) => intersects(program, window));
        if (normalized.length === 0) continue;
        normalizedByChannel.set(channelId, normalized);
        refreshedPrograms.push(...normalized);
      }

      if (refreshedPrograms.length === 0) {
        return { providerId, status: 'failed', code: 'MALFORMED' };
      }

      const preservedPrograms: EpgProgram[] = [];
      for (const channel of channels) {
        if (normalizedByChannel.has(channel.id)) continue;
        preservedPrograms.push(
          ...await this.deps.repository.listPrograms(providerId, channel.id, window),
        );
      }

      await this.deps.repository.replaceWindow(
        providerId,
        window,
        deterministicPrograms([...refreshedPrograms, ...preservedPrograms]),
      );
      return {
        providerId,
        status: 'success',
        programCount: refreshedPrograms.length,
      };
    } catch (error) {
      return { providerId, status: 'failed', code: errorCode(error) };
    }
  }

  refreshInBackground(providerId: ProviderId, window: EpgWindow): Promise<ProviderEpgRefreshResult> {
    const key = JSON.stringify([providerId, window.startMs, window.endMs]);
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing;

    const refresh = this.refresh(providerId, window).finally(() => {
      if (this.inFlight.get(key) === refresh) this.inFlight.delete(key);
    });
    this.inFlight.set(key, refresh);
    return refresh;
  }

  async deleteProvider(providerId: ProviderId): Promise<void> {
    await this.deps.repository.deleteProvider(providerId);
  }
}
