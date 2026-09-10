import test from 'node:test';
import assert from 'node:assert/strict';
import { rankFrequentlyWatched, scoreWatchAggregate } from '../src/watch/score.js';

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

test('WATCH-S ranks only the requested provider with stable tie breaking', () => {
  const now = 1_000;
  const records = [
    { providerId: 'p2', channelId: 'x', meaningfulWatchMs: 999_999, meaningfulOpenCount: 99, lastMeaningfulWatchAtMs: now },
    { providerId: 'p1', channelId: 'b', meaningfulWatchMs: 60_000, meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: now },
    { providerId: 'p1', channelId: 'a', meaningfulWatchMs: 60_000, meaningfulOpenCount: 1, lastMeaningfulWatchAtMs: now },
  ];

  assert.deepEqual(
    rankFrequentlyWatched('p1', records, now, policy, 8).map((item) => item.record.channelId),
    ['a', 'b'],
  );
});

test('WATCH-S ranking is independent of input order and omits zero-score records', () => {
  const now = 1_000;
  const records = [
    { providerId: 'p1', channelId: 'recent', meaningfulWatchMs: 120_000, meaningfulOpenCount: 0, lastMeaningfulWatchAtMs: now },
    { providerId: 'p1', channelId: 'older', meaningfulWatchMs: 60_000, meaningfulOpenCount: 0, lastMeaningfulWatchAtMs: now - policy.recencyHalfLifeMs },
    { providerId: 'p1', channelId: 'zero', meaningfulWatchMs: 0, meaningfulOpenCount: 0, lastMeaningfulWatchAtMs: null },
  ];

  const forward = rankFrequentlyWatched('p1', records, now, policy, 8).map((item) => item.record.channelId);
  const reverse = rankFrequentlyWatched('p1', [...records].reverse(), now, policy, 8).map((item) => item.record.channelId);

  assert.deepEqual(forward, ['recent', 'older']);
  assert.deepEqual(reverse, forward);
});

test('WATCH-S ranking applies deterministic recency tie-break and limit behavior', () => {
  const now = 1_000;
  const records = [
    { providerId: 'p1', channelId: 'old', meaningfulWatchMs: 120_000, meaningfulOpenCount: 0, lastMeaningfulWatchAtMs: now - policy.recencyHalfLifeMs },
    { providerId: 'p1', channelId: 'new', meaningfulWatchMs: 60_000, meaningfulOpenCount: 0, lastMeaningfulWatchAtMs: now },
    { providerId: 'p1', channelId: 'tail', meaningfulWatchMs: 30_000, meaningfulOpenCount: 0, lastMeaningfulWatchAtMs: now },
  ];

  assert.deepEqual(
    rankFrequentlyWatched('p1', records, now, policy, 2).map((item) => item.record.channelId),
    ['new', 'old'],
  );
  assert.deepEqual(rankFrequentlyWatched('p1', records, now, policy, 0), []);
  assert.deepEqual(rankFrequentlyWatched('p1', records, now, policy, 1.5), []);
});
