import test from 'node:test';
import assert from 'node:assert/strict';
import type { EpgProgram } from '../src/domain/models.js';
import type {
  EpgProgramRepository,
  EpgSourceProgram,
  EpgWindow,
} from '../src/epg/contracts.js';
import { normalizeEpgPrograms } from '../src/epg/normalize.js';
import { RepositoryEpgQuery } from '../src/epg/query-engine.js';
import { createHomeViewModel } from '../src/home/home-domain.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { searchCatalog } from '../src/search/search-core.js';
import type {
  StructuredStore,
  StructuredStoreName,
} from '../src/storage/contracts.js';
import {
  createM7LargeDataFixture,
  M7_CATEGORY_COUNT,
  M7_CHANNEL_COUNT,
  M7_EPG_START_MS,
  M7_NOW_MS,
  M7_PRIMARY_PROVIDER_ID,
  M7_PROGRAMS_PER_CHANNEL,
  M7_SECONDARY_PROVIDER_ID,
} from './fixtures/m7-large-data.js';

const fixture = createM7LargeDataFixture();

class CountingEpgRepository implements EpgProgramRepository {
  readonly calls: Array<{
    providerId: string;
    channelId: string;
    window: EpgWindow;
  }> = [];

  constructor(private readonly programs: readonly EpgProgram[]) {}

  async replaceWindow(): Promise<void> {}

  async listPrograms(
    providerId: string,
    channelId: string,
    window: EpgWindow,
  ): Promise<readonly EpgProgram[]> {
    this.calls.push({ providerId, channelId, window });
    return this.programs.filter((program) =>
      program.channelId === channelId
      && program.startMs < window.endMs
      && program.endMs > window.startMs,
    );
  }

  async deleteProvider(): Promise<void> {}
}

class CountingStructuredStore implements StructuredStore {
  getAllByIndexCalls = 0;

  constructor(private readonly channelRows: readonly unknown[]) {}

  async get<T>(): Promise<T | null> {
    return null;
  }

  async getAll<T>(): Promise<readonly T[]> {
    return [];
  }

  async getAllByIndex<T>(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
  ): Promise<readonly T[]> {
    this.getAllByIndexCalls += 1;
    assert.equal(store, 'channels');
    assert.equal(indexName, 'providerId');
    assert.equal(indexValue, M7_PRIMARY_PROVIDER_ID);
    return this.channelRows as readonly T[];
  }

  async put<T>(): Promise<void> {}

  async delete(): Promise<void> {}

  async replaceByIndex<T>(): Promise<void> {}

  async deleteByIndex(): Promise<void> {}
}

function countedArray<T>(items: readonly T[]): {
  readonly values: readonly T[];
  readonly readCount: () => number;
} {
  let reads = 0;
  const values = new Proxy([...items], {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^\d+$/.test(property)) {
        reads += 1;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return { values, readCount: () => reads };
}

function homeSummary(inputFixture = fixture) {
  const model = createHomeViewModel({
    providers: inputFixture.providers,
    activeProviderId: M7_PRIMARY_PROVIDER_ID,
    channels: inputFixture.allChannels,
    lastWatched: {
      providerId: M7_PRIMARY_PROVIDER_ID,
      channelId: 'channel-1199',
      lastPlayedAtMs: M7_NOW_MS - 1,
    },
    favorites: inputFixture.favorites,
    watchAggregates: inputFixture.watchAggregates,
    nowMs: M7_NOW_MS,
    watchScorePolicy: {
      durationWeightPerMinute: 1,
      openWeight: 5,
      recencyHalfLifeMs: 60_000,
    },
  });

  return {
    lastWatched: model.lastWatched?.channelId ?? null,
    favorites: model.favorites.items.map((item) => `${item.providerId}:${item.channelId}`),
    frequent: model.frequentlyWatched.items.map((item) => `${item.providerId}:${item.channelId}`),
  };
}

test('M7 PERF Search over 1,200 channels is deterministic, limited, and provider/category partitioned', () => {
  const query = 'kategori 007 şğüöç';
  const forward = searchCatalog({
    channels: fixture.allChannels,
    categories: fixture.allCategories,
    query,
    limit: 4,
  });
  const reversed = searchCatalog({
    channels: [...fixture.allChannels].reverse(),
    categories: [...fixture.allCategories].reverse(),
    query,
    limit: 4,
  });

  assert.deepEqual(
    forward.map((result) => result.channel.id),
    ['channel-7', 'channel-207', 'channel-407', 'channel-607'],
  );
  assert.deepEqual(
    reversed.map((result) => result.channel.id),
    forward.map((result) => result.channel.id),
  );
  assert.equal(forward.length, 4);
  assert.equal(forward.every((result) => result.channel.providerId === M7_PRIMARY_PROVIDER_ID), true);
  assert.equal(forward.some((result) => result.channel.providerId === M7_SECONDARY_PROVIDER_ID), false);
});

test('M7 PERF Turkish Search edges remain correct under the large input', () => {
  const cases = [
    ['istanbul', 'channel-0'],
    ['ışık', 'channel-1'],
    ['şeker', 'channel-2'],
    ['ğüneş', 'channel-3'],
    ['üsküdar', 'channel-4'],
    ['özel', 'channel-5'],
    ['çiçek', 'channel-6'],
  ] as const;

  for (const [query, expectedChannelId] of cases) {
    const results = searchCatalog({
      channels: fixture.allChannels,
      categories: fixture.allCategories,
      query,
      limit: 10,
    });
    assert.equal(results[0]?.channel.id, expectedChannelId, query);
    assert.equal(results[0]?.channel.providerId, M7_PRIMARY_PROVIDER_ID, query);
  }
});

test('M7 PERF RepositoryEpgQuery.getCurrent makes exactly one listPrograms call', async () => {
  const channelPrograms = fixture.epgPrograms.filter((program) => program.channelId === 'channel-0');
  const repository = new CountingEpgRepository(channelPrograms);
  const query = new RepositoryEpgQuery(repository, {
    lookBehindMs: 60 * 60 * 1_000,
    lookAheadMs: 24 * 60 * 60 * 1_000,
  });

  const current = await query.getCurrent(
    M7_PRIMARY_PROVIDER_ID,
    'channel-0',
    M7_EPG_START_MS + 15 * 60 * 1_000,
  );

  assert.equal(current?.title, 'Program channel-0 0');
  assert.equal(repository.calls.length, 1);
});

test('M7 PERF RepositoryEpgQuery.getNext makes no more than two listPrograms calls', async () => {
  const channelPrograms = fixture.epgPrograms.filter((program) => program.channelId === 'channel-0');
  const repository = new CountingEpgRepository(channelPrograms);
  const query = new RepositoryEpgQuery(repository, {
    lookBehindMs: 60 * 60 * 1_000,
    lookAheadMs: 24 * 60 * 60 * 1_000,
  });

  const next = await query.getNext(
    M7_PRIMARY_PROVIDER_ID,
    'channel-0',
    M7_EPG_START_MS + 15 * 60 * 1_000,
  );

  assert.equal(next?.title, 'Program channel-0 1');
  assert.equal(repository.calls.length <= 2, true);
  assert.equal(repository.calls.length, 2);
});

test('M7 PERF Home projection is provider-scoped and stable when large inputs are reversed', () => {
  const forward = homeSummary();
  const reversed = homeSummary({
    ...fixture,
    providers: [...fixture.providers].reverse(),
    allChannels: [...fixture.allChannels].reverse(),
    favorites: [...fixture.favorites].reverse(),
    watchAggregates: [...fixture.watchAggregates].reverse(),
  });

  assert.deepEqual(reversed, forward);
  assert.equal(forward.lastWatched, 'channel-1199');
  assert.equal(forward.favorites.every((key) => key.startsWith(`${M7_PRIMARY_PROVIDER_ID}:`)), true);
  assert.equal(forward.frequent.every((key) => key.startsWith(`${M7_PRIMARY_PROVIDER_ID}:`)), true);
  assert.equal(forward.favorites.some((key) => key.startsWith(`${M7_SECONDARY_PROVIDER_ID}:`)), false);
  assert.equal(forward.frequent.some((key) => key.startsWith(`${M7_SECONDARY_PROVIDER_ID}:`)), false);
});

test('M7 PERF large-data fixture is deterministic in size and contains no credentials or stream URLs', () => {
  assert.equal(fixture.primaryChannels.length, M7_CHANNEL_COUNT);
  assert.equal(fixture.primaryCategories.length, M7_CATEGORY_COUNT);
  assert.equal(fixture.epgPrograms.length, M7_CHANNEL_COUNT * M7_PROGRAMS_PER_CHANNEL);

  const serialized = JSON.stringify(fixture);
  assert.equal(/https?:\/\//i.test(serialized), false);
  assert.equal(/password|credential|streamurl|token/i.test(serialized), false);
});

test('M7 PERF normalization reads each source row once and is stable under reversed input', () => {
  const sources: EpgSourceProgram[] = fixture.epgPrograms
    .filter((program) => program.channelId === 'channel-0')
    .map((program) => ({
      sourceChannel: {
        providerChannelId: 'channel-0',
        tvgId: null,
        name: null,
      },
      startMs: program.startMs,
      endMs: program.endMs,
      title: program.title,
      description: program.description,
    }));
  const forward = countedArray(sources);
  const reversed = countedArray([...sources].reverse());

  const normalizedForward = normalizeEpgPrograms('channel-0', forward.values);
  const normalizedReversed = normalizeEpgPrograms('channel-0', reversed.values);

  assert.equal(forward.readCount(), sources.length);
  assert.equal(reversed.readCount(), sources.length);
  assert.deepEqual(normalizedReversed, normalizedForward);
});

test('M7 PERF EPG query repository-call work is not multiplied by unrelated channels', async () => {
  const repository = new CountingEpgRepository(fixture.epgPrograms);
  const query = new RepositoryEpgQuery(repository, {
    lookBehindMs: 60 * 60 * 1_000,
    lookAheadMs: 24 * 60 * 60 * 1_000,
  });

  const current = await query.getCurrent(
    M7_PRIMARY_PROVIDER_ID,
    'channel-777',
    M7_EPG_START_MS + 15 * 60 * 1_000,
  );

  assert.equal(current?.channelId, 'channel-777');
  assert.equal(repository.calls.length, 1);
});

test('M7 PERF catalog listChannels performs one indexed full-provider read', async () => {
  const rows = fixture.primaryChannels.map((channel) => ({
    ...channel,
    key: `${channel.providerId}:${channel.id}`,
  }));
  const store = new CountingStructuredStore(rows);
  const repository = new StructuredCatalogRepository(store);

  const channels = await repository.listChannels(M7_PRIMARY_PROVIDER_ID);

  assert.equal(store.getAllByIndexCalls, 1);
  assert.equal(channels.length, M7_CHANNEL_COUNT);
  assert.equal(channels[0]?.providerId, M7_PRIMARY_PROVIDER_ID);
});

test('M7 PERF Search performs one category-index traversal and one channel traversal per call', () => {
  const categories = countedArray(fixture.allCategories);
  const channels = countedArray(fixture.allChannels);

  const results = searchCatalog({
    channels: channels.values,
    categories: categories.values,
    query: 'kategori 007 şğüöç',
    limit: 4,
  });

  assert.equal(results.length, 4);
  assert.equal(categories.readCount(), fixture.allCategories.length);
  assert.equal(channels.readCount(), fixture.allChannels.length);
});

test('M7 PERF Home performs one active-provider channel input traversal without repository I/O', () => {
  const channels = countedArray(fixture.allChannels);
  const model = createHomeViewModel({
    providers: fixture.providers,
    activeProviderId: M7_PRIMARY_PROVIDER_ID,
    channels: channels.values,
    lastWatched: null,
    favorites: fixture.favorites,
    watchAggregates: fixture.watchAggregates,
    nowMs: M7_NOW_MS,
    watchScorePolicy: {
      durationWeightPerMinute: 1,
      openWeight: 5,
      recencyHalfLifeMs: 60_000,
    },
  });

  assert.equal(model.liveTv.available, true);
  assert.equal(channels.readCount(), fixture.allChannels.length);
});
