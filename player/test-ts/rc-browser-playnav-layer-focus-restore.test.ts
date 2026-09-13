import assert from 'node:assert/strict';
import test from 'node:test';
import type { Category, Channel } from '../src/domain/models.js';
import type { Platform, PlatformCapabilities } from '../src/platform/contracts.js';
import type { ProviderSnapshot } from '../src/providers/provider-core-service.js';
import {
  LiveTvController,
  type ChannelIntentPort,
  type LiveTvView,
  type LiveTvViewModel,
} from '../src/live-tv/live-tv-controller.js';
import { createLiveTvFeatureComposition } from '../src/live-tv/live-tv-feature-composition.js';

function channel(id: string): Channel {
  return {
    providerId: 'provider-a',
    id,
    name: id,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

function snapshot(): ProviderSnapshot {
  return {
    provider: {
      id: 'provider-a',
      kind: 'xtream',
      name: 'Provider A',
      createdAtMs: 1,
      lastSuccessfulSyncAtMs: null,
    },
    categories: [] as Category[],
    channels: [channel('one')],
  };
}

class FakeIntent implements ChannelIntentPort {
  async requestChannel(): Promise<'playing'> {
    return 'playing';
  }
}

class FakePlatform implements Platform {
  exits = 0;

  capabilities(): PlatformCapabilities {
    return { tizen: true, optionsKey: true, channelKeys: true, numericKeys: true };
  }

  registerOptionalKeys(): void {}

  exitApp(): void {
    this.exits += 1;
  }
}

class RecordingView implements LiveTvView {
  latest: { state: ReturnType<LiveTvController['state']>; model: LiveTvViewModel } | null = null;

  render(state: ReturnType<LiveTvController['state']>, model: LiveTvViewModel): void {
    this.latest = { state: { ...state }, model };
  }
}

void test('Back from program-info preserves actions focus; Back from actions restores channel zone before overlay close', async () => {
  const selected = channel('one');
  const features = createLiveTvFeatureComposition({
    epg: {
      async getCurrent() {
        return {
          channelId: selected.id,
          startMs: 0,
          endMs: 100,
          title: 'Program',
          description: 'Detail',
        };
      },
      async getNext() { return null; },
    },
    favorites: {
      async isFavorite() { return false; },
      async toggle() { return false; },
      async reconcile() { return { available: [], missing: [] }; },
    },
    nowMs: () => 50,
  });
  const platform = new FakePlatform();
  const view = new RecordingView();
  const controller = new LiveTvController({
    intent: new FakeIntent(),
    platform,
    view,
    features,
  });

  controller.enter(snapshot());
  await new Promise((resolve) => setImmediate(resolve));

  await controller.handleInput({ type: 'ACTION', action: 'RIGHT' });
  assert.equal(controller.state().overlayZone, 'ACTIONS');
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.equal(view.latest?.model.features?.layer, 'actions');

  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  await controller.handleInput({ type: 'ACTION', action: 'DOWN' });
  assert.equal(view.latest?.model.features?.actions?.state.focusedActionId, 'PROGRAM_INFO');
  await controller.handleInput({ type: 'ACTION', action: 'SELECT' });
  assert.equal(view.latest?.model.features?.layer, 'program-info');

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(view.latest?.model.features?.layer, 'actions');
  assert.equal(controller.state().overlayZone, 'ACTIONS', 'program-info Back returns to actions focus');

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(view.latest?.model.features?.layer, 'none');
  assert.equal(controller.state().overlayZone, 'CHANNEL', 'actions Back restores exactly one channel focus zone');
  assert.equal(controller.state().overlayOpen, true);

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(controller.state().overlayOpen, false, 'next Back closes the overlay');
  assert.equal(platform.exits, 0);

  await controller.handleInput({ type: 'ACTION', action: 'BACK' });
  assert.equal(platform.exits, 1, 'next Back follows existing owner semantics');
});
