import type { ChannelId, ProviderId } from '../domain/models.js';
import type { PlaybackEngineName } from '../playback/contracts.js';
import type {
  PlayerSessionPort,
  SessionSwitchRequest,
  SessionSwitchResult,
} from '../live-tv/contracts.js';
import { WatchStateService } from './service.js';

export interface WatchClock {
  now(): number;
}

export type WatchSessionFinalizeReason = 'switch' | 'stop' | 'ended' | 'error';

export interface PlaybackWatchSessionStart {
  sessionId: number;
  providerId: ProviderId;
  channelId: ChannelId;
}

export interface PlaybackWatchSessionFinalized {
  sessionId: number;
  reason: WatchSessionFinalizeReason;
}

export interface PlaybackTerminalEvent {
  token: number;
  reason: 'ended' | 'error';
}

export interface PlaybackTerminalSource {
  onPlaybackTerminal(callback: (event: PlaybackTerminalEvent) => void): void;
  getPlaybackToken(): number | null;
}

interface ActiveWatchSession extends PlaybackWatchSessionStart {
  startedAtMs: number;
}

function safeCall(callback: (() => void) | undefined): void {
  if (callback === undefined) return;
  try {
    callback();
  } catch {
    // Observation is deliberately downstream-only. An observer failure must
    // never take ownership of playback or alter recovery/control flow.
  }
}

export class PlaybackWatchObserver {
  private active: ActiveWatchSession | null = null;
  private highestSessionId = 0;
  private persistenceTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly service: WatchStateService,
    private readonly clock: WatchClock,
  ) {}

  playbackStarted(input: PlaybackWatchSessionStart): void {
    if (!Number.isInteger(input.sessionId) || input.sessionId <= 0) return;
    if (input.sessionId <= this.highestSessionId) return;

    this.finalizeCurrent('switch');

    let startedAtMs: number;
    try {
      startedAtMs = this.clock.now();
    } catch {
      return;
    }
    if (!Number.isFinite(startedAtMs)) return;

    this.highestSessionId = input.sessionId;
    this.active = {
      ...input,
      startedAtMs,
    };
    this.enqueuePersistence(() => this.service.recordPlaybackStarted(
      input.providerId,
      input.channelId,
      startedAtMs,
    ));
  }

  playbackFinalized(input: PlaybackWatchSessionFinalized): void {
    const active = this.active;
    if (active === null || active.sessionId !== input.sessionId) return;

    let endedAtMs: number;
    try {
      endedAtMs = this.clock.now();
    } catch {
      return;
    }
    if (!Number.isFinite(endedAtMs)) return;

    // Clear ownership before any asynchronous persistence starts so duplicate
    // stop/end/error callbacks cannot double-count the same watch session.
    this.active = null;
    this.enqueuePersistence(() => this.service.recordCompletedSession({
      providerId: active.providerId,
      channelId: active.channelId,
      durationMs: Math.max(0, endedAtMs - active.startedAtMs),
      endedAtMs,
    }).then(() => undefined));
  }

  finalizeCurrent(reason: WatchSessionFinalizeReason): void {
    const active = this.active;
    if (active === null) return;
    this.playbackFinalized({ sessionId: active.sessionId, reason });
  }

  flush(): Promise<void> {
    return this.persistenceTail;
  }

  private enqueuePersistence(operation: () => Promise<void>): void {
    this.persistenceTail = this.persistenceTail
      .then(operation, operation)
      .catch(() => {
        // Durable watch-state failure is contained at the observation boundary.
        // Playback/session ownership must remain completely independent.
      });
  }
}

export interface PlaybackTerminalSources {
  shaka?: PlaybackTerminalSource | null;
  avplay?: PlaybackTerminalSource | null;
}

export class LegacyPlaybackTerminalBinder {
  constructor(
    private readonly observer: PlaybackWatchObserver,
    private readonly sources: PlaybackTerminalSources,
  ) {}

  bind(engine: PlaybackEngineName, sessionId: number): void {
    const source = this.sources[engine];
    if (source === null || source === undefined) return;

    try {
      const token = source.getPlaybackToken();
      if (token === null || !Number.isFinite(token)) return;
      source.onPlaybackTerminal((event) => {
        if (event.token !== token) return;
        this.observer.playbackFinalized({
          sessionId,
          reason: event.reason,
        });
      });
    } catch {
      // Terminal binding is optional observation and cannot affect playback.
    }
  }
}

export class WatchObservingPlayerSession implements PlayerSessionPort {
  private nextWatchSessionId = 0;

  constructor(
    private readonly inner: PlayerSessionPort,
    private readonly observer: PlaybackWatchObserver,
    private readonly terminalBinder?: LegacyPlaybackTerminalBinder,
  ) {}

  async switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult> {
    let handoffObserved = false;
    let rollbackObserved = false;
    const originalHandoff = request.onHandoffStarted;
    const originalRollback = request.onRollbackRestored;

    const observedRequest: SessionSwitchRequest = {
      ...request,
      onHandoffStarted: () => {
        if (!handoffObserved) {
          handoffObserved = true;
          safeCall(() => this.observer.finalizeCurrent('switch'));
        }
        safeCall(originalHandoff);
      },
      onRollbackRestored: (engine) => {
        if (
          !rollbackObserved
          && request.providerId !== undefined
          && request.previousChannelId !== null
        ) {
          rollbackObserved = true;
          this.startObservedSession(
            request.providerId,
            request.previousChannelId,
            engine,
          );
        }
        safeCall(originalRollback === undefined
          ? undefined
          : () => originalRollback(engine));
      },
    };

    const result = await this.inner.switchTo(observedRequest);
    if (result.status === 'playing' && request.providerId !== undefined) {
      this.startObservedSession(
        request.providerId,
        request.targetChannelId,
        result.engine,
      );
    }
    return result;
  }

  stop(): Promise<void> | void {
    safeCall(() => this.observer.finalizeCurrent('stop'));
    return this.inner.stop();
  }

  private startObservedSession(
    providerId: ProviderId,
    channelId: ChannelId,
    engine: PlaybackEngineName,
  ): void {
    const sessionId = ++this.nextWatchSessionId;
    safeCall(() => this.observer.playbackStarted({
      sessionId,
      providerId,
      channelId,
    }));
    safeCall(() => this.terminalBinder?.bind(engine, sessionId));
  }
}
