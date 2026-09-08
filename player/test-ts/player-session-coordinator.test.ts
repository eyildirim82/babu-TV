import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  PlaybackEngineName,
  PlaybackEnginePort,
  PlaybackErrorCode,
  PlaybackResult,
  StreamRequest,
} from '../src/playback/contracts.js';
import type { SessionSwitchRequest } from '../src/live-tv/contracts.js';
import {
  PlayerSessionCoordinator,
  type SessionTimers,
} from '../src/playback/player-session-coordinator.js';

function stream(channelId: string): StreamRequest {
  return { url: `https://stream.example.test/${channelId}?token=transient` };
}

function ok(engine: PlaybackEngineName): PlaybackResult {
  return { ok: true, engine, error: null };
}

function fail(error: PlaybackErrorCode): PlaybackResult {
  return { ok: false, engine: null, error };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

type QueuedOpen = PlaybackResult | Promise<PlaybackResult>;

class FakeEngine implements PlaybackEnginePort {
  readonly opens: string[] = [];
  stops = 0;
  available = true;
  inFlight = 0;
  maxInFlight = 0;
  private readonly queue: QueuedOpen[] = [];

  constructor(
    readonly name: PlaybackEngineName,
    private readonly globalOrder: string[],
  ) {}

  enqueue(...results: QueuedOpen[]): void {
    this.queue.push(...results);
  }

  isAvailable(): boolean {
    return this.available;
  }

  async open(request: StreamRequest): Promise<PlaybackResult> {
    const pathname = new URL(request.url).pathname;
    const channelId = pathname.split('/').filter(Boolean).pop() ?? 'unknown';
    const entry = `${this.name}:${channelId}`;
    this.opens.push(entry);
    this.globalOrder.push(entry);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      const next = this.queue.shift();
      if (!next) throw new Error(`No queued ${this.name} result.`);
      return await next;
    } finally {
      this.inFlight -= 1;
    }
  }

  stop(): void {
    this.stops += 1;
    this.globalOrder.push(`stop:${this.name}`);
  }
}

class RecordingTimers implements SessionTimers {
  readonly delays: number[] = [];

  constructor(private readonly onSleep?: (delayMs: number) => void) {}

  async sleep(delayMs: number): Promise<void> {
    this.delays.push(delayMs);
    this.onSleep?.(delayMs);
  }
}

interface RequestOptions {
  previousChannelId?: string | null;
  current?: { value: boolean };
  onReResolve?: () => Promise<StreamRequest>;
  onResolvePrevious?: () => Promise<StreamRequest>;
  onRecovering?: () => void;
}

function req(channelId: string, options: RequestOptions = {}): SessionSwitchRequest {
  const current = options.current ?? { value: true };
  const previousChannelId = options.previousChannelId ?? null;
  return {
    intentId: 1,
    targetChannelId: channelId,
    previousChannelId,
    initialRequest: stream(channelId),
    reResolveTarget: options.onReResolve ?? (async () => stream(`${channelId}-refresh`)),
    resolvePrevious: previousChannelId === null
      ? null
      : options.onResolvePrevious ?? (async () => stream(previousChannelId)),
    isCurrent: () => current.value,
    onRecovering: options.onRecovering ?? (() => {}),
  };
}

void test('starts each new channel with Shaka even after prior AVPlay success', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  shaka.enqueue(fail('UNSUPPORTED_CODEC'), ok('shaka'));
  avplay.enqueue(ok('avplay'));
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, new RecordingTimers());

  assert.deepEqual(await coordinator.switchTo(req('a')), {
    status: 'playing',
    engine: 'avplay',
  });
  assert.deepEqual(await coordinator.switchTo(req('b')), {
    status: 'playing',
    engine: 'shaka',
  });
  assert.deepEqual(
    order.filter((entry) => !entry.startsWith('stop:')),
    ['shaka:a', 'avplay:a', 'shaka:b'],
  );
});

void test('AUTH re-resolves once and retries playback at most once', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  shaka.enqueue(fail('AUTH'), fail('AUTH'));
  let reResolveCalls = 0;
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, new RecordingTimers());

  const result = await coordinator.switchTo(req('a', {
    onReResolve: async () => {
      reResolveCalls += 1;
      return stream('a-refresh');
    },
  }));

  assert.deepEqual(result, {
    status: 'failed',
    error: 'AUTH',
    rollback: 'not-needed',
  });
  assert.equal(reResolveCalls, 1);
  assert.deepEqual(shaka.opens, ['shaka:a', 'shaka:a-refresh']);
  assert.equal(avplay.opens.length, 0);
});

for (const error of ['NETWORK', 'TIMEOUT'] as const) {
  void test(`${error} retries exactly twice with bounded backoff`, async () => {
    const order: string[] = [];
    const shaka = new FakeEngine('shaka', order);
    const avplay = new FakeEngine('avplay', order);
    shaka.enqueue(fail(error), fail(error), fail(error));
    const timers = new RecordingTimers();
    const coordinator = new PlayerSessionCoordinator(shaka, avplay, timers);

    assert.deepEqual(await coordinator.switchTo(req('a')), {
      status: 'failed',
      error,
      rollback: 'not-needed',
    });
    assert.equal(shaka.opens.length, 3);
    assert.deepEqual(timers.delays, [250, 500]);
    assert.equal(avplay.opens.length, 0);
  });
}

void test('STREAM_NOT_FOUND fails without retry or fallback', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  shaka.enqueue(fail('STREAM_NOT_FOUND'));
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, new RecordingTimers());

  assert.deepEqual(await coordinator.switchTo(req('missing')), {
    status: 'failed',
    error: 'STREAM_NOT_FOUND',
    rollback: 'not-needed',
  });
  assert.equal(shaka.opens.length, 1);
  assert.equal(avplay.opens.length, 0);
});

void test('engine failure performs at most one alternate-engine fallback without ping-pong', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  shaka.enqueue(fail('ENGINE_FAILURE'));
  avplay.enqueue(fail('ENGINE_FAILURE'));
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, new RecordingTimers());

  assert.deepEqual(await coordinator.switchTo(req('a')), {
    status: 'failed',
    error: 'ENGINE_FAILURE',
    rollback: 'not-needed',
  });
  assert.deepEqual(shaka.opens, ['shaka:a']);
  assert.deepEqual(avplay.opens, ['avplay:a']);
});

void test('alternate-engine fallback budget is one across transient retry categories', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  shaka.enqueue(fail('ENGINE_FAILURE'), fail('ENGINE_FAILURE'));
  avplay.enqueue(fail('NETWORK'));
  const timers = new RecordingTimers();
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, timers);

  assert.deepEqual(await coordinator.switchTo(req('a')), {
    status: 'failed',
    error: 'ENGINE_FAILURE',
    rollback: 'not-needed',
  });
  assert.deepEqual(timers.delays, [250]);
  assert.equal(shaka.opens.length, 2);
  assert.equal(avplay.opens.length, 1);
});

void test('failed target restores previous channel but keeps target failure terminal result', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  shaka.enqueue(fail('STREAM_NOT_FOUND'), ok('shaka'));
  let previousResolveCalls = 0;
  let recoveringCalls = 0;
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, new RecordingTimers());

  const result = await coordinator.switchTo(req('b', {
    previousChannelId: 'a',
    onResolvePrevious: async () => {
      previousResolveCalls += 1;
      return stream('a');
    },
    onRecovering: () => {
      recoveringCalls += 1;
    },
  }));

  assert.deepEqual(result, {
    status: 'failed',
    error: 'STREAM_NOT_FOUND',
    rollback: 'restored',
  });
  assert.equal(previousResolveCalls, 1);
  assert.equal(recoveringCalls, 1);
  assert.deepEqual(shaka.opens, ['shaka:b', 'shaka:a']);
});

void test('new intent invalidates old rollback before previous stream resolution', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  const current = { value: true };
  let previousResolveCalls = 0;
  shaka.enqueue(Promise.resolve(fail('STREAM_NOT_FOUND')).then((result) => {
    current.value = false;
    return result;
  }));
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, new RecordingTimers());

  const result = await coordinator.switchTo(req('b', {
    previousChannelId: 'a',
    current,
    onResolvePrevious: async () => {
      previousResolveCalls += 1;
      return stream('a');
    },
  }));

  assert.equal(previousResolveCalls, 0);
  assert.equal(result.status, 'failed');
});

void test('stale retry is suppressed after backoff without another engine open', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  const current = { value: true };
  shaka.enqueue(fail('NETWORK'));
  const timers = new RecordingTimers(() => {
    current.value = false;
  });
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, timers);

  assert.deepEqual(await coordinator.switchTo(req('a', { current })), {
    status: 'failed',
    error: 'NETWORK',
    rollback: 'not-needed',
  });
  assert.equal(shaka.opens.length, 1);
  assert.deepEqual(timers.delays, [250]);
});

void test('overlapping switch requests serialize engine ownership and stale completion cannot reopen over the winner', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  const firstOpen = deferred<PlaybackResult>();
  const firstEntered = deferred<void>();
  const originalOpen = shaka.open.bind(shaka);
  let first = true;
  shaka.open = async (request: StreamRequest): Promise<PlaybackResult> => {
    if (first) {
      first = false;
      firstEntered.resolve();
    }
    return originalOpen(request);
  };
  shaka.enqueue(firstOpen.promise, ok('shaka'));
  const firstCurrent = { value: true };
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, new RecordingTimers());

  const p1 = coordinator.switchTo(req('a', { current: firstCurrent }));
  await firstEntered.promise;
  firstCurrent.value = false;
  const p2 = coordinator.switchTo(req('b'));
  firstOpen.resolve(ok('shaka'));

  assert.deepEqual(await p1, {
    status: 'failed',
    error: 'UNKNOWN',
    rollback: 'not-needed',
  });
  assert.deepEqual(await p2, {
    status: 'playing',
    engine: 'shaka',
  });
  assert.equal(shaka.maxInFlight, 1);
  assert.deepEqual(
    order.filter((entry) => entry === 'shaka:a' || entry === 'shaka:b' || entry === 'stop:shaka'),
    ['shaka:a', 'stop:shaka', 'shaka:b'],
  );
});

void test('rollback uses at most one Shaka-to-AVPlay fallback and never retries recursively', async () => {
  const order: string[] = [];
  const shaka = new FakeEngine('shaka', order);
  const avplay = new FakeEngine('avplay', order);
  shaka.enqueue(fail('STREAM_NOT_FOUND'), fail('UNSUPPORTED_CODEC'));
  avplay.enqueue(ok('avplay'));
  let previousResolveCalls = 0;
  const coordinator = new PlayerSessionCoordinator(shaka, avplay, new RecordingTimers());

  assert.deepEqual(await coordinator.switchTo(req('b', {
    previousChannelId: 'a',
    onResolvePrevious: async () => {
      previousResolveCalls += 1;
      return stream('a');
    },
  })), {
    status: 'failed',
    error: 'STREAM_NOT_FOUND',
    rollback: 'restored',
  });
  assert.equal(previousResolveCalls, 1);
  assert.deepEqual(shaka.opens, ['shaka:b', 'shaka:a']);
  assert.deepEqual(avplay.opens, ['avplay:a']);
});
