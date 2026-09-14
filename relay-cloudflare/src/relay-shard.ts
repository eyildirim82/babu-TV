import { DurableObject } from 'cloudflare:workers';
import { MemoryRelayRateLimiter } from '../../relay/src/memory-rate-limiter.js';
import { MemoryRelaySessionStore } from '../../relay/src/memory-session-store.js';
import { createRelayCore, type RelayHttpRequest, type RelayHttpResponse } from '../../relay/src/relay-core.js';
import { CLOUDFLARE_RATE_LIMIT_MAX_KEYS, CLOUDFLARE_RELAY_LIMITS } from './limits.js';

/** Purge cadence on requests, and the granularity of the expiry alarm. */
const PURGE_INTERVAL_MS = 10_000;

/**
 * The whole relay runs inside this single object. Sessions, ciphertext and client keys stay in
 * instance memory only; Durable Object storage holds nothing but the expiry alarm. Eviction or a
 * restart drops open pairings, which users retry.
 */
export class RelayShard extends DurableObject {
  private readonly store = new MemoryRelaySessionStore(CLOUDFLARE_RELAY_LIMITS);
  private readonly rateLimiter = new MemoryRelayRateLimiter(CLOUDFLARE_RELAY_LIMITS.rateLimits, CLOUDFLARE_RATE_LIMIT_MAX_KEYS);
  private readonly core = createRelayCore({
    store: this.store,
    rateLimiter: this.rateLimiter,
    nowMs: () => this.nowMs(),
    limits: CLOUDFLARE_RELAY_LIMITS,
  });
  private lastPurgeMs = Number.NEGATIVE_INFINITY;
  private scheduledAlarmMs: number | null = null;

  nowMs(): number {
    return Date.now();
  }

  async handle(request: RelayHttpRequest): Promise<RelayHttpResponse> {
    const nowMs = this.nowMs();
    if (nowMs - this.lastPurgeMs >= PURGE_INTERVAL_MS) this.purge(nowMs);
    const response = await this.core.handle(request);
    await this.scheduleExpiryAlarm();
    return response;
  }

  async alarm(): Promise<void> {
    this.scheduledAlarmMs = null;
    this.purge(this.nowMs());
    await this.scheduleExpiryAlarm();
  }

  private purge(nowMs: number): void {
    this.store.purge(nowMs);
    this.rateLimiter.purge(nowMs);
    this.lastPurgeMs = nowMs;
  }

  /** Keeps one alarm at the earliest live expiry, rounded up so bursts share a single alarm run. */
  private async scheduleExpiryAlarm(): Promise<void> {
    const nextExpiryMs = this.store.nextLiveExpiryMs();
    if (nextExpiryMs === null) return;
    const alarmMs = Math.max(
      Math.ceil(nextExpiryMs / PURGE_INTERVAL_MS) * PURGE_INTERVAL_MS,
      this.nowMs() + 1_000,
    );
    if (this.scheduledAlarmMs !== null && this.scheduledAlarmMs <= alarmMs) return;
    await this.ctx.storage.setAlarm(alarmMs);
    this.scheduledAlarmMs = alarmMs;
  }
}
