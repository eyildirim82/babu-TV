import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderRecord } from '../src/domain/models.js';
import type { Platform } from '../src/platform/contracts.js';
import type {
  PlaybackResult,
  PlaybackService,
  StreamRequest,
} from '../src/playback/contracts.js';
import type { ProviderCredential } from '../src/credentials/contracts.js';
import type {
  ProviderAdapter,
  ProviderAdapterFactory,
} from '../src/providers/contracts.js';
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
    providerId: 'provider-a',
    kind: 'm3u',
    async getProfile() {
      return {
        providerId: 'provider-a',
        kind: 'm3u',
        accountName: null,
        expiresAtMs: null,
        maxConnections: null,
      };
    },
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

  const providerFactory: ProviderAdapterFactory = {
    create(providerRecord: ProviderRecord, credential: ProviderCredential) {
      assert.equal(providerRecord.id, 'provider-a');
      assert.equal(credential.kind, 'm3u');
      return provider;
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
  const createdProvider = providerFactory.create({
    id: 'provider-a',
    kind: 'm3u',
    name: 'Demo',
    createdAtMs: 1_788_806_400_000,
    lastSuccessfulSyncAtMs: null,
  }, {
    kind: 'm3u',
    playlistUrl: 'https://example.com/demo.m3u',
  });
  assert.equal(createdProvider.providerId, 'provider-a');
  assert.equal((await createdProvider.getProfile()).providerId, 'provider-a');
  const request = await createdProvider.resolveStream('42');
  assert.equal((await playback.play(request)).ok, true);
  assert.deepEqual(await repository.listChannels('provider-a'), []);
});
