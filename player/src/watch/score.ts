import type { ProviderId } from '../domain/models.js';
import type { WatchAggregate } from './contracts.js';

export interface WatchScorePolicy {
  durationWeightPerMinute: number;
  openWeight: number;
  recencyHalfLifeMs: number;
}

export interface ScoredWatchAggregate {
  record: WatchAggregate;
  score: number;
}

export function scoreWatchAggregate(
  record: WatchAggregate,
  nowMs: number,
  policy: WatchScorePolicy,
): number {
  if (!Number.isFinite(nowMs)) throw new RangeError('nowMs must be finite.');
  if (!Number.isFinite(policy.durationWeightPerMinute) || policy.durationWeightPerMinute < 0) {
    throw new RangeError('durationWeightPerMinute must be finite and non-negative.');
  }
  if (!Number.isFinite(policy.openWeight) || policy.openWeight < 0) {
    throw new RangeError('openWeight must be finite and non-negative.');
  }
  if (!Number.isFinite(policy.recencyHalfLifeMs) || policy.recencyHalfLifeMs <= 0) {
    throw new RangeError('recencyHalfLifeMs must be finite and positive.');
  }
  if (record.meaningfulWatchMs < 0 || record.meaningfulOpenCount < 0) {
    throw new RangeError('Watch aggregate counters must be non-negative.');
  }
  if (record.lastMeaningfulWatchAtMs === null) return 0;

  const durationScore = (record.meaningfulWatchMs / 60_000) * policy.durationWeightPerMinute;
  const openScore = record.meaningfulOpenCount * policy.openWeight;
  const ageMs = Math.max(0, nowMs - record.lastMeaningfulWatchAtMs);
  const recencyFactor = Math.pow(0.5, ageMs / policy.recencyHalfLifeMs);
  return (durationScore + openScore) * recencyFactor;
}

export function rankFrequentlyWatched(
  providerId: ProviderId,
  records: readonly WatchAggregate[],
  nowMs: number,
  policy: WatchScorePolicy,
  limit: number,
): readonly ScoredWatchAggregate[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  return records
    .filter((record) => record.providerId === providerId)
    .map((record) => ({ record, score: scoreWatchAggregate(record, nowMs, policy) }))
    .filter((item) => item.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || (b.record.lastMeaningfulWatchAtMs ?? -1) - (a.record.lastMeaningfulWatchAtMs ?? -1)
      || a.record.channelId.localeCompare(b.record.channelId),
    )
    .slice(0, limit);
}
