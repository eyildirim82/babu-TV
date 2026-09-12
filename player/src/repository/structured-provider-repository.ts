import type { ProviderId, ProviderRecord } from '../domain/models.js';
import type { StructuredStore } from '../storage/contracts.js';
import { UnknownProviderError } from './memory-provider-repository.js';
import type { ProviderRepository } from './provider-repository.js';

interface ActiveProviderState {
  key: 'activeProviderId';
  value: ProviderId | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isProviderRecord(value: unknown): value is ProviderRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && (candidate.kind === 'xtream' || candidate.kind === 'm3u')
    && typeof candidate.name === 'string'
    && isFiniteNumber(candidate.createdAtMs)
    && (candidate.lastSuccessfulSyncAtMs === null || isFiniteNumber(candidate.lastSuccessfulSyncAtMs));
}

function copyProvider(provider: ProviderRecord): ProviderRecord {
  return {
    id: provider.id,
    kind: provider.kind,
    name: provider.name,
    createdAtMs: provider.createdAtMs,
    lastSuccessfulSyncAtMs: provider.lastSuccessfulSyncAtMs,
  };
}

export class StructuredProviderRepository implements ProviderRepository {
  constructor(private readonly store: StructuredStore) {}

  async listProviders(): Promise<readonly ProviderRecord[]> {
    return (await this.store.getAll<unknown>('providers'))
      .filter(isProviderRecord)
      .map(copyProvider);
  }

  async getProvider(providerId: ProviderId): Promise<ProviderRecord | null> {
    const provider = await this.store.get<unknown>('providers', providerId);
    return isProviderRecord(provider) ? copyProvider(provider) : null;
  }

  async saveProvider(provider: ProviderRecord): Promise<void> {
    await this.store.put('providers', copyProvider(provider));
  }

  async removeProvider(providerId: ProviderId): Promise<void> {
    await this.store.delete('providers', providerId);
    if (await this.getActiveProviderId() === providerId) {
      await this.setActiveProviderId(null);
    }
  }

  async getActiveProviderId(): Promise<ProviderId | null> {
    const state = await this.store.get<ActiveProviderState>('app_state', 'activeProviderId');
    return state?.value ?? null;
  }

  async setActiveProviderId(providerId: ProviderId | null): Promise<void> {
    if (providerId !== null && await this.getProvider(providerId) === null) {
      throw new UnknownProviderError(providerId);
    }
    await this.store.put<ActiveProviderState>('app_state', {
      key: 'activeProviderId',
      value: providerId,
    });
  }
}