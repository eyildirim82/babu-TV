export type RelayCreateResult =
  | { outcome: 'created' }
  | { outcome: 'exists' }
  | { outcome: 'full' }
  /** retryAfterMs: time until the client's oldest live session expires and frees a slot. */
  | { outcome: 'client_limit'; retryAfterMs: number };

export type RelayPutOutcome = 'stored' | 'missing' | 'expired' | 'conflict';

export type RelayTakeOutcome =
  | { kind: 'missing' }
  | { kind: 'pending' }
  | { kind: 'ready'; ciphertext: string }
  | { kind: 'expired' }
  | { kind: 'consumed' };

/**
 * Each operation is one atomic read-modify-write of a single session, so a
 * ciphertext can never be delivered to two concurrent polls.
 */
export interface RelaySessionStore {
  create(sessionId: string, clientKey: string, nowMs: number): Promise<RelayCreateResult>;
  /** Repeating the exact ciphertext of a still-ready session is idempotent and reports 'stored'. */
  put(sessionId: string, ciphertext: string, nowMs: number): Promise<RelayPutOutcome>;
  take(sessionId: string, nowMs: number): Promise<RelayTakeOutcome>;
}
