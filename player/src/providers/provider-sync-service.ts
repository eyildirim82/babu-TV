import type { CredentialStore } from '../credentials/contracts.js';
import type { ProviderId, ProviderRecord } from '../domain/models.js';
import type { CatalogRepository } from '../repository/catalog-repository.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import { reconcileChannels } from '../repository/reconcile.js';
import type { ProviderAdapterFactory } from './contracts.js';
import { ProviderError, type ProviderErrorCode } from './errors.js';

export type SyncStageResult =
  | { status: 'success'; count: number }
  | { status: 'failed'; code: ProviderErrorCode };

export interface ProviderSyncReport {
  providerId: ProviderId;
  profile: 'success' | 'failed';
  categories: SyncStageResult;
  channels: SyncStageResult;
  completedAtMs: number;
}

function errorCode(error: unknown): ProviderErrorCode {
  return error instanceof ProviderError ? error.code : 'UNAVAILABLE';
}

function missingProvider(): ProviderError {
  return new ProviderError('NOT_FOUND', null, 'Provider configuration was not found.');
}

function missingCredential(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider credential is unavailable.');
}

export class ProviderSyncService {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly catalog: CatalogRepository,
    private readonly credentials: CredentialStore,
    private readonly adapters: ProviderAdapterFactory,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async refresh(providerId: ProviderId): Promise<ProviderSyncReport> {
    const provider = await this.providers.getProvider(providerId);
    if (provider === null) throw missingProvider();

    const credential = await this.credentials.load(providerId);
    if (credential === null) throw missingCredential();

    const adapter = this.adapters.create(provider, credential);

    let profile: 'success' | 'failed' = 'success';
    try {
      await adapter.getProfile();
    } catch {
      profile = 'failed';
    }

    let categories: SyncStageResult;
    try {
      const nextCategories = await adapter.listCategories();
      await this.catalog.replaceCategories(providerId, nextCategories);
      categories = { status: 'success', count: nextCategories.length };
    } catch (error) {
      categories = { status: 'failed', code: errorCode(error) };
    }

    let channels: SyncStageResult;
    let channelRefreshSucceeded = false;
    try {
      const previousChannels = await this.catalog.listChannels(providerId);
      const nextChannels = await adapter.listChannels();
      const reconciliation = reconcileChannels(previousChannels, nextChannels);
      await this.catalog.replaceChannels(providerId, nextChannels);
      channels = {
        status: 'success',
        count: reconciliation.added.length + reconciliation.updated.length + reconciliation.retained.length,
      };
      channelRefreshSucceeded = true;
    } catch (error) {
      channels = { status: 'failed', code: errorCode(error) };
    }

    const completedAtMs = this.now();
    if (channelRefreshSucceeded) {
      const updatedProvider: ProviderRecord = {
        ...provider,
        lastSuccessfulSyncAtMs: completedAtMs,
      };
      await this.providers.saveProvider(updatedProvider);
    }

    return {
      providerId,
      profile,
      categories,
      channels,
      completedAtMs,
    };
  }
}
