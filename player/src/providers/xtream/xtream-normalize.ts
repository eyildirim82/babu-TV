import type {
  Category,
  Channel,
  ChannelId,
  ProviderId,
} from '../../domain/models.js';
import type { ProviderProfile } from '../contracts.js';
import { ProviderError } from '../errors.js';
import type { XtreamRecord } from './xtream-types.js';

export interface NormalizedXtreamChannels {
  channels: readonly Channel[];
  extensions: ReadonlyMap<ChannelId, string>;
}

function isRecord(value: unknown): value is XtreamRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function malformed(): ProviderError {
  return new ProviderError('MALFORMED', null, 'Provider response was malformed.');
}

function authFailed(): ProviderError {
  return new ProviderError('AUTH', null, 'Provider authentication failed.');
}

function normalizedId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function positiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

function unixSecondsToMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric * 1000;
}

function streamExtension(value: unknown): string {
  if (typeof value !== 'string') return 'ts';
  const trimmed = value.trim();
  return /^[A-Za-z0-9]+$/.test(trimmed) ? trimmed : 'ts';
}

export function normalizeXtreamProfile(providerId: ProviderId, raw: unknown): ProviderProfile {
  if (!isRecord(raw) || !isRecord(raw.user_info)) throw malformed();

  const userInfo = raw.user_info;
  if (Number(userInfo.auth) !== 1) throw authFailed();

  const status = optionalTrimmedString(userInfo.status);
  if (status !== null && status.toLowerCase() !== 'active') throw authFailed();

  return {
    providerId,
    kind: 'xtream',
    accountName: optionalTrimmedString(userInfo.account_name),
    expiresAtMs: unixSecondsToMs(userInfo.exp_date),
    maxConnections: positiveInteger(userInfo.max_connections),
  };
}

export function normalizeXtreamCategories(
  providerId: ProviderId,
  raw: unknown,
): readonly Category[] {
  if (!Array.isArray(raw)) throw malformed();

  const categories: Category[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = normalizedId(item.category_id);
    const name = optionalTrimmedString(item.category_name);
    if (id === null || name === null || seen.has(id)) continue;
    seen.add(id);
    categories.push({ providerId, id, name });
  }
  return categories;
}

export function normalizeXtreamChannels(
  providerId: ProviderId,
  raw: unknown,
): NormalizedXtreamChannels {
  if (!Array.isArray(raw)) throw malformed();

  const channels: Channel[] = [];
  const extensions = new Map<ChannelId, string>();
  const seen = new Set<ChannelId>();

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = normalizedId(item.stream_id);
    const name = optionalTrimmedString(item.name);
    if (id === null || name === null || seen.has(id)) continue;

    seen.add(id);
    channels.push({
      providerId,
      id,
      name,
      categoryId: normalizedId(item.category_id),
      logoUrl: optionalTrimmedString(item.stream_icon),
      number: positiveInteger(item.num),
    });
    extensions.set(id, streamExtension(item.container_extension));
  }

  return { channels, extensions };
}
