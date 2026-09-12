import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, ProviderRecord } from '../src/domain/models.js';
import {
  LiveTvController,
  type ChannelIntentPort,
} from '../src/live-tv/live-tv-controller.js';

class RecordingIntent implements ChannelIntentPort {
  readonly requests: Array<{
    providerId: string;
    channelId: string;
    previousChannelId: string | null;
  }> = [];

  async requestChannel(input: {
    providerId: string;
    channelId: string;
    previousChannelId: string | null;
  }): Promise<'playing'> {
    this.requests.push(input);
    return 'playing';
  }
}

function provider(): ProviderRecord {
  return {
    id: 'p1',
    kind: 'xtream',
    name: 'Provider 1',
    createdAtMs: 1,
    lastSuccessfulSyncAtMs: null,
  };
}

function channel(id: string, number: number): Channel {
  return {
    providerId: 'p1',
    id,
    name: id,
    categoryId: null,
    logoUrl: null,
    number,
  };
}

void test('M7 PLAY CH- and CH+ each emit the expected logical playback intent', async () => {
  const intent = new RecordingIntent();
  const controller = new LiveTvController({
    intent,
    platform: {
      capabilities: () => ({
        tizen: true,
        optionsKey: true,
        channelKeys: true,
        numericKeys: true,
      }),
      registerOptionalKeys() {},
      exitApp() {},
    },
    view: { render() {} },
  });

  controller.enter({
    provider: provider(),
    categories: [],
    channels: [channel('c1', 1), channel('c2', 2), channel('c3', 3)],
  });

  controller.openChannel('c2');
  assert.equal(intent.requests.length, 0, 'highlight alone must remain inert');

  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.equal(intent.requests.at(-1)?.channelId, 'c2');
  controller.handleIntentEvent({
    type: 'PLAYING',
    intent: { id: 1, channelId: 'c2', previousChannelId: null },
    engine: 'shaka',
  });

  await controller.handleInput({ type: 'ACTION', action: 'CHANNEL_DOWN' });
  assert.equal(intent.requests.at(-1)?.channelId, 'c3', 'CH- must move to the next logical channel');
  controller.handleIntentEvent({
    type: 'PLAYING',
    intent: { id: 2, channelId: 'c3', previousChannelId: 'c2' },
    engine: 'shaka',
  });

  await controller.handleInput({ type: 'ACTION', action: 'CHANNEL_UP' });
  assert.equal(intent.requests.at(-1)?.channelId, 'c2', 'CH+ must move to the previous logical channel');
});
