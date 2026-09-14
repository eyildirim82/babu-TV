import type { RelayLimits } from './limits.js';
import type {
  RelayCreateResult,
  RelayPutOutcome,
  RelaySessionStore,
  RelayTakeOutcome,
} from './session-store.js';

type RelayLiveRecord =
  | { status: 'pending'; clientKey: string; expiresAtMs: number }
  | { status: 'ready'; clientKey: string; expiresAtMs: number; ciphertext: string };

interface RelayTombstone {
  status: 'expired' | 'consumed';
  retainUntilMs: number;
}

type RelayStoreLimits = Pick<
  RelayLimits,
  | 'sessionTtlMs'
  | 'tombstoneGraceMs'
  | 'maxSessions'
  | 'maxLiveSessionsPerClient'
  | 'maxTombstones'
  | 'maxRetainedCiphertextChars'
>;

/**
 * Single-process store. Every method body runs synchronously, which makes each transition atomic.
 * Live sessions hold client keys only in memory, to enforce the per-client cap; tombstones keep status only.
 *
 * The TTL is constant and Map preserves insertion order, so `live` is ordered by expiry and expiry
 * sweeps stop at the first unexpired session. This assumes a non-decreasing clock; any session left
 * behind by a clock step backwards is still expired on its next access.
 */
export class MemoryRelaySessionStore implements RelaySessionStore {
  private readonly live = new Map<string, RelayLiveRecord>();
  private readonly tombstones = new Map<string, RelayTombstone>();
  /** Session IDs per client key, oldest first; at most maxLiveSessionsPerClient entries each. */
  private readonly liveByClient = new Map<string, string[]>();
  private retainedChars = 0;

  constructor(private readonly limits: RelayStoreLimits) {}

  async create(sessionId: string, clientKey: string, nowMs: number): Promise<RelayCreateResult> {
    if (this.lookup(sessionId, nowMs) !== undefined) return { outcome: 'exists' };

    let owned = this.liveByClient.get(clientKey);
    if (owned !== undefined && owned.length >= this.limits.maxLiveSessionsPerClient) {
      for (const ownedId of [...owned]) this.lookup(ownedId, nowMs);
      owned = this.liveByClient.get(clientKey);
      if (owned !== undefined && owned.length >= this.limits.maxLiveSessionsPerClient) {
        const oldest = this.live.get(owned[0] as string);
        return { outcome: 'client_limit', retryAfterMs: oldest === undefined ? 0 : Math.max(0, oldest.expiresAtMs - nowMs) };
      }
    }
    if (this.live.size >= this.limits.maxSessions) {
      this.expireLive(nowMs);
      if (this.live.size >= this.limits.maxSessions) return { outcome: 'full' };
    }

    this.live.set(sessionId, { status: 'pending', clientKey, expiresAtMs: nowMs + this.limits.sessionTtlMs });
    // Re-read: the store-full sweep above may have retired this client's last session and dropped its entry.
    const current = this.liveByClient.get(clientKey);
    if (current === undefined) this.liveByClient.set(clientKey, [sessionId]);
    else current.push(sessionId);
    return { outcome: 'created' };
  }

  async put(sessionId: string, ciphertext: string, nowMs: number): Promise<RelayPutOutcome> {
    const record = this.lookup(sessionId, nowMs);
    if (record === undefined) return 'missing';
    if (!('clientKey' in record)) return record.status === 'expired' ? 'expired' : 'conflict';
    if (record.status === 'ready') return record.ciphertext === ciphertext ? 'stored' : 'conflict';
    if (this.retainedChars + ciphertext.length > this.limits.maxRetainedCiphertextChars) return 'full';
    this.live.set(sessionId, { ...record, status: 'ready', ciphertext });
    this.retainedChars += ciphertext.length;
    return 'stored';
  }

  async take(sessionId: string, nowMs: number): Promise<RelayTakeOutcome> {
    const record = this.lookup(sessionId, nowMs);
    if (record === undefined) return { kind: 'missing' };
    if (record.status !== 'ready') return { kind: record.status };
    this.retire(sessionId, record, 'consumed', nowMs + this.limits.tombstoneGraceMs);
    return { kind: 'ready', ciphertext: record.ciphertext };
  }

  /** Expires due live sessions (dropping their ciphertext) and forgets tombstones past retention. */
  purge(nowMs: number): number {
    this.expireLive(nowMs);
    let forgotten = 0;
    for (const [sessionId, tombstone] of this.tombstones) {
      if (nowMs >= tombstone.retainUntilMs) {
        this.tombstones.delete(sessionId);
        forgotten += 1;
      }
    }
    return forgotten;
  }

  /** Expiry of the oldest live session, or null; lets hosts without timers schedule the next purge. */
  nextLiveExpiryMs(): number | null {
    const oldest = this.live.values().next();
    return oldest.done ? null : oldest.value.expiresAtMs;
  }

  retainedCiphertextChars(): number {
    return this.retainedChars;
  }

  liveCount(): number {
    return this.live.size;
  }

  tombstoneCount(): number {
    return this.tombstones.size;
  }

  /** Test seam: number of records still holding ciphertext in memory. */
  debugRetainedCiphertextCount(): number {
    let count = 0;
    for (const record of this.live.values()) {
      if (record.status === 'ready') count += 1;
    }
    return count;
  }

  private lookup(sessionId: string, nowMs: number): RelayLiveRecord | RelayTombstone | undefined {
    const record = this.live.get(sessionId);
    if (record !== undefined) {
      if (nowMs < record.expiresAtMs) return record;
      return this.retire(sessionId, record, 'expired', record.expiresAtMs + this.limits.tombstoneGraceMs);
    }

    const tombstone = this.tombstones.get(sessionId);
    if (tombstone === undefined) return undefined;
    if (nowMs >= tombstone.retainUntilMs) {
      this.tombstones.delete(sessionId);
      return undefined;
    }
    return tombstone;
  }

  private expireLive(nowMs: number): void {
    for (const [sessionId, record] of this.live) {
      if (nowMs < record.expiresAtMs) break;
      this.retire(sessionId, record, 'expired', record.expiresAtMs + this.limits.tombstoneGraceMs);
    }
  }

  private retire(
    sessionId: string,
    record: RelayLiveRecord,
    status: RelayTombstone['status'],
    retainUntilMs: number,
  ): RelayTombstone {
    this.live.delete(sessionId);
    if (record.status === 'ready') this.retainedChars -= record.ciphertext.length;
    const owned = this.liveByClient.get(record.clientKey);
    if (owned !== undefined) {
      const index = owned.indexOf(sessionId);
      if (index >= 0) owned.splice(index, 1);
      if (owned.length === 0) this.liveByClient.delete(record.clientKey);
    }

    const tombstone: RelayTombstone = { status, retainUntilMs };
    this.tombstones.delete(sessionId);
    this.tombstones.set(sessionId, tombstone);
    while (this.tombstones.size > this.limits.maxTombstones) {
      const oldest = this.tombstones.keys().next();
      if (oldest.done) break;
      this.tombstones.delete(oldest.value);
    }
    return tombstone;
  }
}
