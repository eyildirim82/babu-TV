import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlaybackEngineName,
  PlaybackEnginePort,
  PlaybackResult,
  StreamRequest,
} from '../src/playback/contracts.js';
import type { SessionSwitchRequest } from '../src/live-tv/contracts.js';
import { PlayerSessionCoordinator, type SessionTimers } from '../src/playback/player-session-coordinator.js';
import { StructuredWatchStateRepository } from '../src/repository/structured-watch-state-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';
import { WatchStateService } from '../src/watch/service.js';
import {
  LegacyPlaybackTerminalBinder,
  PlaybackWatchObserver,
  WatchObservingPlayerSession,
  type PlaybackTerminalEvent,
  type PlaybackTerminalSource,
  type WatchClock,
} from '../src/watch/playback-session-observer.js';

class FakeClock implements WatchClock {
  constructor(public value: number) {}
  now(): number {
    return this.value;
  }
  advance(deltaMs: number): void {
    this.value += deltaMs;
  }
}

class QueueEngine implements PlaybackEnginePort {
  constructor(
    readonly name: PlaybackEngineName,
    private readonly results: PlaybackResult[],
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async open(_request: StreamRequest): Promise<PlaybackResult> {
    const next = this.results.shift();
    if (next === undefined) throw new Error('missing queued playback result');
    return next;
  }

  stop(): void {}
}

class AdvancingTimers implements SessionTimers {
  constructor(private readonly clock: FakeClock) {}

  async sleep(delayMs: number): Promise<void> {
    this.clock.advance(delayMs);
  }
}

class FakeTerminalSource implements PlaybackTerminalSource {
  token: number | null = 1;
  callback: ((event: PlaybackTerminalEvent) => void) | null = null;

  onPlaybackTerminal(callback: (event: PlaybackTerminalEvent) => void): void {
    this.callback = callback;
  }

  getPlaybackToken(): number | null {
    return this.token;
  }

  emit(event: PlaybackTerminalEvent): void {
    this.callback?.(event);
  }
}

function request(channelId: string, previousChannelId: string | null = null): SessionSwitchRequest {
  return {
    intentId: 1,
    providerId: 'p1',
    targetChannelId: channelId,
    previousChannelId,
    initialRequest: { url: `https://stream.example.test/${channelId}` },
    reResolveTarget: async () => ({ url: `https://stream.example.test/${channelId}` }),
    resolvePrevious: previousChannelId === null
      ? null
      : async () => ({ url: `https://stream.example.test/${previousChannelId}` }),
    isCurrent: () => true,
    onRecovering: () => {},
  };
}

function harness(clock: FakeClock) {
  const repository = new StructuredWatchStateRepository(new MemoryStructuredStore());
  const service = new WatchStateService(repository, { minimumSessionMs: 30_000 });
  const observer = new PlaybackWatchObserver(service, clock);
  return { service, observer };
}

void test('retry time before successful playback is excluded and the successful session counts once', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = harness(clock);
  const shaka = new QueueEngine('shaka', [
    { ok: false, engine: null, error: 'NETWORK' },
    { ok: true, engine: 'shaka', error: null },
  ]);
  const avplay = new QueueEngine('avplay', []);
  const terminal = new FakeTerminalSource();
  const session = new WatchObservingPlayerSession(
    new PlayerSessionCoordinator(shaka, avplay, new AdvancingTimers(clock)),
    observer,
    new LegacyPlaybackTerminalBinder(observer, { shaka: terminal }),
  );

  assert.deepEqual(await session.switchTo(request('c1')), {
    status: 'playing',
    engine: 'shaka',
  });
  clock.advance(40_000);
  await session.stop();
  await observer.flush();

  assert.deepEqual(await service.getLastWatched('p1'), {
    providerId: 'p1',
    channelId: 'c1',
    lastPlayedAtMs: 1_250,
  });
  assert.deepEqual(await service.getAggregate('p1', 'c1'), {
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 40_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 41_250,
  });
});

void test('repeated stop and terminal callbacks finalize one session exactly once', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = harness(clock);
  const terminal = new FakeTerminalSource();
  const inner = {
    async switchTo(_request: SessionSwitchRequest) {
      return { status: 'playing' as const, engine: 'shaka' as const };
    },
    stop() {},
  };
  const session = new WatchObservingPlayerSession(
    inner,
    observer,
    new LegacyPlaybackTerminalBinder(observer, { shaka: terminal }),
  );

  await session.switchTo(request('c1'));
  clock.advance(35_000);
  session.stop();
  session.stop();
  terminal.emit({ token: 1, reason: 'ended' });
  terminal.emit({ token: 1, reason: 'error' });
  await observer.flush();

  assert.deepEqual(await service.getAggregate('p1', 'c1'), {
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 35_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 36_000,
  });
});
