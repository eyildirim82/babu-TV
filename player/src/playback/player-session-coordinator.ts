import type {
  PlayerSessionPort,
  SessionSwitchRequest,
  SessionSwitchResult,
} from '../live-tv/contracts.js';
import type {
  PlaybackEngineName,
  PlaybackEnginePort,
  PlaybackErrorCode,
  PlaybackResult,
  StreamRequest,
} from './contracts.js';

export interface SessionTimers {
  sleep(delayMs: number): Promise<void>;
}

type AttemptResult =
  | { ok: true; engine: PlaybackEngineName }
  | { ok: false; error: PlaybackErrorCode };

interface FallbackBudget {
  used: boolean;
}

const defaultTimers: SessionTimers = {
  sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  },
};

function failed(
  error: PlaybackErrorCode,
  rollback: 'not-needed' | 'restored' | 'failed' = 'not-needed',
): SessionSwitchResult {
  return { status: 'failed', error, rollback };
}

function normalizedFailure(result: PlaybackResult, fallback: PlaybackErrorCode): PlaybackErrorCode {
  return result.error ?? fallback;
}

function isFallbackError(error: PlaybackErrorCode): boolean {
  return error === 'ENGINE_FAILURE' || error === 'UNSUPPORTED_CODEC';
}

function notifyObservation(callback: (() => void) | undefined): void {
  if (callback === undefined) return;
  try {
    callback();
  } catch {
    // Playback observation is explicitly non-owning. A consumer failure must
    // never alter handoff, retry, fallback, rollback, or last-intent-wins.
  }
}

/**
 * Owns the M3 playback session below ChannelIntentCoordinator.
 *
 * StreamRequest values intentionally stay local to each operation: the
 * coordinator never logs, caches, serializes, or stores credential-bearing
 * stream material on the instance.
 */
export class PlayerSessionCoordinator implements PlayerSessionPort {
  private activeEngine: PlaybackEnginePort | null = null;
  private currentOperationId = 0;
  private serialTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly shaka: PlaybackEnginePort,
    private readonly avplay: PlaybackEnginePort,
    private readonly timers: SessionTimers = defaultTimers,
  ) {}

  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult> {
    const operationId = ++this.currentOperationId;
    return this.enqueue(() => this.switchToExclusive(request, operationId));
  }

  stop(): Promise<void> {
    ++this.currentOperationId;
    return this.enqueue(async () => {
      await this.stopActiveEngine();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serialTail.then(operation);
    this.serialTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async switchToExclusive(
    request: SessionSwitchRequest,
    operationId: number,
  ): Promise<SessionSwitchResult> {
    const isCurrent = (): boolean => (
      operationId === this.currentOperationId && request.isCurrent()
    );

    // A request that became stale while waiting for session ownership must not
    // disrupt the currently playing channel.
    if (!isCurrent()) return failed('UNKNOWN');

    // ChannelIntentCoordinator calls us only after target resolution succeeds,
    // so this is the first allowed disruptive handoff point. Observation is
    // notified immediately before the already-existing handoff and cannot
    // influence whether that handoff occurs.
    notifyObservation(request.onHandoffStarted);
    await this.stopActiveEngine();
    if (!isCurrent()) return failed('UNKNOWN');

    const target = await this.playTarget({
      request: request.initialRequest,
      reResolve: request.reResolveTarget,
      isCurrent,
    });

    if (target.ok) {
      return { status: 'playing', engine: target.engine };
    }

    const targetError = target.error;
    if (!isCurrent()) return failed(targetError);

    if (request.previousChannelId === null || request.resolvePrevious === null) {
      return failed(targetError);
    }

    request.onRecovering();
    if (!isCurrent()) return failed(targetError);

    let previousRequest: StreamRequest;
    try {
      previousRequest = await request.resolvePrevious();
    } catch {
      return isCurrent()
        ? failed(targetError, 'failed')
        : failed(targetError);
    }

    if (!isCurrent()) return failed(targetError);

    // Rollback is deliberately one bounded engine-policy attempt. It never
    // enters the target retry loop and therefore cannot recurse indefinitely.
    const rollback = await this.openShakaThenMeaningfulFallback(
      previousRequest,
      isCurrent,
      { used: false },
    );
    if (!isCurrent()) return failed(targetError);

    if (rollback.ok) {
      notifyObservation(request.onRollbackRestored === undefined
        ? undefined
        : () => request.onRollbackRestored?.(rollback.engine));
    }
    return failed(targetError, rollback.ok ? 'restored' : 'failed');
  }

  private async playTarget(input: {
    request: StreamRequest;
    reResolve(): Promise<StreamRequest>;
    isCurrent(): boolean;
  }): Promise<AttemptResult> {
    let request = input.request;
    let authRetries = 0;
    let transientRetries = 0;
    let lastError: PlaybackErrorCode = 'UNKNOWN';
    const fallbackBudget: FallbackBudget = { used: false };

    while (input.isCurrent()) {
      const result = await this.openShakaThenMeaningfulFallback(
        request,
        input.isCurrent,
        fallbackBudget,
      );
      if (result.ok) return result;

      lastError = result.error;
      if (!input.isCurrent()) return result;

      if (result.error === 'AUTH' && authRetries < 1) {
        authRetries += 1;
        try {
          request = await input.reResolve();
        } catch {
          return { ok: false, error: 'AUTH' };
        }
        if (!input.isCurrent()) return { ok: false, error: 'AUTH' };
        continue;
      }

      if (
        (result.error === 'NETWORK' || result.error === 'TIMEOUT')
        && transientRetries < 2
      ) {
        transientRetries += 1;
        await this.timers.sleep(250 * transientRetries);
        if (!input.isCurrent()) return result;
        continue;
      }

      return result;
    }

    return { ok: false, error: lastError };
  }

  private async openShakaThenMeaningfulFallback(
    request: StreamRequest,
    isCurrent: () => boolean,
    fallbackBudget: FallbackBudget,
  ): Promise<AttemptResult> {
    if (!isCurrent()) return { ok: false, error: 'UNKNOWN' };

    let shakaError: PlaybackErrorCode = 'ENGINE_FAILURE';

    if (this.shaka.isAvailable()) {
      const shakaResult = await this.openEngine(this.shaka, request);
      if (!isCurrent()) {
        await this.safeStop(this.shaka);
        return { ok: false, error: 'UNKNOWN' };
      }
      if (shakaResult.ok) {
        this.activeEngine = this.shaka;
        return { ok: true, engine: 'shaka' };
      }

      shakaError = normalizedFailure(shakaResult, 'UNKNOWN');
      await this.safeStop(this.shaka);
    }

    if (
      fallbackBudget.used
      || !isFallbackError(shakaError)
      || !isCurrent()
      || !this.avplay.isAvailable()
    ) {
      return { ok: false, error: shakaError };
    }

    fallbackBudget.used = true;
    const avplayResult = await this.openEngine(this.avplay, request);
    if (!isCurrent()) {
      await this.safeStop(this.avplay);
      return { ok: false, error: shakaError };
    }
    if (avplayResult.ok) {
      this.activeEngine = this.avplay;
      return { ok: true, engine: 'avplay' };
    }

    await this.safeStop(this.avplay);
    return {
      ok: false,
      error: normalizedFailure(avplayResult, 'ENGINE_FAILURE'),
    };
  }

  private async openEngine(
    engine: PlaybackEnginePort,
    request: StreamRequest,
  ): Promise<PlaybackResult> {
    try {
      return await engine.open(request);
    } catch {
      return { ok: false, engine: null, error: 'ENGINE_FAILURE' };
    }
  }

  private async stopActiveEngine(): Promise<void> {
    const active = this.activeEngine;
    this.activeEngine = null;
    if (active !== null) await this.safeStop(active);
  }

  private async safeStop(engine: PlaybackEnginePort): Promise<void> {
    try {
      await engine.stop();
    } catch {
      // Engine teardown errors are intentionally contained. The next bounded
      // handoff still owns the session and no secret/transient material leaks.
    }
  }
}
