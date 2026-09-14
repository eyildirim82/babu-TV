import type { RelayRateBucket } from './limits.js';

export type RelayRateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RelayRateLimiter {
  /** Counts one request and reports whether it is within the bucket limit. */
  consume(bucket: RelayRateBucket, clientKey: string, nowMs: number): Promise<RelayRateDecision>;
  /** Reports whether one more request would be allowed, without counting it. */
  peek(bucket: RelayRateBucket, clientKey: string, nowMs: number): Promise<RelayRateDecision>;
}
