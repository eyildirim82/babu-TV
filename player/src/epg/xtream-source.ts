import type { EpgSourceProgram } from './contracts.js';
import { ProviderError } from '../providers/errors.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function epochSecondsToMs(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(numberValue) ? numberValue * 1000 : null;
}

function decodeBase64Utf8(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function decodeXtreamEpgResponse(
  raw: unknown,
  providerChannelId: string,
): readonly EpgSourceProgram[] {
  const container = asRecord(raw);
  if (!container || !Array.isArray(container.epg_listings)) {
    throw new ProviderError('MALFORMED', null, 'Provider EPG response was malformed.');
  }

  const fallbackProviderChannelId = asId(providerChannelId);
  const programs: EpgSourceProgram[] = [];

  for (const value of container.epg_listings) {
    const listing = asRecord(value);
    if (!listing) continue;

    const sourceProviderChannelId = asId(listing.stream_id) ?? fallbackProviderChannelId;
    const tvgId = asId(listing.channel_id) ?? asId(listing.epg_id);
    const startMs = epochSecondsToMs(listing.start_timestamp);
    const endMs = epochSecondsToMs(listing.stop_timestamp);
    const title = decodeBase64Utf8(listing.title);

    if (sourceProviderChannelId === null || startMs === null || endMs === null || title === null) {
      continue;
    }

    programs.push({
      sourceChannel: {
        providerChannelId: sourceProviderChannelId,
        tvgId,
        name: null,
      },
      startMs,
      endMs,
      title,
      description: decodeBase64Utf8(listing.description),
    });
  }

  return programs;
}
