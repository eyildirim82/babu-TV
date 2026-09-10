import type { ProviderId, ProviderRecord } from '../../domain/models.js';
import type { ProviderProfile } from '../contracts.js';
import { ProviderError } from '../errors.js';
import type { ProviderCoreService, ProviderSnapshot } from '../provider-core-service.js';
import type { ProviderSyncService } from '../provider-sync-service.js';
import {
  validateM3uEntry,
  type M3uEntryInput,
  type M3uEntryValidationErrorCode,
} from './m3u-entry-validation.js';

export type M3uConnectInput = M3uEntryInput;

export type M3uConnectResult =
  | { ok: false; code: M3uEntryValidationErrorCode; input: M3uEntryInput }
  | {
      ok: true;
      providerId: ProviderId;
      profile: ProviderProfile;
      snapshot: ProviderSnapshot;
    };

export interface M3uOnboardingDependencies {
  core: Pick<
    ProviderCoreService,
    'registerProvider' | 'switchActiveProvider' | 'deleteProvider' | 'loadCached'
  >;
  sync: Pick<ProviderSyncService, 'refresh'>;
  createProviderId: () => ProviderId;
  now: () => number;
}

function onboardingUnavailable(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider connection could not be completed.');
}

function initialChannelSyncFailed(
  code: ConstructorParameters<typeof ProviderError>[0],
): ProviderError {
  return new ProviderError(code, null, 'Initial provider channel sync failed.');
}

function unusableCache(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Provider playlist contains no usable channels.');
}

export class M3uOnboardingService {
  constructor(private readonly deps: M3uOnboardingDependencies) {}

  async connect(input: M3uConnectInput): Promise<M3uConnectResult> {
    const validation = validateM3uEntry(input);
    if (!validation.ok) return validation;

    const providerId = this.deps.createProviderId();
    const provider: ProviderRecord = {
      id: providerId,
      kind: 'm3u',
      name: 'M3U',
      createdAtMs: this.deps.now(),
      lastSuccessfulSyncAtMs: null,
    };

    const profile = await this.deps.core.registerProvider(provider, validation.credential);

    try {
      const report = await this.deps.sync.refresh(providerId);
      if (report.channels.status === 'failed') {
        throw initialChannelSyncFailed(report.channels.code);
      }

      const snapshot = await this.deps.core.loadCached(providerId);
      if (snapshot.channels.length === 0) throw unusableCache();

      await this.deps.core.switchActiveProvider(providerId);
      return { ok: true, providerId, profile, snapshot };
    } catch (error) {
      try {
        await this.deps.core.deleteProvider(providerId);
      } catch {
        // Compensation is best-effort. Never replace the useful original error.
      }

      if (error instanceof ProviderError) throw error;
      throw onboardingUnavailable();
    }
  }
}
