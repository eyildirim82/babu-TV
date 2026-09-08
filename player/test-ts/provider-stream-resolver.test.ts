import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderCredential } from '../src/credentials/contracts.js';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import type {
  Category,
  Channel,
  ChannelId,
  ProviderRecord,
} from '../src/domain/models.js';
import type { StreamRequest } from '../src/playback/contracts.js';
import type {
  ProviderAdapter,
  ProviderAdapterFactory,
  ProviderProfile,
} from '../src/providers/contracts.js';
import { ProviderError } from '../src/providers/errors.js';
import { MemoryProviderRepository } from '../src/repository/memory-provider-repository.js';
import { ProviderStreamResolver } from '../src/live-tv/provider-stream-resolver.js';

function record(id = 'provider-1'): ProviderRecord {
  return {
    id,
    kind: 'xtream',
    name: 'Demo Provider',
    createdAtMs: 1_788_806_400_000,
    lastSuccessfulSyncAtMs: null,
  };
}

const credential: ProviderCredential = {
  kind: 'xtream',
  serverUrl: 'https://provider.example.test',
  username: 'resolver-demo-user',
  password: 'resolver-demo-pass',
};

const streamRequest: StreamRequest = {
  url: 'https://stream.example.test/live/9',
  headers: { authorization: 'Bearer transient-stream-token' },
};

class RecordingFactory implements ProviderAdapterFactory {
  readonly calls: Array<{ provider: ProviderRecord; credential: ProviderCredential }> = [];
  readonly resolveCalls: ChannelId[] = [];

  create(provider: ProviderRecord, loadedCredential: ProviderCredential): ProviderAdapter {
    this.calls.push({ provider, credential: loadedCredential });
    return {
      providerId: provider.id,
      kind: provider.kind,
      async getProfile(): Promise<ProviderProfile> {
        return {
          providerId: provider.id,
          kind: provider.kind,
          accountName: null,
          expiresAtMs: null,
          maxConnections: null,
        };
      },
      async listCategories(): Promise<readonly Category[]> {
        return [];
      },
      async listChannels(): Promise<readonly Channel[]> {
        return [];
      },
      resolveStream: async (channelId: ChannelId): Promise<StreamRequest> => {
        this.resolveCalls.push(channelId);
        return streamRequest;
      },
    };
  }
}

void test('resolver loads provider and credential then delegates by channel id', async () => {
  const providers = new MemoryProviderRepository();
  const credentials = new MemoryCredentialStore();
  const factory = new RecordingFactory();
  await providers.saveProvider(record());
  await credentials.save('provider-1', credential);

  const resolver = new ProviderStreamResolver(providers, credentials, factory);
  const request = await resolver.resolve('provider-1', 'channel-9');

  assert.equal(factory.calls.length, 1);
  assert.equal(factory.calls[0]?.provider.id, 'provider-1');
  assert.equal(factory.calls[0]?.credential.kind, 'xtream');
  assert.deepEqual(factory.resolveCalls, ['channel-9']);
  assert.equal(request, streamRequest);
  assert.equal(request.url, 'https://stream.example.test/live/9');
});

void test('resolver reports missing provider with a sanitized NOT_FOUND error', async () => {
  const providers = new MemoryProviderRepository();
  const credentials = new MemoryCredentialStore();
  const factory = new RecordingFactory();
  await credentials.save('missing-provider', credential);
  const resolver = new ProviderStreamResolver(providers, credentials, factory);

  await assert.rejects(
    resolver.resolve('missing-provider', 'channel-9'),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, 'NOT_FOUND');
      assert.equal(error.status, null);
      assert.equal(error.message, 'Provider configuration was not found.');
      const serialized = String(error) + JSON.stringify(error);
      assert.equal(serialized.includes('resolver-demo-user'), false);
      assert.equal(serialized.includes('resolver-demo-pass'), false);
      assert.equal(serialized.includes('provider.example.test'), false);
      return true;
    },
  );
  assert.equal(factory.calls.length, 0);
});

void test('resolver reports missing credential with a sanitized UNAVAILABLE error', async () => {
  const providers = new MemoryProviderRepository();
  const credentials = new MemoryCredentialStore();
  const factory = new RecordingFactory();
  await providers.saveProvider(record());
  const resolver = new ProviderStreamResolver(providers, credentials, factory);

  await assert.rejects(
    resolver.resolve('provider-1', 'channel-9'),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, 'UNAVAILABLE');
      assert.equal(error.status, null);
      assert.equal(error.message, 'Provider credential is unavailable.');
      const serialized = String(error) + JSON.stringify(error);
      assert.equal(serialized.includes('channel-9'), false);
      assert.equal(serialized.includes(streamRequest.url), false);
      assert.equal(serialized.includes('transient-stream-token'), false);
      return true;
    },
  );
  assert.equal(factory.calls.length, 0);
});
