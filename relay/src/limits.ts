export type RelayRateBucket = 'create' | 'put' | 'poll' | 'miss';

export interface RelayRateRule {
  limit: number;
  windowMs: number;
}

export type RelayRateLimitRules = Record<RelayRateBucket, RelayRateRule>;

export interface RelayLimits {
  sessionTtlMs: number;
  tombstoneGraceMs: number;
  /** Live (pending or ready) sessions across all clients. Tombstones are bounded separately. */
  maxSessions: number;
  maxLiveSessionsPerClient: number;
  maxTombstones: number;
  /** Total ciphertext characters held by ready sessions; bounds memory on small hosts. */
  maxRetainedCiphertextChars: number;
  maxCiphertextLength: number;
  maxBodyBytes: number;
  rateLimits: RelayRateLimitRules;
}

export const DEFAULT_RELAY_LIMITS: RelayLimits = Object.freeze({
  sessionTtlMs: 5 * 60 * 1000,
  tombstoneGraceMs: 10 * 60 * 1000,
  maxSessions: 50_000,
  maxLiveSessionsPerClient: 10,
  maxTombstones: 20_000,
  maxRetainedCiphertextChars: 32_000_000,
  maxCiphertextLength: 16_384,
  maxBodyBytes: 32 * 1024,
  rateLimits: Object.freeze({
    create: Object.freeze({ limit: 10, windowMs: 60_000 }),
    put: Object.freeze({ limit: 20, windowMs: 60_000 }),
    poll: Object.freeze({ limit: 120, windowMs: 60_000 }),
    miss: Object.freeze({ limit: 30, windowMs: 600_000 }),
  }),
});
