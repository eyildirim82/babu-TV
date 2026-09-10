import type { Channel, ChannelId, EpgProgram, ProviderId } from '../domain/models.js';
import type { EpgQuery } from '../epg/contracts.js';

export type EpgProgramSlot =
  | { status: 'available'; program: EpgProgram }
  | { status: 'missing' }
  | { status: 'unavailable' };

export interface EpgChannelContextViewModel {
  channelId: ChannelId;
  current: EpgProgramSlot;
}

export interface SelectedChannelEpgViewModel {
  channelId: ChannelId;
  current: EpgProgramSlot;
  next: EpgProgramSlot;
}

export interface EpgLiveTvViewModel {
  channelContext: readonly EpgChannelContextViewModel[];
  selected: SelectedChannelEpgViewModel | null;
}

export interface BuildEpgLiveTvViewModelInput {
  providerId: ProviderId;
  visibleChannels: readonly Channel[];
  highlightedChannelId: ChannelId | null;
  atMs: number;
  query: Pick<EpgQuery, 'getCurrent' | 'getNext'>;
}

async function currentSlot(
  query: Pick<EpgQuery, 'getCurrent'>,
  providerId: ProviderId,
  channelId: ChannelId,
  atMs: number,
): Promise<EpgProgramSlot> {
  try {
    const program = await query.getCurrent(providerId, channelId, atMs);
    return program === null ? { status: 'missing' } : { status: 'available', program };
  } catch {
    return { status: 'unavailable' };
  }
}

async function nextSlot(
  query: Pick<EpgQuery, 'getNext'>,
  providerId: ProviderId,
  channelId: ChannelId,
  atMs: number,
): Promise<EpgProgramSlot> {
  try {
    const program = await query.getNext(providerId, channelId, atMs);
    return program === null ? { status: 'missing' } : { status: 'available', program };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function buildEpgLiveTvViewModel(
  input: BuildEpgLiveTvViewModelInput,
): Promise<EpgLiveTvViewModel> {
  const channelContext = await Promise.all(
    input.visibleChannels.map(async (channel): Promise<EpgChannelContextViewModel> => ({
      channelId: channel.id,
      current: await currentSlot(input.query, input.providerId, channel.id, input.atMs),
    })),
  );

  if (input.highlightedChannelId === null) {
    return { channelContext, selected: null };
  }

  const selectedContext = channelContext.find(
    (entry) => entry.channelId === input.highlightedChannelId,
  );
  if (selectedContext === undefined) {
    return { channelContext, selected: null };
  }

  return {
    channelContext,
    selected: {
      channelId: selectedContext.channelId,
      current: selectedContext.current,
      next: await nextSlot(input.query, input.providerId, selectedContext.channelId, input.atMs),
    },
  };
}
