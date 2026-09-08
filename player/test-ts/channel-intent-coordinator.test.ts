import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChannelId, ProviderId } from '../src/domain/models.js';
import type { StreamRequest } from '../src/playback/contracts.js';
import { ProviderError } from '../src/providers/errors.js';
import type {
  ChannelIntentEvent,
  ChannelStreamResolver,
  PlayerSessionPort,
  SessionSwitchRequest,
  SessionSwitchResult,
} from '../src/live-tv/contracts.js';
import { ChannelIntentCoordinator } from '../src/live-tv/channel-intent-coordinator.js';

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function stream(channelId: string): StreamRequest {
  return { url: `https://stream.example.test/${channelId}` };
}

class QueueResolver implements ChannelStreamResolver {
  readonly calls: Array<{ providerId: ProviderId; channelId: ChannelId }> = [];
  private readonly queue: Array<Promise<StreamRequest>> = [];

  enqueue(...requests: Array<Promise<StreamRequest>>): void {
    this.queue.push(...requests);
  }

  resolve(providerId: ProviderId, channelId: ChannelId): Promise<StreamRequest> {
    this.calls.push({ providerId, channelId });
    const next = this.queue.shift();
    if (!next) throw new Error('No queued stream request.');
    return next;
  }
}

class RecordingSession implements PlayerSessionPort {
  readonly requests: SessionSwitchRequest[] = [];
  readonly targets: ChannelId[] = [];

  constructor(
    private readonly handler: (request: SessionSwitchRequest) => Promise<SessionSwitchResult>,
  ) {}

  async switchTo(request: SessionSwitchRequest): Promise<SessionSwitchResult> {
    this.requests.push(request);
    this.targets.push(request.targetChannelId);
    return this.handler(request);
  }

  stop(): void {}
}

function createCoordinator(
  resolver: ChannelStreamResolver,
  session: PlayerSessionPort,
  events: ChannelIntentEvent[],
): ChannelIntentCoordinator {
  return new ChannelIntentCoordinator(resolver, session, (event) => events.push(event));
}

void test('a stale resolve can never reach the session after a newer intent exists', async () => {
  const first = deferred<StreamRequest>();
  const second = deferred<StreamRequest>();
  const resolver = new QueueResolver();
  resolver.enqueue(first.promise, second.promise);
  const events: ChannelIntentEvent[] = [];
  const session = new RecordingSession(async () => ({
    status: 'playing',
    engine: 'shaka',
  }));
  const coordinator = createCoordinator(resolver, session, events);

  const p1 = coordinator.requestChannel({
    providerId: 'provider-1',
    channelId: 'a',
    previousChannelId: null,
  });
  const p2 = coordinator.requestChannel({
    providerId: 'provider-1',
    channelId: 'b',
    previousChannelId: null,
  });

  second.resolve(stream('b'));
  assert.equal(await p2, 'playing');
  first.resolve(stream('a'));

  assert.equal(await p1, 'stale');
  assert.deepEqual(session.targets, ['b']);
  assert.equal(events.some((event) => event.type === 'PLAYING' && event.intent.channelId === 'a'), false);
});

void test('a stale session completion cannot emit terminal state over a newer intent', async () => {
  const resolver = new QueueResolver();
  resolver.enqueue(Promise.resolve(stream('a')), Promise.resolve(stream('b')));
  const firstResult = deferred<SessionSwitchResult>();
  const firstEntered = deferred<void>();
  const events: ChannelIntentEvent[] = [];
  const session = new RecordingSession(async (request) => {
    if (request.targetChannelId === 'a') {
      firstEntered.resolve();
      return firstResult.promise;
    }
    return { status: 'playing', engine: 'avplay' };
  });
  const coordinator = createCoordinator(resolver, session, events);

  const p1 = coordinator.requestChannel({
    providerId: 'provider-1',
    channelId: 'a',
    previousChannelId: null,
  });
  await firstEntered.promise;
  const p2 = coordinator.requestChannel({
    providerId: 'provider-1',
    channelId: 'b',
    previousChannelId: 'a',
  });

  assert.equal(await p2, 'playing');
  firstResult.resolve({ status: 'playing', engine: 'shaka' });

  assert.equal(await p1, 'stale');
  assert.deepEqual(session.targets, ['a', 'b']);
  assert.deepEqual(
    events.filter((event) => event.type === 'PLAYING').map((event) => event.intent.channelId),
    ['b'],
  );
});

void test('stale recovery callbacks and stale failed completion are suppressed', async () => {
  const resolver = new QueueResolver();
  resolver.enqueue(Promise.resolve(stream('a')), Promise.resolve(stream('b')));
  const firstResult = deferred<SessionSwitchResult>();
  const firstEntered = deferred<void>();
  let firstRequest: SessionSwitchRequest | null = null;
  const events: ChannelIntentEvent[] = [];
  const session = new RecordingSession(async (request) => {
    if (request.targetChannelId === 'a') {
      firstRequest = request;
      firstEntered.resolve();
      return firstResult.promise;
    }
    return { status: 'playing', engine: 'shaka' };
  });
  const coordinator = createCoordinator(resolver, session, events);

  const p1 = coordinator.requestChannel({
    providerId: 'provider-1',
    channelId: 'a',
    previousChannelId: null,
  });
  await firstEntered.promise;
  const p2 = coordinator.requestChannel({
    providerId: 'provider-1',
    channelId: 'b',
    previousChannelId: 'a',
  });
  assert.equal(await p2, 'playing');

  assert.ok(firstRequest);
  firstRequest.onRecovering();
  firstResult.resolve({
    status: 'failed',
    error: 'NETWORK',
    rollback: 'failed',
  });

  assert.equal(await p1, 'stale');
  assert.equal(
    events.some((event) => event.type === 'RECOVERING' && event.intent.channelId === 'a'),
    false,
  );
  assert.equal(
    events.some((event) => event.type === 'FAILED' && event.intent.channelId === 'a'),
    false,
  );
});

void test('current session request exposes re-resolve, previous resolve, recovery and current-token hooks', async () => {
  const resolver = new QueueResolver();
  resolver.enqueue(
    Promise.resolve(stream('target-initial')),
    Promise.resolve(stream('target-refresh')),
    Promise.resolve(stream('previous')),
  );
  const events: ChannelIntentEvent[] = [];
  const session = new RecordingSession(async (request) => {
    assert.equal(request.isCurrent(), true);
    assert.equal((await request.reResolveTarget()).url, stream('target-refresh').url);
    assert.ok(request.resolvePrevious);
    assert.equal((await request.resolvePrevious()).url, stream('previous').url);
    request.onRecovering();
    return { status: 'playing', engine: 'shaka' };
  });
  const coordinator = createCoordinator(resolver, session, events);

  assert.equal(await coordinator.requestChannel({
    providerId: 'provider-1',
    channelId: 'target',
    previousChannelId: 'previous',
  }), 'playing');

  assert.deepEqual(resolver.calls, [
    { providerId: 'provider-1', channelId: 'target' },
    { providerId: 'provider-1', channelId: 'target' },
    { providerId: 'provider-1', channelId: 'previous' },
  ]);
  assert.deepEqual(events.map((event) => event.type), [
    'RESOLVING',
    'PREPARING',
    'RECOVERING',
    'PLAYING',
  ]);
});

void test('provider failures map to safe playback errors without reaching the session', async () => {
  const cases: Array<{ thrown: unknown; expected: string }> = [
    { thrown: new ProviderError('AUTH', 401, 'Authentication failed.'), expected: 'AUTH' },
    { thrown: new ProviderError('NETWORK', null, 'Network request failed.'), expected: 'NETWORK' },
    { thrown: new ProviderError('TIMEOUT', null, 'Provider request timed out.'), expected: 'TIMEOUT' },
    { thrown: new ProviderError('NOT_FOUND', 404, 'Stream was not found.'), expected: 'STREAM_NOT_FOUND' },
    { thrown: new ProviderError('SERVER', 500, 'Provider request failed.'), expected: 'UNKNOWN' },
    { thrown: new Error('https://secret.example.test/user/pass'), expected: 'UNKNOWN' },
  ];

  for (const item of cases) {
    const events: ChannelIntentEvent[] = [];
    const resolver: ChannelStreamResolver = {
      async resolve(): Promise<StreamRequest> {
        throw item.thrown;
      },
    };
    const session = new RecordingSession(async () => {
      throw new Error('session must not be reached');
    });
    const coordinator = createCoordinator(resolver, session, events);

    assert.equal(await coordinator.requestChannel({
      providerId: 'provider-1',
      channelId: 'target',
      previousChannelId: null,
    }), 'failed');
    assert.equal(session.requests.length, 0);
    const terminal = events[events.length - 1];
    assert.ok(terminal?.type === 'FAILED');
    assert.equal(terminal.error, item.expected);
    assert.equal(terminal.rollback, 'not-needed');
  }
});

void test('current failed session result emits FAILED and returns failed', async () => {
  const resolver = new QueueResolver();
  resolver.enqueue(Promise.resolve(stream('a')));
  const events: ChannelIntentEvent[] = [];
  const session = new RecordingSession(async () => ({
    status: 'failed',
    error: 'UNSUPPORTED_CODEC',
    rollback: 'restored',
  }));
  const coordinator = createCoordinator(resolver, session, events);

  assert.equal(await coordinator.requestChannel({
    providerId: 'provider-1',
    channelId: 'a',
    previousChannelId: 'old',
  }), 'failed');

  const terminal = events[events.length - 1];
  assert.ok(terminal?.type === 'FAILED');
  assert.equal(terminal.error, 'UNSUPPORTED_CODEC');
  assert.equal(terminal.rollback, 'restored');
});
