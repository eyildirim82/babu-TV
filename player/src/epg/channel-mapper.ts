import type { ChannelId, ProviderId } from '../domain/models.js';
import type { EpgChannelDescriptor, EpgSourceChannelRef } from './contracts.js';

function trimIdentifier(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueChannelId(matches: readonly EpgChannelDescriptor[]): ChannelId | null {
  const ids = Array.from(new Set(matches.map((item) => item.channelId)));
  return ids.length === 1 ? ids[0] ?? null : null;
}

function normalizeFallbackName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR');
}

export function matchEpgChannel(
  providerId: ProviderId,
  source: EpgSourceChannelRef,
  channels: readonly EpgChannelDescriptor[],
): ChannelId | null {
  const scopedChannels = channels.filter((channel) => channel.providerId === providerId);
  const providerChannelId = trimIdentifier(source.providerChannelId);

  if (providerChannelId !== null) {
    const directMatches = scopedChannels.filter(
      (channel) => trimIdentifier(channel.channelId) === providerChannelId,
    );
    if (directMatches.length > 0) {
      return uniqueChannelId(directMatches);
    }

    const providerEpgIdMatches = scopedChannels.filter((channel) =>
      channel.epgIds.some((epgId) => trimIdentifier(epgId) === providerChannelId),
    );
    if (providerEpgIdMatches.length > 0) {
      return uniqueChannelId(providerEpgIdMatches);
    }
  }

  const tvgId = trimIdentifier(source.tvgId);
  if (tvgId !== null) {
    const tvgIdMatches = scopedChannels.filter((channel) =>
      channel.epgIds.some((epgId) => trimIdentifier(epgId) === tvgId),
    );
    if (tvgIdMatches.length > 0) {
      return uniqueChannelId(tvgIdMatches);
    }
  }

  if (source.name === null || source.name.trim().length === 0) {
    return null;
  }

  const normalizedSourceName = normalizeFallbackName(source.name);
  const nameMatches = scopedChannels.filter(
    (channel) => normalizeFallbackName(channel.name) === normalizedSourceName,
  );

  return nameMatches.length > 0 ? uniqueChannelId(nameMatches) : null;
}
