import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import type { Channel, EpgProgram, ProviderRecord } from '../src/domain/models.js';
import type { EpgSourceProgram, EpgWindow } from '../src/epg/contracts.js';
import { StructuredEpgProgramRepository } from '../src/epg/structured-epg-program-repository.js';
import type { ProviderAdapter, ProviderAdapterFactory, ProviderProfile } from '../src/providers/contracts.js';
import { ProviderEpgService } from '../src/providers/provider-epg-service.js';
import { ProviderError } from '../src/providers/errors.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';

const window: EpgWindow = { startMs: 100_000, endMs: 300_000 };

type Loader = (window: EpgWindow) => Promise<readonly EpgSourceProgram[]>;

function provider(id: string): ProviderRecord {
  return { id, kind: 'xtream', name: id, createdAtMs: 1, lastSuccessfulSyncAtMs: null };
}

function channel(providerId: string, id: string, name = id): Channel {
  return { providerId, id, name, categoryId: null, logoUrl: null, number: null };
}

function profile(providerId: string): ProviderProfile {
  return {
    providerId,
    kind: 'xtream',
    accountName: null,
    expiresAtMs: null,
    maxConnections: null,
  };
}

function sourceProgram(
  channelId: string,
  overrides: Partial<EpgSourceProgram> = {},
): EpgSourceProgram {
  return {
    sourceChannel: { providerChannelId: channelId, tvgId: null, name: null },
    startMs: 120_000,
    endMs: 180_000,
    title: 'Bulletin',
    description: 'Summary',
    ...overrides,
  };
}

function cachedProgram(channelId: string, title: string): EpgProgram {
  return {
    channelId,
    startMs: 110_000,
    endMs: 190_000,
    title,
    description: null,
  };
}

function fakeAdapterFactory(loaders: Readonly<Record<string, Loader>>): ProviderAdapterFactory {
  return {
    create(record): ProviderAdapter {
      return {
        providerId: record.id,
        kind: record.kind,
        async getProfile() { return profile(record.id); },
        async listCategories() { return []; },
        async listChannels() { return []; },
        async resolveStream() { return { url: 'https://synthetic.invalid/stream' }; },
        epg: {
          describeChannels(channels: readonly Channel[]) {
            return channels
              .filter((item) => item.providerId === record.id)
              .map((item) => ({
                providerId: item.providerId,
                channelId: item.id,
                name: item.name,
                epgIds: [item.id],
              }));
          },
          createSource() {
            return {
              providerId: record.id,
              listPrograms: loaders[record.id] ?? (async () => []),
            };
          },
        },
      };
    },
  };
}

async function createHarness(options: {
  loaders?: Readonly<Record<string, Loader>>;
  p1Channels?: readonly Channel[];
  p2Channels?: readonly Channel[];
} = {}) {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const credentials = new MemoryCredentialStore();
  const repository = new StructuredEpgProgramRepository(store);
  const adapters = fakeAdapterFactory(options.loaders ?? {});

  await providers.saveProvider(provider('p1'));
  await providers.saveProvider(provider('p2'));
  await catalog.replaceChannels(
    'p1',
    options.p1Channels ?? [channel('p1', 'c1', 'News')],
  );
  await catalog.replaceChannels(
    'p2',
    options.p2Channels ?? [channel('p2', 'c1', 'Other News')],
  );
  await credentials.save('p1', {
    kind: 'xtream',
    serverUrl: 'https://synthetic.invalid',
    username: 'user-one',
    password: 'secret-one',
  });
  await credentials.save('p2', {
    kind: 'xtream',
    serverUrl: 'https://synthetic.invalid',
    username: 'user-two',
    password: 'secret-two',
  });

  const service = new ProviderEpgService({ providers, catalog, credentials, adapters, repository });
  return { service, repository, providers, catalog, credentials, adapters };
}

test('EPG-PI refresh maps normalizes and persists only the requested provider partition', async () => {
  const { service, repository } = await createHarness({
    loaders: {
      p1: async () => [sourceProgram('c1', {
        title: '  Bulletin  ',
        description: '  Summary  ',
      })],
    },
  });

  const result = await service.refresh('p1', window);

  assert.deepEqual(result, { providerId: 'p1', status: 'success', programCount: 1 });
  assert.deepEqual(await repository.listPrograms('p1', 'c1', window), [{
    channelId: 'c1',
    startMs: 120_000,
    endMs: 180_000,
    title: 'Bulletin',
    description: 'Summary',
  }]);
  assert.deepEqual(await repository.listPrograms('p2', 'c1', window), []);
});

test('EPG-PI source failure preserves usable EPG cache and leaves catalog and playback available', async () => {
  const { service, repository, catalog, providers, credentials, adapters } = await createHarness({
    loaders: {
      p1: async () => {
        throw new ProviderError('NETWORK', null, 'Provider EPG request failed.');
      },
    },
  });
  await repository.replaceWindow('p1', window, [cachedProgram('c1', 'Cached News')]);

  assert.deepEqual(await service.refresh('p1', window), {
    providerId: 'p1',
    status: 'failed',
    code: 'NETWORK',
  });
  assert.deepEqual(await repository.listPrograms('p1', 'c1', window), [
    cachedProgram('c1', 'Cached News'),
  ]);
  assert.deepEqual((await catalog.listChannels('p1')).map((item) => item.id), ['c1']);

  const record = await providers.getProvider('p1');
  const credential = await credentials.load('p1');
  assert.ok(record);
  assert.ok(credential);
  assert.deepEqual(await adapters.create(record, credential).resolveStream('c1'), {
    url: 'https://synthetic.invalid/stream',
  });
});

test('EPG-PI one-provider failure never changes another provider EPG partition', async () => {
  const { service, repository } = await createHarness({
    loaders: {
      p1: async () => { throw new ProviderError('SERVER', 500, 'Provider request failed.'); },
      p2: async () => [sourceProgram('c1', { title: 'Provider Two Update' })],
    },
  });
  await repository.replaceWindow('p1', window, [cachedProgram('c1', 'Provider One Cache')]);
  await repository.replaceWindow('p2', window, [cachedProgram('c1', 'Provider Two Cache')]);

  assert.equal((await service.refresh('p1', window)).status, 'failed');
  assert.deepEqual(await repository.listPrograms('p2', 'c1', window), [
    cachedProgram('c1', 'Provider Two Cache'),
  ]);

  assert.deepEqual(await service.refresh('p2', window), {
    providerId: 'p2',
    status: 'success',
    programCount: 1,
  });
  assert.equal((await repository.listPrograms('p1', 'c1', window))[0]?.title, 'Provider One Cache');
  assert.equal((await repository.listPrograms('p2', 'c1', window))[0]?.title, 'Provider Two Update');
});

test('EPG-PI partial malformed response updates valid channels without erasing another usable channel cache', async () => {
  const { service, repository } = await createHarness({
    p1Channels: [channel('p1', 'c1', 'News'), channel('p1', 'c2', 'Sports')],
    loaders: {
      p1: async () => [
        sourceProgram('c1', { title: 'Fresh News' }),
        sourceProgram('c2', { startMs: 200_000, endMs: 150_000, title: 'Malformed Sports' }),
      ],
    },
  });
  await repository.replaceWindow('p1', window, [
    cachedProgram('c1', 'Old News'),
    cachedProgram('c2', 'Cached Sports'),
  ]);

  assert.deepEqual(await service.refresh('p1', window), {
    providerId: 'p1',
    status: 'success',
    programCount: 1,
  });
  assert.equal((await repository.listPrograms('p1', 'c1', window))[0]?.title, 'Fresh News');
  assert.deepEqual(await repository.listPrograms('p1', 'c2', window), [
    cachedProgram('c2', 'Cached Sports'),
  ]);
});

test('EPG-PI fully malformed refresh fails without replacing the usable cache', async () => {
  const { service, repository } = await createHarness({
    loaders: {
      p1: async () => [sourceProgram('c1', { title: '   ' })],
    },
  });
  await repository.replaceWindow('p1', window, [cachedProgram('c1', 'Cached News')]);

  assert.deepEqual(await service.refresh('p1', window), {
    providerId: 'p1',
    status: 'failed',
    code: 'MALFORMED',
  });
  assert.deepEqual(await repository.listPrograms('p1', 'c1', window), [
    cachedProgram('c1', 'Cached News'),
  ]);
});

test('EPG-PI empty provider response preserves existing usable cache', async () => {
  const { service, repository } = await createHarness({ loaders: { p1: async () => [] } });
  await repository.replaceWindow('p1', window, [cachedProgram('c1', 'Cached News')]);

  assert.deepEqual(await service.refresh('p1', window), {
    providerId: 'p1',
    status: 'success',
    programCount: 0,
  });
  assert.deepEqual(await repository.listPrograms('p1', 'c1', window), [
    cachedProgram('c1', 'Cached News'),
  ]);
});

test('EPG-PI sanitizes unknown source failures to code-only results and preserves safe persisted data', async () => {
  const { service, repository } = await createHarness({
    loaders: {
      p1: async () => {
        throw new Error('https://synthetic.invalid/private?username=user-one&password=secret-one');
      },
    },
  });
  await repository.replaceWindow('p1', window, [cachedProgram('c1', 'Safe Cache')]);

  const result = await service.refresh('p1', window);
  const serialized = JSON.stringify({
    result,
    programs: await repository.listPrograms('p1', 'c1', window),
  });
  assert.deepEqual(result, { providerId: 'p1', status: 'failed', code: 'UNAVAILABLE' });
  assert.equal(serialized.includes('user-one'), false);
  assert.equal(serialized.includes('secret-one'), false);
  assert.equal(serialized.includes('/private'), false);
});

test('EPG-PI repeated background refresh coalesces the same provider window and stays deterministic', async () => {
  let calls = 0;
  let release: ((rows: readonly EpgSourceProgram[]) => void) | null = null;
  const pending = new Promise<readonly EpgSourceProgram[]>((resolve) => { release = resolve; });
  const { service, repository } = await createHarness({
    loaders: {
      p1: async () => {
        calls += 1;
        return pending;
      },
    },
  });

  const first = service.refreshInBackground('p1', window);
  const second = service.refreshInBackground('p1', window);
  assert.equal(first, second);
  assert.equal(calls, 0);
  await Promise.resolve();
  assert.equal(calls, 1);

  release?.([sourceProgram('c1')]);
  assert.deepEqual(await first, { providerId: 'p1', status: 'success', programCount: 1 });
  assert.deepEqual(await second, { providerId: 'p1', status: 'success', programCount: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(await repository.listPrograms('p1', 'c1', window), [{
    channelId: 'c1',
    startMs: 120_000,
    endMs: 180_000,
    title: 'Bulletin',
    description: 'Summary',
  }]);
});
