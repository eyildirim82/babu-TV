import type {
  CredentialStore,
  M3uCredential,
  ProviderCredential,
  XtreamCredential,
} from '../credentials/contracts.js';
import type { ProviderId, ProviderKind, ProviderRecord } from '../domain/models.js';
import type { ProviderRepository } from '../repository/provider-repository.js';
import type { ProviderAdapterFactory } from './contracts.js';
import { ProviderError, type ProviderErrorCode } from './errors.js';
import { validateM3uEntry } from './m3u/m3u-entry-validation.js';
import type { ProviderSyncReport, ProviderSyncService } from './provider-sync-service.js';

export type ProviderReentryInput =
  | {
      providerId: ProviderId;
      kind: 'xtream';
      serverUrl: string;
      username: string;
      password: string;
    }
  | {
      providerId: ProviderId;
      kind: 'm3u';
      playlistUrl: string;
    };

export type ProviderReentryRefreshStatus = 'completed' | 'degraded';

export interface ProviderReentryResult {
  providerId: ProviderId;
  kind: ProviderKind;
  refresh: ProviderReentryRefreshStatus;
}

export interface ProviderReentryDependencies {
  providers: Pick<ProviderRepository, 'getProvider'>;
  credentials: Pick<CredentialStore, 'isAvailable' | 'load' | 'save' | 'remove'>;
  adapters: ProviderAdapterFactory;
  sync: Pick<ProviderSyncService, 'refresh'>;
}

function malformedCandidate(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Provider credentials are invalid.');
}

function missingProvider(): ProviderError {
  return new ProviderError('NOT_FOUND', null, 'Provider configuration was not found.');
}

function updateUnavailable(): ProviderError {
  return new ProviderError('UNAVAILABLE', null, 'Provider credentials could not be updated.');
}

function validationUnavailable(code: ProviderErrorCode = 'UNAVAILABLE'): ProviderError {
  return new ProviderError(code, null, 'Provider credentials could not be validated.');
}

function sanitizePreflightError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return validationUnavailable(error.code);
  }
  return validationUnavailable();
}

function refreshCompleted(report: ProviderSyncReport): boolean {
  return report.profile === 'success'
    && report.categories.status === 'success'
    && report.channels.status === 'success';
}

export class ProviderReentryService {
  private readonly inFlight = new Set<ProviderId>();

  constructor(private readonly deps: ProviderReentryDependencies) {}

  async reenter(input: ProviderReentryInput): Promise<ProviderReentryResult> {
    if (this.inFlight.has(input.providerId)) {
      throw updateUnavailable();
    }

    this.inFlight.add(input.providerId);
    try {
      return await this.run(input);
    } finally {
      this.inFlight.delete(input.providerId);
    }
  }

  private async run(input: ProviderReentryInput): Promise<ProviderReentryResult> {
    let provider: ProviderRecord | null;
    try {
      provider = await this.deps.providers.getProvider(input.providerId);
    } catch {
      throw updateUnavailable();
    }

    if (provider === null) {
      throw missingProvider();
    }
    if (provider.kind !== input.kind) {
      throw malformedCandidate();
    }

    let credentialStoreAvailable: boolean;
    try {
      credentialStoreAvailable = this.deps.credentials.isAvailable();
    } catch {
      throw updateUnavailable();
    }
    if (!credentialStoreAvailable) {
      throw updateUnavailable();
    }

    let previousCredential: ProviderCredential | null;
    try {
      previousCredential = await this.deps.credentials.load(provider.id);
    } catch {
      throw updateUnavailable();
    }

    const candidate = await this.preflight(provider, input);

    try {
      await this.deps.credentials.save(provider.id, candidate);
    } catch {
      await this.compensateCredentialSave(provider.id, previousCredential);
      throw updateUnavailable();
    }

    let refresh: ProviderReentryRefreshStatus = 'completed';
    try {
      const report = await this.deps.sync.refresh(provider.id);
      if (!refreshCompleted(report)) {
        refresh = 'degraded';
      }
    } catch {
      refresh = 'degraded';
    }

    return {
      providerId: provider.id,
      kind: provider.kind,
      refresh,
    };
  }

  private async preflight(
    provider: ProviderRecord,
    input: ProviderReentryInput,
  ): Promise<ProviderCredential> {
    if (input.kind === 'xtream') {
      const credential: XtreamCredential = {
        kind: 'xtream',
        serverUrl: input.serverUrl.trim(),
        username: input.username.trim(),
        password: input.password.trim(),
      };

      if (!credential.serverUrl || !credential.username || !credential.password) {
        throw malformedCandidate();
      }

      try {
        const adapter = this.deps.adapters.create(provider, credential);
        const profile = await adapter.getProfile();
        if (profile.providerId !== provider.id || profile.kind !== 'xtream') {
          throw malformedCandidate();
        }
        await adapter.listChannels();
        return credential;
      } catch (error) {
        throw sanitizePreflightError(error);
      }
    }

    const validation = validateM3uEntry({ playlistUrl: input.playlistUrl });
    if (!validation.ok) {
      throw malformedCandidate();
    }

    const credential: M3uCredential = validation.credential;
    try {
      const adapter = this.deps.adapters.create(provider, credential);
      const channels = await adapter.listChannels();
      if (channels.length === 0) {
        throw malformedCandidate();
      }
      return credential;
    } catch (error) {
      throw sanitizePreflightError(error);
    }
  }

  private async compensateCredentialSave(
    providerId: ProviderId,
    previousCredential: ProviderCredential | null,
  ): Promise<void> {
    try {
      if (previousCredential === null) {
        await this.deps.credentials.remove(providerId);
      } else {
        await this.deps.credentials.save(providerId, previousCredential);
      }
    } catch {
      // Best effort only: callers get the same sanitized UNAVAILABLE either way.
    }
  }
}
