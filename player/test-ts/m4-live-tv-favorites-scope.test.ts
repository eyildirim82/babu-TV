import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel } from '../src/domain/models.js';
import type { Platform, PlatformCapabilities } from '../src/platform/contracts.js';
import type { ProviderSnapshot } from '../src/providers/provider-core-service.js';
import {
  LiveTvController,
  type ChannelIntentPort,
  type LiveTvView,
  type LiveTvViewModel,
} from '../src/live-tv/live-tv-controller.js';
import {
  createLiveTvFeatureComposition,
  type LiveTvFeaturePorts,
} from '../src/live-tv/live-tv-feature-composition.js';

function channel(id: string): Channel {
  return {
    providerId: 'provider-1',
    id,
    name: `Channel ${id}`,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

function snapshot(): ProviderSnapshot {
  return {
    provider: {
      id: 'provider-1',
      kind: 'xtream',
      name: 'Provider 1',
      createdAtMs: 1,
      lastSuccessfulSyncAtMs: null,
    },
    categories: [],
    channels: [channel('a'), channel('b'), channel('c')],
  };
}

class FakePlatform implements Platform {
  capabilities(): PlatformCapabilities {
    return { tizen: false, optionsKey: true, channelKeys: true, numericKeys: false };
  }

  registerOptionalKeys(): void {}
  exitApp(): void {}
}

class RecordingIntent implements ChannelIntentPort {
  readonly requests: string[] = [];

  async requestChannel(input: { channelId: string }): Promise<'playing'> {
    this.requests.push(input.channelId);
    return 'playing';
  }
}

class RecordingView implements LiveTvView {
  readonly models: LiveTvViewModel[] = [];

  render(_state: ReturnType<LiveTvController['state']>, model: LiveTvViewModel): void {
    this.models.push(model);
  }
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

void test('M4-COMP exposes virtual:favorites as a real browsable Live TV scope without playback', async () => {
  const ports: LiveTvFeaturePorts = {
    epg: {
      async getCurrent() { return null; },
      async getNext() { return null; },
    },
    favorites: {
      async isFavorite(_providerId, channelId) { return channelId === 'b' || channelId === 'c'; },
      async toggle() { return false; },
      async reconcile() {
        return {
          available: [
            { providerId: 'provider-1', channelId: 'b', addedAtMs: 1 },
            { providerId: 'provider-1', channelId: 'c', addedAtMs: 2 },
          ],
          missing: [],
        };
      },
    },
    nowMs: () => 1_000,
  };

  const intent = new RecordingIntent();
  const view = new RecordingView();
  const controller = new LiveTvController({
    intent,
    platform: new FakePlatform(),
    view,
    features: createLiveTvFeatureComposition(ports),
  });

  controller.enter(snapshot());
  await nextTurn();
  await nextTurn();

  await controller.handleInput({ type: 'ACTION', action: 'LEFT' });
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });

  assert.deepEqual(controller.state().activeScope, { kind: 'favorites' });
  assert.equal(controller.state().highlightedChannelId, 'b');
  assert.deepEqual(view.models.at(-1)?.visibleChannels.map((item) => item.id), ['b', 'c']);
  assert.equal(view.models.at(-1)?.features?.favorites.categoryKey, 'virtual:favorites');

  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });

  assert.equal(controller.state().highlightedChannelId, 'c');
  assert.deepEqual(view.models.at(-1)?.visibleChannels.map((item) => item.id), ['b', 'c']);
  assert.deepEqual(intent.requests, []);
});
