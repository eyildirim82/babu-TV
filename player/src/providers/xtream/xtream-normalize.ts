import type { Category, Channel, ProviderId } from '../../domain/models.js';
import type { ProviderProfile } from '../contracts.js';

export interface NormalizedXtreamChannels {
  channels: readonly Channel[];
  extensions: ReadonlyMap<string, string>;
}

export function normalizeXtreamProfile(providerId: ProviderId, _raw: unknown): ProviderProfile {
  return {
    providerId,
    kind: 'xtream',
    accountName: null,
    expiresAtMs: null,
    maxConnections: null,
  };
}

export function normalizeXtreamCategories(_providerId: ProviderId, _raw: unknown): readonly Category[] {
  return [];
}

export function normalizeXtreamChannels(_providerId: ProviderId, _raw: unknown): NormalizedXtreamChannels {
  return {
    channels: [],
    extensions: new Map<string, string>(),
  };
}
