import type {
  ChannelId,
  EpgProgram,
  ProviderId,
} from '../domain/models.js';

export interface EpgWindow {
  startMs: number;
  endMs: number;
}

export interface EpgSourceChannelRef {
  providerChannelId: string | null;
  tvgId: string | null;
  name: string | null;
}

export interface EpgSourceProgram {
  sourceChannel: EpgSourceChannelRef;
  startMs: number;
  endMs: number;
  title: string;
  description: string | null;
}

export interface EpgChannelDescriptor {
  providerId: ProviderId;
  channelId: ChannelId;
  name: string;
  epgIds: readonly string[];
}

export interface EpgSource {
  readonly providerId: ProviderId;
  listPrograms(window: EpgWindow): Promise<readonly EpgSourceProgram[]>;
}

export interface EpgProgramRepository {
  replaceWindow(
    providerId: ProviderId,
    window: EpgWindow,
    programs: readonly EpgProgram[],
  ): Promise<void>;

  listPrograms(
    providerId: ProviderId,
    channelId: ChannelId,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]>;

  deleteProvider(providerId: ProviderId): Promise<void>;
}

export interface EpgQuery {
  getCurrent(
    providerId: ProviderId,
    channelId: ChannelId,
    atMs: number,
  ): Promise<EpgProgram | null>;

  getNext(
    providerId: ProviderId,
    channelId: ChannelId,
    atMs: number,
  ): Promise<EpgProgram | null>;

  listWindow(
    providerId: ProviderId,
    channelId: ChannelId,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]>;
}
