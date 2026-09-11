import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveTvController } from '../src/live-tv/live-tv-controller.js';

const snapshot = {
  provider: {
    id: 'p1',
    kind: 'xtream' as const,
    name: 'One',
    createdAtMs: 1,
    lastSuccessfulSyncAtMs: null,
  },
  categories: [],
  channels: [
    { providerId: 'p1', id: 'c1', name: 'One', categoryId: null, logoUrl: null, number: 1 },
    { providerId: 'p1', id: 'c2', name: 'Two', categoryId: null, logoUrl: null, number: 2 },
  ],
};

test('M5 Live TV application entry separates focus from explicit playback', async () => {
  const requests: Array<{ providerId: string; channelId: string; previousChannelId: string | null }> = [];
  const controller = new LiveTvController({
    intent: {
      async requestChannel(request) {
        requests.push(request);
        return 'playing';
      },
    },
    platform: {
      capabilities: () => ({
        tizen: false,
        optionsKey: false,
        channelKeys: false,
        numericKeys: false,
      }),
      registerOptionalKeys() {},
      exitApp() {},
    },
    view: { render() {} },
  });

  controller.enter(snapshot);

  controller.openScope({ kind: 'favorites' });
  assert.equal(controller.state().activeScope.kind, 'favorites');
  assert.equal(requests.length, 0);

  controller.openChannel('c2');
  assert.equal(controller.state().activeScope.kind, 'all');
  assert.equal(controller.state().highlightedChannelId, 'c2');
  assert.equal(requests.length, 0);

  await controller.playChannel('c2');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    providerId: 'p1',
    channelId: 'c2',
    previousChannelId: null,
  });

  controller.openChannel('missing');
  await controller.playChannel('missing');
  assert.equal(requests.length, 1);
});
