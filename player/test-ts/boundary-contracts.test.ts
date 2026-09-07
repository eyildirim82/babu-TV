import test from 'node:test';
import assert from 'node:assert/strict';
import type { Platform } from '../src/platform/contracts.js';
import type {
  PlaybackResult,
  PlaybackService,
  StreamRequest,
} from '../src/playback/contracts.js';
import type { ProviderAdapter } from '../src/providers/contracts.js';
import type { ChannelRepository } from '../src/repository/contracts.js';

void test('boundary contracts support deterministic test fakes', async () => {
  const platform: Platform = {
    capabilities: () => ({
      tizen: false,
      optionsKey: false,
      channelKeys: false,
      numericKeys: true,
    }),
    registerOptionalKeys: () => {},
    exitApp: () => {},
  };

  const playback: PlaybackService = {
    async play(request: StreamRequest): Promise<PlaybackResult> {
      return {
        ok: request.url === 'https://example.com/live.m3u8',
        engine: 'shaka',
        error: null,
      };
    },
    stop: () => {},
  };

  const provider: ProviderAdapter = {
    kind: 'm3u',
    async listCategories() {
      return [];
    },
    async listChannels() {
      return [];
    },
    async resolveStream() {
      return { url: 'https://example.com/live.m3u8' };
    },
  };

  const repository: ChannelRepository = {
    async replaceProviderChannels() {},
    async listChannels() {
      return [];
    },
    async getChannel() {
      return null;
    },
  };

  assert.equal(platform.capabilities().numericKeys, true);
  const request = await provider.resolveStream('provider-a', '42');
  assert.equal((await playback.play(request)).ok, true);
  assert.deepEqual(await repository.listChannels('provider-a'), []);
});
