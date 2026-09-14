import { DEFAULT_RELAY_LIMITS, type RelayLimits } from '../../relay/src/limits.js';

/**
 * A Durable Object has 128 MB of memory, so the VPS-sized defaults could let a distributed client
 * exhaust it and reset the object. The Free plan's daily request budget supports only a few hundred
 * concurrent pairings, so these bounds cost legitimate users nothing.
 *
 * Worst case: 4 M ciphertext characters at 2 bytes each is about 8 MB; 2,000 live sessions,
 * 5,000 tombstones and 20,000 rate-limit windows add a few MB more.
 */
export const CLOUDFLARE_RELAY_LIMITS: RelayLimits = Object.freeze({
  ...DEFAULT_RELAY_LIMITS,
  maxSessions: 2_000,
  maxTombstones: 5_000,
  maxRetainedCiphertextChars: 4_000_000,
});

export const CLOUDFLARE_RATE_LIMIT_MAX_KEYS = 20_000;
