import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlaybackEngineName,
  PlaybackEnginePort,
  PlaybackResult,
  StreamRequest,
} from '../src/playback/contracts.js';
import type {
  PlayerSessionPort,
  SessionSwitchRequest,
  SessionSwitchResult,
} from '../src/live-tv/contracts.js';
import { PlayerSessionCoordinator } from '../src/playback/player-session-coordinator.js';
import { StructuredWatchStateRepository } from '../src/repository/structured-watch-state-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';
import { scoreWatchAggregate } from '../src/watch/score.js';
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

class FakeTerminalSource implements PlaybackTerminalSource {
  token: number | null = null;
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

class PlannedSession implements PlayerSessionPort {
  stops = 0;

  constructor(
    private readonly plan: (request: SessionSwitchRequest) => Promise<SessionSwitchResult>,
  ) {}

  switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult> {
    return this.plan(request);
  }

  stop(): void {
    this.stops += 1;
  }
}

function request(input: {
  intentId: number;
  providerId: string;
  targetChannelId: string;
  previousChannelId?: string | null;
}): SessionSwitchRequest {
  const previousChannelId = input.previousChannelId ?? null;
  return {
    intentId: input.intentId,
    providerId: input.providerId,
    targetChannelId: input.targetChannelId,
    previousChannelId,
    initialRequest: { url: `https://stream.example.test/${input.targetChannelId}` },
    reResolveTarget: async () => ({ url: `https://stream.example.test/${input.targetChannelId}` }),
    resolvePrevious: previousChannelId === null
      ? null
      : async () => ({ url: `https://stream.example.test/${previousChannelId}` }),
    isCurrent: () => true,
    onRecovering: () => {},
  };
}

function watchHarness(clock: FakeClock, minimumSessionMs = 30_000) {
  const repository = new StructuredWatchStateRepository(new MemoryStructuredStore());
  const service = new WatchStateService(repository, { minimumSessionMs });
  const observer = new PlaybackWatchObserver(service, clock);
  return { repository, service, observer };
}

void test('successful meaningful playback persists deterministic WATCH-R aggregate and WATCH-S input', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);

  observer.playbackStarted({ sessionId: 1, providerId: 'p1', channelId: 'c1' });
  clock.advance(60_000);
  observer.playbackFinalized({ sessionId: 1, reason: 'ended' });
  await observer.flush();

  assert.deepEqual(await service.getLastWatched('p1'), {
    providerId: 'p1',
    channelId: 'c1',
    lastPlayedAtMs: 1_000,
  });
  const aggregate = await service.getAggregate('p1', 'c1');
  assert.deepEqual(aggregate, {
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 60_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 61_000,
  });
  assert.ok(aggregate);
  const policy = {
    durationWeightPerMinute: 2,
    openWeight: 3,
    recencyHalfLifeMs: 60_000,
  };
  assert.equal(
    scoreWatchAggregate(aggregate, 61_000, policy),
    scoreWatchAggregate(aggregate, 61_000, policy),
  );
});

void test('short zap records playback start but suppresses meaningful aggregate', async () => {
  const clock = new FakeClock(10_000);
  const { service, observer } = watchHarness(clock);

  observer.playbackStarted({ sessionId: 1, providerId: 'p1', channelId: 'c1' });
  clock.advance(5_000);
  observer.playbackFinalized({ sessionId: 1, reason: 'switch' });
  await observer.flush();

  assert.deepEqual(await service.getLastWatched('p1'), {
    providerId: 'p1',
    channelId: 'c1',
    lastPlayedAtMs: 10_000,
  });
  assert.equal(await service.getAggregate('p1', 'c1'), null);
});

void test('channel switch finalizes previous session exactly once and starts target after success', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);
  const inner = new PlannedSession(async (switchRequest) => {
    switchRequest.onHandoffStarted?.();
    switchRequest.onHandoffStarted?.();
    return { status: 'playing', engine: 'shaka' };
  });
  const watched = new WatchObservingPlayerSession(inner, observer);

  await watched.switchTo(request({ intentId: 1, providerId: 'p1', targetChannelId: 'c1' }));
  clock.advance(40_000);
  await watched.switchTo(request({
    intentId: 2,
    providerId: 'p1',
    targetChannelId: 'c2',
    previousChannelId: 'c1',
  }));
  await observer.flush();

  assert.deepEqual(await service.getAggregate('p1', 'c1'), {
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 40_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 41_000,
  });
  assert.equal(await service.getAggregate('p1', 'c2'), null);
  assert.deepEqual(await service.getLastWatched('p1'), {
    providerId: 'p1',
    channelId: 'c2',
    lastPlayedAtMs: 41_000,
  });
});

void test('failed startup produces no false watch duration or open', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);
  const inner = new PlannedSession(async (switchRequest) => {
    switchRequest.onHandoffStarted?.();
    clock.advance(20_000);
    return {
      status: 'failed',
      error: 'NETWORK',
      rollback: 'not-needed',
    };
  });
  const watched = new WatchObservingPlayerSession(inner, observer);

  await watched.switchTo(request({ intentId: 1, providerId: 'p1', targetChannelId: 'c1' }));
  await observer.flush();

  assert.equal(await service.getLastWatched('p1'), null);
  assert.equal(await service.getAggregate('p1', 'c1'), null);
});

void test('rollback restoration starts a fresh previous-channel session without double-counting target failure', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);
  let call = 0;
  const inner = new PlannedSession(async (switchRequest) => {
    switchRequest.onHandoffStarted?.();
    call += 1;
    if (call === 1) return { status: 'playing', engine: 'shaka' };
    clock.advance(5_000);
    switchRequest.onRollbackRestored?.('shaka');
    return {
      status: 'failed',
      error: 'NETWORK',
      rollback: 'restored',
    };
  });
  const watched = new WatchObservingPlayerSession(inner, observer);

  await watched.switchTo(request({ intentId: 1, providerId: 'p1', targetChannelId: 'c1' }));
  clock.advance(40_000);
  await watched.switchTo(request({
    intentId: 2,
    providerId: 'p1',
    targetChannelId: 'c2',
    previousChannelId: 'c1',
  }));
  clock.advance(35_000);
  await watched.stop();
  await observer.flush();

  assert.deepEqual(await service.getAggregate('p1', 'c1'), {
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 75_000,
    meaningfulOpenCount: 2,
    lastMeaningfulWatchAtMs: 81_000,
  });
  assert.equal(await service.getAggregate('p1', 'c2'), null);
});

void test('stale and repeated terminal callbacks are ignored while current terminal finalizes once', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);
  const shaka = new FakeTerminalSource();
  const avplay = new FakeTerminalSource();
  const binder = new LegacyPlaybackTerminalBinder(observer, { shaka, avplay });
  const inner = new PlannedSession(async (switchRequest) => {
    switchRequest.onHandoffStarted?.();
    return { status: 'playing', engine: 'shaka' };
  });
  const watched = new WatchObservingPlayerSession(inner, observer, binder);

  shaka.token = 10;
  await watched.switchTo(request({ intentId: 1, providerId: 'p1', targetChannelId: 'c1' }));
  clock.advance(40_000);
  shaka.token = 20;
  await watched.switchTo(request({
    intentId: 2,
    providerId: 'p1',
    targetChannelId: 'c2',
    previousChannelId: 'c1',
  }));

  shaka.emit({ token: 10, reason: 'error' });
  clock.advance(35_000);
  shaka.emit({ token: 20, reason: 'ended' });
  shaka.emit({ token: 20, reason: 'error' });
  await observer.flush();

  assert.deepEqual(await service.getAggregate('p1', 'c1'), {
    providerId: 'p1',
    channelId: 'c1',
    meaningfulWatchMs: 40_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 41_000,
  });
  assert.deepEqual(await service.getAggregate('p1', 'c2'), {
    providerId: 'p1',
    channelId: 'c2',
    meaningfulWatchMs: 35_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 76_000,
  });
});

void test('provider identity stays isolated across identical channel ids', async () => {
  const clock = new FakeClock(1_000);
  const { service, observer } = watchHarness(clock);

  observer.playbackStarted({ sessionId: 1, providerId: 'p1', channelId: 'shared' });
  clock.advance(30_000);
  observer.playbackFinalized({ sessionId: 1, reason: 'switch' });
  observer.playbackStarted({ sessionId: 2, providerId: 'p2', channelId: 'shared' });
  clock.advance(45_000);
  observer.playbackFinalized({ sessionId: 2, reason: 'stop' });
  await observer.flush();

  assert.deepEqual(await service.getAggregate('p1', 'shared'), {
    providerId: 'p1',
    channelId: 'shared',
    meaningfulWatchMs: 30_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 31_000,
  });
  assert.deepEqual(await service.getAggregate('p2', 'shared'), {
    providerId: 'p2',
    channelId: 'shared',
    meaningfulWatchMs: 45_000,
    meaningfulOpenCount: 1,
    lastMeaningfulWatchAtMs: 76_000,
  });
});

class FakeEngine implements PlaybackEnginePort {
  readonly name: PlaybackEngineName;
  private readonly queue: PlaybackResult[];

  constructor(name: PlaybackEngineName, results: PlaybackResult[]) {
    this.name = name;
    this.queue = [...results];
  }

  isAvailable(): boolean {
    return true;
  }

  async open(_request: StreamRequest): Promise<PlaybackResult> {
    const next = this.queue.shift();
    if (!next) throw new Error('missing queued result');
    return next;
  }

  stop(): void {}
}

void test('PlayerSessionCoordinator observation callbacks do not fire for stale or failed prepare attempts', async () => {
  const shaka = new FakeEngine('shaka', [
    { ok: false, engine: null, error: 'NETWORK' },
    { ok: false, engine: null, error: 'NETWORK' },
    { ok: false, engine: null, error: 'NETWORK' },
  ]);
  const avplay = new FakeEngine('avplay', []);
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, {
    sleep: async () => {},
  });
  let handoffs = 0;
  let rollbacks = 0;
  const current = { value: true };
  const switchRequest = request({ intentId: 1, providerId: 'p1', targetChannelId: 'c1' });
  switchRequest.isCurrent = () => current.value;
  switchRequest.onHandoffStarted = () => { handoffs += 1; };
  switchRequest.onRollbackRestored = () => { rollbacks += 1; };

  assert.deepEqual(await coordinator.switchTo(switchRequest), {
    status: 'failed',
    error: 'NETWORK',
    rollback: 'not-needed',
  });
  assert.equal(handoffs, 1);
  assert.equal(rollbacks, 0);

  current.value = false;
  assert.deepEqual(await coordinator.switchTo(switchRequest), {
    status: 'failed',
    error: 'UNKNOWN',
    rollback: 'not-needed',
  });
  assert.equal(handoffs, 1);
  assert.equal(rollbacks, 0);
});
