import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel } from '../src/domain/models.js';
import type { LiveTvState } from '../src/live-tv/contracts.js';
import {
  channelsForScope,
  createInitialLiveTvState,
  reduceLiveTv,
  scopeKey,
} from '../src/live-tv/live-tv-state.js';

function channel(
  id: string,
  categoryId: string | null = null,
): Channel {
  return {
    providerId: 'provider-1',
    id,
    name: `Channel ${id}`,
    categoryId,
    logoUrl: null,
    number: null,
  };
}

function state(overrides: Partial<LiveTvState> = {}): LiveTvState {
  return {
    ...createInitialLiveTvState('provider-1'),
    ...overrides,
  };
}

void test('scope keys and filtering are deterministic', () => {
  const channels = [channel('a', 'news'), channel('b', 'sports'), channel('c', 'news')];

  assert.equal(scopeKey({ kind: 'all' }), 'all');
  assert.equal(scopeKey({ kind: 'category', categoryId: 'news' }), 'category:news');
  assert.deepEqual(
    channelsForScope(channels, { kind: 'category', categoryId: 'news' }).map((item) => item.id),
    ['a', 'c'],
  );
});

void test('first entry opens overlay and highlights first channel without playing it', () => {
  const initial = createInitialLiveTvState('provider-1');
  const next = reduceLiveTv(initial, {
    type: 'ENTER',
    channels: [channel('a'), channel('b')],
  });

  assert.equal(next.overlayOpen, true);
  assert.equal(next.highlightedChannelId, 'a');
  assert.equal(next.playingChannelId, null);
  assert.equal(next.playbackStatus, 'IDLE');
  assert.equal(next.pendingIntent, null);
});

void test('opening overlay restores playing channel before saved scope restore and current highlight', () => {
  const base = state({
    playingChannelId: 'b',
    highlightedChannelId: 'a',
    restoreChannelIdByScope: { all: 'c' },
    overlayOpen: false,
  });

  const next = reduceLiveTv(base, {
    type: 'OPEN_OVERLAY',
    channels: [channel('a'), channel('b'), channel('c')],
  });

  assert.equal(next.overlayOpen, true);
  assert.equal(next.highlightedChannelId, 'b');
  assert.equal(next.playingChannelId, 'b');
});

void test('opening overlay uses saved stable restore when playing channel is outside the visible scope', () => {
  const base = state({
    activeScope: { kind: 'category', categoryId: 'news' },
    playingChannelId: 'sports-1',
    highlightedChannelId: 'old-news',
    restoreChannelIdByScope: { 'category:news': 'news-2' },
    overlayOpen: false,
  });

  const next = reduceLiveTv(base, {
    type: 'OPEN_OVERLAY',
    channels: [channel('news-1', 'news'), channel('news-2', 'news'), channel('sports-1', 'sports')],
  });

  assert.equal(next.highlightedChannelId, 'news-2');
  assert.equal(next.playingChannelId, 'sports-1');
});

void test('scope change restores by stable id and never changes playback', () => {
  const base = state({
    playingChannelId: 'sports-1',
    highlightedChannelId: 'sports-1',
    restoreChannelIdByScope: { 'category:news': 'news-2' },
  });

  const next = reduceLiveTv(base, {
    type: 'SET_SCOPE',
    scope: { kind: 'category', categoryId: 'news' },
    channels: [channel('news-1', 'news'), channel('news-2', 'news'), channel('sports-1', 'sports')],
  });

  assert.deepEqual(next.activeScope, { kind: 'category', categoryId: 'news' });
  assert.equal(next.highlightedChannelId, 'news-2');
  assert.equal(next.playingChannelId, 'sports-1');
});

void test('moving highlight is clamped and never wraps or starts playback', () => {
  const channels = [channel('a'), channel('b'), channel('c')];
  const atStart = state({ highlightedChannelId: 'a', playingChannelId: 'b' });
  const atEnd = state({ highlightedChannelId: 'c', playingChannelId: 'b' });

  assert.equal(reduceLiveTv(atStart, {
    type: 'MOVE_HIGHLIGHT',
    direction: 'PREVIOUS',
    channels,
  }).highlightedChannelId, 'a');

  assert.equal(reduceLiveTv(atStart, {
    type: 'MOVE_HIGHLIGHT',
    direction: 'NEXT',
    channels,
  }).highlightedChannelId, 'b');

  const end = reduceLiveTv(atEnd, {
    type: 'MOVE_HIGHLIGHT',
    direction: 'NEXT',
    channels,
  });
  assert.equal(end.highlightedChannelId, 'c');
  assert.equal(end.playingChannelId, 'b');
});

void test('catalog refresh preserves highlighted stable id across reorder and does not stop removed playing channel', () => {
  const base = state({
    highlightedChannelId: 'b',
    playingChannelId: 'playing-removed',
    restoreChannelIdByScope: { all: 'b' },
  });

  const next = reduceLiveTv(base, {
    type: 'SYNC_CHANNELS',
    channels: [channel('c'), channel('b'), channel('a')],
  });

  assert.equal(next.highlightedChannelId, 'b');
  assert.equal(next.playingChannelId, 'playing-removed');
});

void test('catalog refresh falls back to the first visible channel when stable highlight and restore disappear', () => {
  const base = state({
    highlightedChannelId: 'removed',
    playingChannelId: 'also-removed',
    restoreChannelIdByScope: { all: 'restore-removed' },
  });

  const next = reduceLiveTv(base, {
    type: 'SYNC_CHANNELS',
    channels: [channel('a'), channel('b')],
  });

  assert.equal(next.highlightedChannelId, 'a');
  assert.equal(next.playingChannelId, 'also-removed');
});

void test('empty visible scope clears highlight without changing playback', () => {
  const base = state({
    activeScope: { kind: 'category', categoryId: 'missing' },
    highlightedChannelId: 'old',
    playingChannelId: 'playing',
  });

  const next = reduceLiveTv(base, {
    type: 'SYNC_CHANNELS',
    channels: [channel('a', 'news')],
  });

  assert.equal(next.highlightedChannelId, null);
  assert.equal(next.playingChannelId, 'playing');
});
