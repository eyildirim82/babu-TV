export type ProviderId = string;
export type ChannelId = string;
export type CategoryId = string;
export type ProviderKind = 'xtream' | 'm3u';

export interface ProviderSummary {
  id: ProviderId;
  kind: ProviderKind;
  name: string;
}

export interface ProviderRecord {
  id: ProviderId;
  kind: ProviderKind;
  name: string;
  createdAtMs: number;
  lastSuccessfulSyncAtMs: number | null;
}

export interface Category {
  providerId: ProviderId;
  id: CategoryId;
  name: string;
}

export interface Channel {
  providerId: ProviderId;
  id: ChannelId;
  name: string;
  categoryId: CategoryId | null;
  logoUrl: string | null;
  number: number | null;
}

export interface EpgProgram {
  channelId: ChannelId;
  startMs: number;
  endMs: number;
  title: string;
  description: string | null;
}

export function makeChannelKey(providerId: ProviderId, channelId: ChannelId): string {
  return `${providerId}:${channelId}`;
}
