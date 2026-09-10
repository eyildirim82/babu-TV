import type { ChannelId } from '../domain/models.js';
import type {
  EpgLiveTvViewModel,
  EpgProgramSlot,
} from './epg-live-tv-view-model.js';

export interface EpgTimeRangeFormatter {
  formatTimeRange(startMs: number, endMs: number): string;
}

export type EpgProgramPresentation =
  | {
      status: 'available';
      title: string;
      timeLabel: string;
      description: string | null;
    }
  | {
      status: 'missing';
      title: null;
      timeLabel: null;
      description: null;
    }
  | {
      status: 'unavailable';
      title: null;
      timeLabel: null;
      description: null;
    };

export interface EpgChannelContextPresentation {
  channelId: ChannelId;
  current: EpgProgramPresentation;
}

export interface EpgProgramDetailPresentation {
  title: string;
  timeLabel: string;
  description: string | null;
}

export interface SelectedChannelEpgPresentation {
  channelId: ChannelId;
  current: EpgProgramPresentation;
  next: EpgProgramPresentation;
  detail: EpgProgramDetailPresentation | null;
}

export interface EpgLiveTvPresentation {
  channelContext: readonly EpgChannelContextPresentation[];
  selected: SelectedChannelEpgPresentation | null;
}

function presentSlot(
  slot: EpgProgramSlot,
  formatter: EpgTimeRangeFormatter,
): EpgProgramPresentation {
  if (slot.status !== 'available') {
    return {
      status: slot.status,
      title: null,
      timeLabel: null,
      description: null,
    };
  }

  return {
    status: 'available',
    title: slot.program.title,
    timeLabel: formatter.formatTimeRange(slot.program.startMs, slot.program.endMs),
    description: slot.program.description,
  };
}

function detailFor(current: EpgProgramPresentation): EpgProgramDetailPresentation | null {
  return current.status === 'available'
    ? {
        title: current.title,
        timeLabel: current.timeLabel,
        description: current.description,
      }
    : null;
}

export function presentEpgLiveTv(
  model: EpgLiveTvViewModel,
  formatter: EpgTimeRangeFormatter,
): EpgLiveTvPresentation {
  const channelContext = model.channelContext.map((entry): EpgChannelContextPresentation => ({
    channelId: entry.channelId,
    current: presentSlot(entry.current, formatter),
  }));

  if (model.selected === null) {
    return { channelContext, selected: null };
  }

  const projectedSelectedCurrent = channelContext.find(
    (entry) => entry.channelId === model.selected?.channelId,
  )?.current ?? presentSlot(model.selected.current, formatter);
  const projectedNext = presentSlot(model.selected.next, formatter);

  return {
    channelContext,
    selected: {
      channelId: model.selected.channelId,
      current: projectedSelectedCurrent,
      next: projectedNext,
      detail: detailFor(projectedSelectedCurrent),
    },
  };
}
