import type { ProviderCredential } from '../credentials/contracts.js';
import type { ProviderRecord } from '../domain/models.js';
import type { ProviderAdapter, ProviderAdapterFactory } from './contracts.js';
import { ProviderError } from './errors.js';
import type { ProviderHttpClient } from './http/contracts.js';
import { M3uProvider } from './m3u/m3u-provider.js';
import { XtreamProvider } from './xtream/xtream-provider.js';

function invalidConfiguration(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Provider configuration is invalid.');
}

export class ProviderAdapterFactoryImpl implements ProviderAdapterFactory {
  constructor(private readonly http: ProviderHttpClient) {}

  create(provider: ProviderRecord, credential: ProviderCredential): ProviderAdapter {
    if (provider.kind !== credential.kind) throw invalidConfiguration();

    if (provider.kind === 'xtream' && credential.kind === 'xtream') {
      return new XtreamProvider(provider.id, credential, this.http);
    }

    if (provider.kind === 'm3u' && credential.kind === 'm3u') {
      return new M3uProvider(provider.id, credential, this.http);
    }

    throw invalidConfiguration();
  }
}
