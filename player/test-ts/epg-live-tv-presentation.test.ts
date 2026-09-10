import test from 'node:test';
import assert from 'node:assert/strict';
import type { EpgProgram } from '../src/domain/models.js';
import type { EpgLiveTvViewModel } from '../src/live-tv/epg-live-tv-view-model.js';
import { presentEpgLiveTv } from '../src/live-tv/epg-live-tv-presentation.js';

function program(channelId: string, title: string, description: string | null = null): EpgProgram {
  return {
    channelId,
    startMs: 1_000,
    endMs: 2_000,
    title,
    description,
  };
}

void test('presents channel current data and selected current/next/detail with injected time formatting', () => {
  const current = program('a', 'Current', 'Current description');
  const next = program('a', 'Next');
  const model: EpgLiveTvViewModel = {
    channelContext: [
      { channelId: 'b', current: { status: 'missing' } },
      { channelId: 'a', current: { status: 'available', program: current } },
    ],
    selected: {
      channelId: 'a',
      current: { status: 'available', program: current },
      next: { status: 'available', program: next },
    },
  };

  const presentation = presentEpgLiveTv(model, {
    formatTimeRange(startMs, endMs) {
      return `${startMs}-${endMs}`;
    },
  });

  assert.deepEqual(presentation.channelContext.map((entry) => entry.channelId), ['b', 'a']);
  assert.deepEqual(presentation.channelContext[0]?.current, {
    status: 'missing',
    title: null,
    timeLabel: null,
    description: null,
  });
  assert.deepEqual(presentation.channelContext[1]?.current, {
    status: 'available',
    title: 'Current',
    timeLabel: '1000-2000',
    description: 'Current description',
  });
  assert.deepEqual(presentation.selected, {
    channelId: 'a',
    current: {
      status: 'available',
      title: 'Current',
      timeLabel: '1000-2000',
      description: 'Current description',
    },
    next: {
      status: 'available',
      title: 'Next',
      timeLabel: '1000-2000',
      description: null,
    },
    detail: {
      title: 'Current',
      timeLabel: '1000-2000',
      description: 'Current description',
    },
  });
});

void test('keeps unavailable distinct from missing and renders neither as program detail', () => {
  const model: EpgLiveTvViewModel = {
    channelContext: [{ channelId: 'a', current: { status: 'unavailable' } }],
    selected: {
      channelId: 'a',
      current: { status: 'unavailable' },
      next: { status: 'missing' },
    },
  };

  const presentation = presentEpgLiveTv(model, {
    formatTimeRange() {
      throw new Error('formatter must not run without an available program');
    },
  });

  assert.deepEqual(presentation.channelContext[0]?.current, {
    status: 'unavailable',
    title: null,
    timeLabel: null,
    description: null,
  });
  assert.deepEqual(presentation.selected?.next, {
    status: 'missing',
    title: null,
    timeLabel: null,
    description: null,
  });
  assert.equal(presentation.selected?.detail, null);
});

void test('presentation remains stable-ID data only and does not mutate its view model', () => {
  const current = program('a', 'Current', 'Description');
  const model: EpgLiveTvViewModel = {
    channelContext: [{ channelId: 'a', current: { status: 'available', program: current } }],
    selected: {
      channelId: 'a',
      current: { status: 'available', program: current },
      next: { status: 'missing' },
    },
  };
  const before = JSON.parse(JSON.stringify(model));

  const presentation = presentEpgLiveTv(model, { formatTimeRange: () => 'time' });

  assert.deepEqual(model, before);
  assert.deepEqual(Object.keys(presentation.channelContext[0] ?? {}).sort(), ['channelId', 'current']);
  assert.equal('playingChannelId' in presentation, false);
  assert.equal('play' in presentation, false);
  assert.equal('focus' in presentation, false);
});
