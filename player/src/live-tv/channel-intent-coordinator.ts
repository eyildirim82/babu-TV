import type { ProviderId, ChannelId } from '../domain/models.js';
import type { PlaybackErrorCode, StreamRequest } from '../playback/contracts.js';
import { ProviderError } from '../providers/errors.js';
import type {
  ChannelIntentEvent,
  ChannelStreamResolver,
  PlaybackIntentState,
  PlayerSessionPort,
} from './contracts.js';

function mapProviderFailure(error: unknown): PlaybackErrorCode {
  if (!(error instanceof ProviderError)) return 'UNKNOWN';
  if (error.code === 'AUTH') return 'AUTH';
  if (error.code === 'NETWORK') return 'NETWORK';
  if (error.code === 'TIMEOUT') return 'TIMEOUT';
  if (error.code === 'NOT_FOUND') return 'STREAM_NOT_FOUND';
  return 'UNKNOWN';
}

export class ChannelIntentCoordinator {
  private nextIntentId = 0;
  private currentIntentId = 0;

  constructor(
    private readonly resolver: ChannelStreamResolver,
    private readonly session: PlayerSessionPort,
    private readonly emitEvent: (event: ChannelIntentEvent) => void = () => {},
  ) {}

  isCurrent(intentId: number): boolean {
    return intentId === this.currentIntentId;
  }

  async requestChannel(input: {
    providerId: ProviderId;
    channelId: ChannelId;
    previousChannelId: ChannelId | null;
  }): Promise<'playing' | 'failed' | 'stale'> {
    const intent: PlaybackIntentState = {
      id: ++this.nextIntentId,
      channelId: input.channelId,
      previousChannelId: input.previousChannelId,
    };
    this.currentIntentId = intent.id;
    this.emitEvent({ type: 'RESOLVING', intent });

    let initialRequest: StreamRequest;
    try {
      initialRequest = await this.resolver.resolve(input.providerId, input.channelId);
    } catch (error) {
      if (!this.isCurrent(intent.id)) return 'stale';
      this.emitEvent({
        type: 'FAILED',
        intent,
        error: mapProviderFailure(error),
        rollback: 'not-needed',
      });
      return 'failed';
    }

    if (!this.isCurrent(intent.id)) return 'stale';

    this.emitEvent({ type: 'PREPARING', intent });
    const result = await this.session.switchTo({
      intentId: intent.id,
      providerId: input.providerId,
      targetChannelId: intent.channelId,
      previousChannelId: intent.previousChannelId,
      initialRequest,
      reResolveTarget: () => this.resolver.resolve(input.providerId, intent.channelId),
      resolvePrevious: intent.previousChannelId === null
        ? null
        : () => this.resolver.resolve(input.providerId, intent.previousChannelId as ChannelId),
      isCurrent: () => this.isCurrent(intent.id),
      onRecovering: () => {
        if (this.isCurrent(intent.id)) {
          this.emitEvent({ type: 'RECOVERING', intent });
        }
      },
    });

    if (!this.isCurrent(intent.id)) return 'stale';

    if (result.status === 'playing') {
      this.emitEvent({
        type: 'PLAYING',
        intent,
        engine: result.engine,
      });
      return 'playing';
    }

    this.emitEvent({
      type: 'FAILED',
      intent,
      error: result.error,
      rollback: result.rollback,
    });
    return 'failed';
  }
}
