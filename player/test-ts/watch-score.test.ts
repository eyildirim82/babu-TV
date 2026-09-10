import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreWatchAggregate } from '../src/watch/score.js';

const policy = {
  durationWeightPerMinute: 1,
  openWeight: 5,
  recencyHalfLifeMs: 7 * 24 * 60 * 60 * 1000,
};

test('WATCH-S combines duration, opens, and recency deterministically', () => {
  const now = 10_000;
  const recent = scoreWatchAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: now,
  }, now, policy);
  const old = scoreWatchAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: now - policy.recencyHalfLifeMs,
  }, now, policy);

  assert.equal(recent, 6);
  assert.equal(old, 3);
});

test('WATCH-S scores aggregates without meaningful activity as zero', () => {
  assert.equal(scoreWatchAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 0,
    meaningfulOpenCount: 0,
    lastMeaningfulWatchAtMs: null,
  }, 10_000, policy), 0);
});

test('WATCH-S clamps future meaningful-watch timestamps to age zero', () => {
  const now = 10_000;
  const current = scoreWatchAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: now,
  }, now, policy);
  const future = scoreWatchAggregate({
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: now + 60_000,
  }, now, policy);

  assert.equal(future, current);
});

test('WATCH-S rejects invalid time, policy, and aggregate counters', () => {
  const record = {
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 10_000,
  };

  assert.throws(() => scoreWatchAggregate(record, Number.NaN, policy), RangeError);
  assert.throws(() => scoreWatchAggregate(record, 10_000, { ...policy, durationWeightPerMinute: -1 }), RangeError);
  assert.throws(() => scoreWatchAggregate(record, 10_000, { ...policy, openWeight: -1 }), RangeError);
  assert.throws(() => scoreWatchAggregate(record, 10_000, { ...policy, recencyHalfLifeMs: 0 }), RangeError);
  assert.throws(() => scoreWatchAggregate({ ...record, meaningfulWatchMs: -1 }, 10_000, policy), RangeError);
  assert.throws(() => scoreWatchAggregate({ ...record, meaningfulOpenCount: -1 }, 10_000, policy), RangeError);
});
