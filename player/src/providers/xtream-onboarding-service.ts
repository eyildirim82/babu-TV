import type { XtreamCredential } from '../credentials/contracts.js';
import type { ProviderId, ProviderRecord } from '../domain/models.js';
import type { ProviderProfile } from './contracts.js';
import { ProviderError } from './errors.js';
import type { ProviderCoreService, ProviderSnapshot } from './provider-core-service.js';
import type { ProviderSyncService } from './provider-sync-service.js';

export interface XtreamConnectInput {
  serverUrl: string;
  username: string;
  password: string;
}

export interface XtreamConnectSuccess {
  providerId: ProviderId;
  profile: ProviderProfile;
  snapshot: ProviderSnapshot;
}

export interface XtreamOnboardingDependencies {
  core: Pick<
    ProviderCoreService,
    'registerProvider' | 'switchActiveProvider' | 'deleteProvider' | 'loadCached'
  >;
  sync: Pick<ProviderSyncService, 'refresh'>;
  createProviderId: () => ProviderId;
  now: () => number;
}

function requiredCredentials(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Xtream credentials are required.');
}

function onboardingUnavailable(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider connection could not be completed.');
}

function initialChannelSyncFailed(code: ConstructorParameters<typeof ProviderError>[0]): ProviderError {
  return new ProviderError(code, null, 'Initial provider channel sync failed.');
}

function safeServerLabel(serverUrl: string): string {
  try {
    const url = new URL(serverUrl);
    return url.host || 'Xtream';
  } catch {
    return 'Xtream';
  }
}

export class XtreamOnboardingService {
  constructor(private readonly deps: XtreamOnboardingDependencies) {}

  async connect(input: XtreamConnectInput): Promise<XtreamConnectSuccess> {
    const serverUrl = input.serverUrl.trim();
    const username = input.username.trim();
    const password = input.password.trim();

    if (!serverUrl || !username || !password) throw requiredCredentials();

    const providerId = this.deps.createProviderId();
    const provider: ProviderRecord = {
      id: providerId,
      kind: 'xtream',
      name: safeServerLabel(serverUrl),
      createdAtMs: this.deps.now(),
      lastSuccessfulSyncAtMs: null,
    };
    const credential: XtreamCredential = {
      kind: 'xtream',
      serverUrl,
      username,
      password,
    };

    const profile = await this.deps.core.registerProvider(provider, credential);

    try {
      const report = await this.deps.sync.refresh(providerId);
      if (report.channels.status === 'failed') {
        throw initialChannelSyncFailed(report.channels.code);
      }

      const snapshot = await this.deps.core.loadCached(providerId);
      await this.deps.core.switchActiveProvider(providerId);
      return { providerId, profile, snapshot };
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
