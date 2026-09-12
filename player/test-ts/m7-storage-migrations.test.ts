import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  Category,
  Channel,
  EpgProgram,
  ProviderRecord,
} from '../src/domain/models.js';
import { StructuredEpgProgramRepository } from '../src/epg/structured-epg-program-repository.js';
import { StructuredCatalogRepository } from '../src/repository/structured-catalog-repository.js';
import { StructuredFavoriteRepository } from '../src/repository/structured-favorite-repository.js';
import { StructuredProviderRepository } from '../src/repository/structured-provider-repository.js';
import { StructuredWatchStateRepository } from '../src/repository/structured-watch-state-repository.js';
import type { StructuredStore } from '../src/storage/contracts.js';
import {
  IndexedDbStructuredStore,
  StructuredStorageError,
} from '../src/storage/indexeddb-structured-store.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';

type FlatRecord = Record<string, unknown>;
type IndexDefinition = { keyPath: string | readonly string[]; unique: boolean };
type MutableRequest<T> = {
  result: T;
  error: DOMException | null;
  onsuccess: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
  onerror: ((this: IDBRequest<T>, ev: Event) => unknown) | null;
};

const WINDOW = { startMs: 0, endMs: 1_000 } as const;

function provider(id: string, name = id): ProviderRecord {
  return {
    id,
    kind: 'xtream',
    name,
    createdAtMs: 1_788_806_400_000,
    lastSuccessfulSyncAtMs: null,
  };
}

function category(providerId: string, id = 'shared', name = `${providerId} category`): Category {
  return { providerId, id, name };
}

function channel(providerId: string, id = 'shared', name = `${providerId} channel`): Channel {
  return {
    providerId,
    id,
    name,
    categoryId: 'shared',
    logoUrl: null,
    number: null,
  };
}

function program(channelId: string, title: string, startMs = 100, endMs = 200): EpgProgram {
  return {
    channelId,
    startMs,
    endMs,
    title,
    description: null,
  };
}

function favoriteKey(providerId: string, channelId: string): string {
  return `user.favorite:${JSON.stringify([providerId, channelId])}`;
}

function lastWatchedKey(providerId: string): string {
  return `user.watch.last:${JSON.stringify(providerId)}`;
}

function aggregateKey(providerId: string, channelId: string): string {
  return `user.watch.aggregate:${JSON.stringify([providerId, channelId])}`;
}

function providerChannelKey(providerId: string, channelId: string): string {
  return JSON.stringify([providerId, channelId]);
}

class RecordingObjectStore {
  readonly data = new Map<IDBValidKey, unknown>();
  readonly indexes = new Map<string, IndexDefinition>();

  constructor(readonly keyPath = 'key') {}

  createIndex(name: string, keyPath: string | readonly string[], options?: IDBIndexParameters): IDBIndex {
    this.indexes.set(name, { keyPath, unique: options?.unique ?? false });
    return {} as IDBIndex;
  }
}

class RecordingTransaction {
  oncomplete: ((this: IDBTransaction, ev: Event) => unknown) | null = null;
  onerror: ((this: IDBTransaction, ev: Event) => unknown) | null = null;
  onabort: ((this: IDBTransaction, ev: Event) => unknown) | null = null;
  private pending = 0;
  private completionQueued = false;
  private aborted = false;

  constructor(private readonly database: RecordingDatabase) {}

  objectStore(name: string): IDBObjectStore {
    const schema = this.database.stores.get(name);
    if (!schema) throw new Error(`Missing test object store: ${name}`);
    return new RuntimeObjectStore(schema, this) as unknown as IDBObjectStore;
  }

  beginRequest(): void {
    this.pending += 1;
    this.completionQueued = false;
  }

  endRequest(): void {
    this.pending -= 1;
    this.queueCompletion();
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    queueMicrotask(() => this.onabort?.call(this as unknown as IDBTransaction, new Event('abort')));
  }

  private queueCompletion(): void {
    if (this.pending !== 0 || this.completionQueued || this.aborted) return;
    this.completionQueued = true;
    queueMicrotask(() => {
      if (this.pending !== 0 || this.aborted) {
        this.completionQueued = false;
        return;
      }
      this.oncomplete?.call(this as unknown as IDBTransaction, new Event('complete'));
    });
  }
}

function recordOf(value: unknown): FlatRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid test record.');
  }
  return value as FlatRecord;
}

function request<T>(transaction: RecordingTransaction, operation: () => T): IDBRequest<T> {
  transaction.beginRequest();
  const state: MutableRequest<T> = {
    result: undefined as T,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  const value = state as unknown as IDBRequest<T>;
  queueMicrotask(() => {
    try {
      state.result = operation();
      state.onsuccess?.call(value, new Event('success'));
    } catch {
      state.onerror?.call(value, new Event('error'));
    } finally {
      transaction.endRequest();
    }
  });
  return value;
}

function cursorRequest(
  transaction: RecordingTransaction,
  entries: readonly [IDBValidKey, unknown][],
  withValue: boolean,
): IDBRequest<IDBCursorWithValue | null> {
  transaction.beginRequest();
  let index = 0;
  const state: MutableRequest<IDBCursorWithValue | null> = {
    result: null,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  const value = state as unknown as IDBRequest<IDBCursorWithValue | null>;

  const emit = () => {
    queueMicrotask(() => {
      const entry = entries[index];
      if (!entry) {
        state.result = null;
        state.onsuccess?.call(value, new Event('success'));
        transaction.endRequest();
        return;
      }
      const [primaryKey, storedValue] = entry;
      state.result = {
        primaryKey,
        value: withValue ? storedValue : undefined,
        continue: () => {
          index += 1;
          emit();
        },
      } as unknown as IDBCursorWithValue;
      state.onsuccess?.call(value, new Event('success'));
    });
  };

  emit();
  return value;
}

class RuntimeIndex {
  constructor(
    private readonly schema: RecordingObjectStore,
    private readonly definition: IndexDefinition,
    private readonly transaction: RecordingTransaction,
  ) {}

  private entries(indexValue: IDBValidKey): readonly [IDBValidKey, unknown][] {
    if (typeof this.definition.keyPath !== 'string') throw new Error('Compound test indexes are unsupported.');
    return [...this.schema.data.entries()].filter(([, value]) =>
      recordOf(value)[this.definition.keyPath as string] === indexValue,
    );
  }

  openCursor(indexValue: IDBValidKey): IDBRequest<IDBCursorWithValue | null> {
    return cursorRequest(this.transaction, this.entries(indexValue), true);
  }

  openKeyCursor(indexValue: IDBValidKey): IDBRequest<IDBCursor | null> {
    return cursorRequest(this.transaction, this.entries(indexValue), false) as unknown as IDBRequest<IDBCursor | null>;
  }
}

class RuntimeObjectStore {
  constructor(
    private readonly schema: RecordingObjectStore,
    private readonly transaction: RecordingTransaction,
  ) {}

  get(key: IDBValidKey): IDBRequest<unknown> {
    return request(this.transaction, () => this.schema.data.get(key));
  }

  put(value: unknown): IDBRequest<IDBValidKey> {
    return request<IDBValidKey>(this.transaction, () => {
      const key = recordOf(value)[this.schema.keyPath];
      if (typeof key !== 'string' && typeof key !== 'number') throw new Error('Invalid test key.');
      this.schema.data.set(key, value);
      return key;
    });
  }

  delete(key: IDBValidKey): IDBRequest<undefined> {
    return request(this.transaction, () => {
      this.schema.data.delete(key);
      return undefined;
    });
  }

  openCursor(): IDBRequest<IDBCursorWithValue | null> {
    return cursorRequest(this.transaction, [...this.schema.data.entries()], true);
  }

  index(name: string): IDBIndex {
    const definition = this.schema.indexes.get(name);
    if (!definition) throw new Error(`Missing test index: ${name}`);
    return new RuntimeIndex(this.schema, definition, this.transaction) as unknown as IDBIndex;
  }
}

class RecordingDatabase {
  readonly stores = new Map<string, RecordingObjectStore>();
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  } as DOMStringList;

  constructor(existingStores: readonly string[] = []) {
    for (const name of existingStores) {
      this.stores.set(name, new RecordingObjectStore(name === 'providers' ? 'id' : 'key'));
    }
  }

  createObjectStore(name: string, options?: IDBObjectStoreParameters): IDBObjectStore {
    const keyPath = typeof options?.keyPath === 'string' ? options.keyPath : 'key';
    const store = new RecordingObjectStore(keyPath);
    this.stores.set(name, store);
    return store as unknown as IDBObjectStore;
  }

  transaction(): IDBTransaction {
    return new RecordingTransaction(this) as unknown as IDBTransaction;
  }
}

class RecordingFactory {
  readonly database: RecordingDatabase;
  openedName: string | null = null;
  openedVersion: number | null = null;
  openCount = 0;

  constructor(
    existingStores: readonly string[] = [],
    private readonly upgradeNeeded = true,
  ) {
    this.database = new RecordingDatabase(existingStores);
  }

  open(name: string, version?: number): IDBOpenDBRequest {
    this.openCount += 1;
    this.openedName = name;
    this.openedVersion = version ?? null;
    const openRequest = {
      result: this.database as unknown as IDBDatabase,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest;

    queueMicrotask(() => {
      if (this.upgradeNeeded) {
        openRequest.onupgradeneeded?.call(openRequest, new Event('upgradeneeded') as IDBVersionChangeEvent);
      }
      openRequest.onsuccess?.call(openRequest, new Event('success'));
    });
    return openRequest;
  }
}

class FailingFactory {
  open(): IDBOpenDBRequest {
    const openRequest = {
      result: undefined,
      error: new DOMException('native details that must not escape'),
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest;
    queueMicrotask(() => openRequest.onerror?.call(openRequest, new Event('error')));
    return openRequest;
  }
}

function configureV1Indexes(factory: RecordingFactory): void {
  factory.database.stores.get('categories')?.indexes.set('providerId', {
    keyPath: 'providerId',
    unique: false,
  });
  factory.database.stores.get('channels')?.indexes.set('providerId', {
    keyPath: 'providerId',
    unique: false,
  });
}

function configureV2Indexes(factory: RecordingFactory): void {
  configureV1Indexes(factory);
  factory.database.stores.get('epg_programs')?.indexes.set('providerId', {
    keyPath: 'providerId',
    unique: false,
  });
  factory.database.stores.get('epg_programs')?.indexes.set('providerChannelKey', {
    keyPath: 'providerChannelKey',
    unique: false,
  });
}

async function seedDurableUserState(store: StructuredStore, providerId: string): Promise<void> {
  const favorites = new StructuredFavoriteRepository(store);
  const watch = new StructuredWatchStateRepository(store);
  await favorites.put({ providerId, channelId: 'shared', addedAtMs: providerId === 'provider-a' ? 10 : 20 });
  await watch.setLastWatched({
    providerId,
    channelId: 'shared',
    lastPlayedAtMs: providerId === 'provider-a' ? 30 : 40,
  });
  await watch.putAggregate({
    providerId,
    channelId: 'shared',
    meaningfulWatchMs: providerId === 'provider-a' ? 30_000 : 60_000,
    meaningfulOpenCount: providerId === 'provider-a' ? 1 : 2,
    lastMeaningfulWatchAtMs: providerId === 'provider-a' ? 50 : 60,
  });
}

void test('M7 MIG replacement keeps provider/catalog/EPG/Favorites/watch partitions isolated with colliding channel ids', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const epg = new StructuredEpgProgramRepository(store);
  const favorites = new StructuredFavoriteRepository(store);
  const watch = new StructuredWatchStateRepository(store);

  await providers.saveProvider(provider('provider-a', 'A old'));
  await providers.saveProvider(provider('provider-b', 'B stable'));
  await catalog.replaceCategories('provider-a', [category('provider-a')]);
  await catalog.replaceCategories('provider-b', [category('provider-b')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'shared', 'A old')]);
  await catalog.replaceChannels('provider-b', [channel('provider-b', 'shared', 'B stable')]);
  await epg.replaceWindow('provider-a', WINDOW, [program('shared', 'A old')]);
  await epg.replaceWindow('provider-b', WINDOW, [program('shared', 'B stable')]);
  await seedDurableUserState(store, 'provider-a');
  await seedDurableUserState(store, 'provider-b');

  await providers.saveProvider(provider('provider-a', 'A refreshed'));
  await catalog.replaceCategories('provider-a', [category('provider-a', 'shared', 'A refreshed')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'shared', 'A refreshed')]);
  await epg.replaceWindow('provider-a', WINDOW, [program('shared', 'A refreshed', 300, 400)]);

  assert.equal((await providers.getProvider('provider-a'))?.name, 'A refreshed');
  assert.equal((await providers.getProvider('provider-b'))?.name, 'B stable');
  assert.deepEqual(await catalog.listChannels('provider-a'), [channel('provider-a', 'shared', 'A refreshed')]);
  assert.deepEqual(await catalog.listChannels('provider-b'), [channel('provider-b', 'shared', 'B stable')]);
  assert.deepEqual(await epg.listPrograms('provider-a', 'shared', WINDOW), [program('shared', 'A refreshed', 300, 400)]);
  assert.deepEqual(await epg.listPrograms('provider-b', 'shared', WINDOW), [program('shared', 'B stable')]);
  assert.equal(await favorites.has('provider-a', 'shared'), true);
  assert.equal(await favorites.has('provider-b', 'shared'), true);
  assert.equal((await watch.getLastWatched('provider-a'))?.channelId, 'shared');
  assert.equal((await watch.getLastWatched('provider-b'))?.channelId, 'shared');
});

void test('M7 MIG explicit provider delete remains scoped after repository reopen', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const epg = new StructuredEpgProgramRepository(store);
  const favorites = new StructuredFavoriteRepository(store);
  const watch = new StructuredWatchStateRepository(store);

  for (const providerId of ['provider-a', 'provider-b']) {
    await providers.saveProvider(provider(providerId));
    await catalog.replaceCategories(providerId, [category(providerId)]);
    await catalog.replaceChannels(providerId, [channel(providerId)]);
    await epg.replaceWindow(providerId, WINDOW, [program('shared', `${providerId} program`)]);
    await seedDurableUserState(store, providerId);
  }
  await providers.setActiveProviderId('provider-b');

  await providers.removeProvider('provider-a');
  await catalog.removeProviderCatalog('provider-a');
  await epg.deleteProvider('provider-a');
  await favorites.deleteProvider('provider-a');
  await watch.deleteProvider('provider-a');

  const reopenedProviders = new StructuredProviderRepository(store);
  const reopenedCatalog = new StructuredCatalogRepository(store);
  const reopenedEpg = new StructuredEpgProgramRepository(store);
  const reopenedFavorites = new StructuredFavoriteRepository(store);
  const reopenedWatch = new StructuredWatchStateRepository(store);

  assert.equal(await reopenedProviders.getProvider('provider-a'), null);
  assert.deepEqual(await reopenedCatalog.listChannels('provider-a'), []);
  assert.deepEqual(await reopenedEpg.listPrograms('provider-a', 'shared', WINDOW), []);
  assert.equal(await reopenedFavorites.has('provider-a', 'shared'), false);
  assert.equal(await reopenedWatch.getLastWatched('provider-a'), null);

  assert.equal((await reopenedProviders.getProvider('provider-b'))?.id, 'provider-b');
  assert.equal(await reopenedProviders.getActiveProviderId(), 'provider-b');
  assert.deepEqual(await reopenedCatalog.listChannels('provider-b'), [channel('provider-b')]);
  assert.deepEqual(await reopenedEpg.listPrograms('provider-b', 'shared', WINDOW), [program('shared', 'provider-b program')]);
  assert.equal(await reopenedFavorites.has('provider-b', 'shared'), true);
  assert.equal((await reopenedWatch.getLastWatched('provider-b'))?.channelId, 'shared');
});

void test('M7 MIG structured persistence never promotes credential-bearing fields into ordinary storage', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const epg = new StructuredEpgProgramRepository(store);
  const favorites = new StructuredFavoriteRepository(store);
  const watch = new StructuredWatchStateRepository(store);

  await providers.saveProvider({
    ...provider('provider-a'),
    serverUrl: 'https://demo-user:demo-pass@example.com',
    username: 'demo-user',
    password: 'demo-pass',
    token: 'token-123',
  } as ProviderRecord);
  await catalog.replaceCategories('provider-a', [{
    ...category('provider-a'),
    password: 'demo-pass',
  } as Category]);
  await catalog.replaceChannels('provider-a', [{
    ...channel('provider-a'),
    playlistUrl: 'https://example.com/list.m3u?password=demo-pass',
    streamUrl: 'https://demo-user:demo-pass@example.com/live/shared.ts',
    token: 'token-123',
  } as Channel]);
  await epg.replaceWindow('provider-a', WINDOW, [{
    ...program('shared', 'Program'),
    token: 'token-123',
  } as EpgProgram]);
  await favorites.put({
    providerId: 'provider-a',
    channelId: 'shared',
    addedAtMs: 10,
    password: 'demo-pass',
  } as never);
  await watch.setLastWatched({
    providerId: 'provider-a',
    channelId: 'shared',
    lastPlayedAtMs: 20,
    token: 'token-123',
  } as never);

  const serialized = JSON.stringify([
    ...(await store.getAll<unknown>('providers')),
    ...(await store.getAll<unknown>('categories')),
    ...(await store.getAll<unknown>('channels')),
    ...(await store.getAll<unknown>('epg_programs')),
    ...(await store.getAll<unknown>('app_state')),
  ]);

  for (const secret of ['demo-user', 'demo-pass', 'token-123', 'serverUrl', 'playlistUrl', 'streamUrl']) {
    assert.equal(serialized.includes(secret), false, `ordinary storage leaked ${secret}`);
  }
});

void test('M7 MIG v1 to v2 upgrade preserves durable provider/user state and creates only the derived EPG schema', async () => {
  const factory = new RecordingFactory(['providers', 'categories', 'channels', 'app_state']);
  configureV1Indexes(factory);

  const providersStore = factory.database.stores.get('providers')!;
  providersStore.data.set('provider-a', provider('provider-a', 'A'));
  providersStore.data.set('provider-b', provider('provider-b', 'B'));
  factory.database.stores.get('categories')!.data.set('provider-a:shared', {
    key: 'provider-a:shared',
    ...category('provider-a'),
  });
  factory.database.stores.get('categories')!.data.set('provider-b:shared', {
    key: 'provider-b:shared',
    ...category('provider-b'),
  });
  factory.database.stores.get('channels')!.data.set('provider-a:shared', {
    key: 'provider-a:shared',
    ...channel('provider-a'),
  });
  factory.database.stores.get('channels')!.data.set('provider-b:shared', {
    key: 'provider-b:shared',
    ...channel('provider-b'),
  });

  const appState = factory.database.stores.get('app_state')!;
  appState.data.set('activeProviderId', { key: 'activeProviderId', value: 'provider-b' });
  appState.data.set(favoriteKey('provider-a', 'shared'), {
    key: favoriteKey('provider-a', 'shared'),
    kind: 'user.favorite.v1',
    providerId: 'provider-a',
    channelId: 'shared',
    addedAtMs: 10,
  });
  appState.data.set(favoriteKey('provider-b', 'shared'), {
    key: favoriteKey('provider-b', 'shared'),
    kind: 'user.favorite.v1',
    providerId: 'provider-b',
    channelId: 'shared',
    addedAtMs: 20,
  });
  appState.data.set(lastWatchedKey('provider-a'), {
    key: lastWatchedKey('provider-a'),
    kind: 'user.watch.last.v1',
    providerId: 'provider-a',
    channelId: 'shared',
    lastPlayedAtMs: 30,
  });
  appState.data.set(lastWatchedKey('provider-b'), {
    key: lastWatchedKey('provider-b'),
    kind: 'user.watch.last.v1',
    providerId: 'provider-b',
    channelId: 'shared',
    lastPlayedAtMs: 40,
  });
  appState.data.set('legacy-setting', { key: 'legacy-setting', value: { keep: true } });

  const store = new IndexedDbStructuredStore(factory as unknown as IDBFactory);
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const favorites = new StructuredFavoriteRepository(store);
  const watch = new StructuredWatchStateRepository(store);

  assert.deepEqual((await providers.listProviders()).map((item) => item.id), ['provider-a', 'provider-b']);
  assert.equal(await providers.getActiveProviderId(), 'provider-b');
  assert.deepEqual(await catalog.listChannels('provider-a'), [channel('provider-a')]);
  assert.deepEqual(await catalog.listChannels('provider-b'), [channel('provider-b')]);
  assert.equal(await favorites.has('provider-a', 'shared'), true);
  assert.equal(await favorites.has('provider-b', 'shared'), true);
  assert.equal((await watch.getLastWatched('provider-a'))?.channelId, 'shared');
  assert.equal((await watch.getLastWatched('provider-b'))?.channelId, 'shared');
  assert.deepEqual(await store.get('app_state', 'legacy-setting'), {
    key: 'legacy-setting',
    value: { keep: true },
  });

  assert.equal(factory.openedName, 'babustv');
  assert.equal(factory.openedVersion, 2);
  assert.deepEqual([...factory.database.stores.keys()].sort(), [
    'app_state',
    'categories',
    'channels',
    'epg_programs',
    'providers',
  ]);
  assert.deepEqual(factory.database.stores.get('epg_programs')?.indexes, new Map([
    ['providerId', { keyPath: 'providerId', unique: false }],
    ['providerChannelKey', { keyPath: 'providerChannelKey', unique: false }],
  ]));
});

void test('M7 MIG reopening an already-current database is idempotent and does not duplicate durable records', async () => {
  const factory = new RecordingFactory(
    ['providers', 'categories', 'channels', 'app_state', 'epg_programs'],
    false,
  );
  configureV2Indexes(factory);
  factory.database.stores.get('providers')!.data.set('provider-a', provider('provider-a'));
  factory.database.stores.get('app_state')!.data.set(favoriteKey('provider-a', 'shared'), {
    key: favoriteKey('provider-a', 'shared'),
    kind: 'user.favorite.v1',
    providerId: 'provider-a',
    channelId: 'shared',
    addedAtMs: 10,
  });

  const first = new IndexedDbStructuredStore(factory as unknown as IDBFactory);
  const second = new IndexedDbStructuredStore(factory as unknown as IDBFactory);

  assert.equal((await new StructuredProviderRepository(first).getProvider('provider-a'))?.id, 'provider-a');
  assert.equal(await new StructuredFavoriteRepository(first).has('provider-a', 'shared'), true);
  assert.equal((await new StructuredProviderRepository(second).getProvider('provider-a'))?.id, 'provider-a');
  assert.equal(await new StructuredFavoriteRepository(second).has('provider-a', 'shared'), true);
  assert.equal(factory.database.stores.get('providers')?.data.size, 1);
  assert.equal(factory.database.stores.get('app_state')?.data.size, 1);
  assert.equal(factory.openCount, 2);
  assert.equal(factory.openedVersion, 2);
});

void test('M7 MIG IndexedDB upgrade/open failures expose only the fixed structured storage error', async () => {
  const store = new IndexedDbStructuredStore(new FailingFactory() as unknown as IDBFactory);

  await assert.rejects(
    store.get('providers', 'provider-a'),
    (error: unknown) => error instanceof StructuredStorageError
      && error.message === 'Structured storage operation failed.'
      && !error.message.includes('native details'),
  );
});

void test('M7 MIG malformed StructuredStore writes are rejected without native serialization details', async () => {
  const store = new MemoryStructuredStore();

  await assert.rejects(
    store.put('providers', null),
    (error: unknown) => error instanceof Error
      && error.message === 'Structured storage record is invalid.',
  );
  await assert.rejects(
    store.put('app_state', { key: { invalid: true } }),
    (error: unknown) => error instanceof Error
      && error.message === 'Structured storage key is invalid.',
  );
});

void test('M7 MIG corrupt provider records degrade to null/skip without hiding another provider partition', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  await providers.saveProvider(provider('provider-b', 'B valid'));
  await store.put('providers', {
    id: 'provider-a',
    kind: 'xtream',
    name: 42,
    createdAtMs: 'not-a-number',
    lastSuccessfulSyncAtMs: null,
  });

  assert.equal(await providers.getProvider('provider-a'), null);
  assert.deepEqual(await providers.listProviders(), [provider('provider-b', 'B valid')]);
  assert.equal((await providers.getProvider('provider-b'))?.name, 'B valid');

  await providers.saveProvider(provider('provider-a', 'A recovered'));
  assert.equal((await providers.getProvider('provider-a'))?.name, 'A recovered');
  assert.equal((await providers.getProvider('provider-b'))?.name, 'B valid');
});

void test('M7 MIG corrupt catalog rows are skipped, cross-partition keys are contained, and replacement recovers only that provider', async () => {
  const store = new MemoryStructuredStore();
  const catalog = new StructuredCatalogRepository(store);
  await catalog.replaceCategories('provider-b', [category('provider-b')]);
  await catalog.replaceChannels('provider-b', [channel('provider-b', 'shared', 'B valid')]);

  await store.put('categories', {
    key: 'provider-a:broken',
    providerId: 'provider-a',
    id: 'broken',
    name: 42,
  });
  await store.put('channels', {
    key: 'provider-a:broken',
    providerId: 'provider-a',
    id: 'broken',
    name: 42,
    categoryId: null,
    logoUrl: null,
    number: null,
  });
  await store.put('channels', {
    key: 'provider-a:shared',
    providerId: 'provider-b',
    id: 'shared',
    name: 'cross-partition corruption',
    categoryId: null,
    logoUrl: null,
    number: null,
  });

  assert.deepEqual(await catalog.listCategories('provider-a'), []);
  assert.deepEqual(await catalog.listChannels('provider-a'), []);
  assert.equal(await catalog.getChannel('provider-a', 'shared'), null);
  assert.deepEqual(await catalog.listChannels('provider-b'), [channel('provider-b', 'shared', 'B valid')]);

  await catalog.replaceCategories('provider-a', [category('provider-a', 'shared', 'A recovered')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'shared', 'A recovered')]);

  assert.deepEqual(await catalog.listCategories('provider-a'), [category('provider-a', 'shared', 'A recovered')]);
  assert.deepEqual(await catalog.listChannels('provider-a'), [channel('provider-a', 'shared', 'A recovered')]);
  assert.deepEqual(await catalog.listChannels('provider-b'), [channel('provider-b', 'shared', 'B valid')]);
});

void test('M7 MIG corrupt EPG rows are skipped and recovery preserves another provider derived partition', async () => {
  const store = new MemoryStructuredStore();
  const epg = new StructuredEpgProgramRepository(store);
  await epg.replaceWindow('provider-b', WINDOW, [program('shared', 'B valid')]);

  await store.put('epg_programs', {
    key: 'corrupt-a',
    providerId: 'provider-a',
    providerChannelKey: providerChannelKey('provider-a', 'shared'),
    channelId: 'shared',
    startMs: 100,
    endMs: 200,
    title: 42,
    description: null,
  });
  await store.put('epg_programs', {
    key: 'cross-partition',
    providerId: 'provider-b',
    providerChannelKey: providerChannelKey('provider-a', 'shared'),
    channelId: 'shared',
    startMs: 100,
    endMs: 200,
    title: 'wrong partition',
    description: null,
  });

  assert.deepEqual(await epg.listPrograms('provider-a', 'shared', WINDOW), []);
  assert.deepEqual(await epg.listPrograms('provider-b', 'shared', WINDOW), [program('shared', 'B valid')]);

  await epg.replaceWindow('provider-a', WINDOW, [program('shared', 'A recovered', 300, 400)]);

  assert.deepEqual(await epg.listPrograms('provider-a', 'shared', WINDOW), [program('shared', 'A recovered', 300, 400)]);
  assert.deepEqual(await epg.listPrograms('provider-b', 'shared', WINDOW), [program('shared', 'B valid')]);
});

void test('M7 MIG corrupt Favorites/watch rows are ignored and can be repaired without erasing unrelated durable state', async () => {
  const store = new MemoryStructuredStore();
  const favorites = new StructuredFavoriteRepository(store);
  const watch = new StructuredWatchStateRepository(store);
  await seedDurableUserState(store, 'provider-b');

  await store.put('app_state', {
    key: favoriteKey('provider-a', 'shared'),
    kind: 'user.favorite.v1',
    providerId: 'provider-a',
    channelId: 'shared',
    addedAtMs: 'not-a-number',
  });
  await store.put('app_state', {
    key: lastWatchedKey('provider-a'),
    kind: 'user.watch.last.v1',
    providerId: 'provider-a',
    channelId: 'shared',
    lastPlayedAtMs: 'not-a-number',
  });
  await store.put('app_state', {
    key: aggregateKey('provider-a', 'shared'),
    kind: 'user.watch.aggregate.v1',
    providerId: 'provider-a',
    channelId: 'shared',
    meaningfulWatchMs: 1,
    meaningfulOpenCount: 'bad',
    lastMeaningfulWatchAtMs: null,
  });

  assert.deepEqual(await favorites.list('provider-a'), []);
  assert.equal(await favorites.has('provider-a', 'shared'), false);
  assert.equal(await watch.getLastWatched('provider-a'), null);
  assert.equal(await watch.getAggregate('provider-a', 'shared'), null);
  assert.equal(await favorites.has('provider-b', 'shared'), true);
  assert.equal((await watch.getLastWatched('provider-b'))?.channelId, 'shared');

  await seedDurableUserState(store, 'provider-a');
  const reopenedFavorites = new StructuredFavoriteRepository(store);
  const reopenedWatch = new StructuredWatchStateRepository(store);
  assert.equal(await reopenedFavorites.has('provider-a', 'shared'), true);
  assert.equal((await reopenedWatch.getLastWatched('provider-a'))?.channelId, 'shared');
  assert.equal(await reopenedFavorites.has('provider-b', 'shared'), true);
  assert.equal((await reopenedWatch.getLastWatched('provider-b'))?.channelId, 'shared');
});

void test('M7 MIG partial provider partitions keep durable state while rebuildable catalog/EPG remain empty', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  await providers.saveProvider(provider('provider-a'));
  await seedDurableUserState(store, 'provider-a');

  const reopenedProviders = new StructuredProviderRepository(store);
  const reopenedCatalog = new StructuredCatalogRepository(store);
  const reopenedEpg = new StructuredEpgProgramRepository(store);
  const reopenedFavorites = new StructuredFavoriteRepository(store);
  const reopenedWatch = new StructuredWatchStateRepository(store);

  assert.equal((await reopenedProviders.getProvider('provider-a'))?.id, 'provider-a');
  assert.deepEqual(await reopenedCatalog.listCategories('provider-a'), []);
  assert.deepEqual(await reopenedCatalog.listChannels('provider-a'), []);
  assert.deepEqual(await reopenedEpg.listPrograms('provider-a', 'shared', WINDOW), []);
  assert.equal(await reopenedFavorites.has('provider-a', 'shared'), true);
  assert.equal((await reopenedWatch.getLastWatched('provider-a'))?.channelId, 'shared');
});

void test('M7 MIG activeProviderId corruption degrades locally without mutating provider or user-state partitions', async () => {
  const store = new MemoryStructuredStore();
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const epg = new StructuredEpgProgramRepository(store);
  const favorites = new StructuredFavoriteRepository(store);
  const watch = new StructuredWatchStateRepository(store);

  await providers.saveProvider(provider('provider-a', 'A valid'));
  await providers.saveProvider(provider('provider-b', 'B valid'));
  await catalog.replaceCategories('provider-a', [category('provider-a')]);
  await catalog.replaceCategories('provider-b', [category('provider-b')]);
  await catalog.replaceChannels('provider-a', [channel('provider-a', 'shared', 'A valid')]);
  await catalog.replaceChannels('provider-b', [channel('provider-b', 'shared', 'B valid')]);
  await epg.replaceWindow('provider-a', WINDOW, [program('shared', 'A valid')]);
  await epg.replaceWindow('provider-b', WINDOW, [program('shared', 'B valid')]);
  await seedDurableUserState(store, 'provider-a');
  await seedDurableUserState(store, 'provider-b');

  await providers.setActiveProviderId('provider-a');
  assert.equal(await providers.getActiveProviderId(), 'provider-a');

  await providers.setActiveProviderId(null);
  assert.equal(await providers.getActiveProviderId(), null);

  await store.delete('app_state', 'activeProviderId');
  assert.equal(await providers.getActiveProviderId(), null);

  const corruptStates: readonly unknown[] = [
    { key: 'activeProviderId' },
    { key: 'activeProviderId', value: { providerId: 'provider-a' } },
    { key: 'activeProviderId', value: ['provider-a'] },
    { key: 'activeProviderId', value: 42 },
    { key: 'activeProviderId', value: { key: 'provider-a', value: 'provider-a' } },
  ];

  for (const state of corruptStates) {
    await store.put('app_state', state as never);
    assert.equal(await providers.getActiveProviderId(), null);
  }

  assert.equal((await providers.getProvider('provider-a'))?.name, 'A valid');
  assert.equal((await providers.getProvider('provider-b'))?.name, 'B valid');
  assert.deepEqual(await catalog.listChannels('provider-a'), [channel('provider-a', 'shared', 'A valid')]);
  assert.deepEqual(await catalog.listChannels('provider-b'), [channel('provider-b', 'shared', 'B valid')]);
  assert.deepEqual(await epg.listPrograms('provider-a', 'shared', WINDOW), [program('shared', 'A valid')]);
  assert.deepEqual(await epg.listPrograms('provider-b', 'shared', WINDOW), [program('shared', 'B valid')]);
  assert.equal(await favorites.has('provider-a', 'shared'), true);
  assert.equal(await favorites.has('provider-b', 'shared'), true);
  assert.equal((await watch.getLastWatched('provider-a'))?.channelId, 'shared');
  assert.equal((await watch.getLastWatched('provider-b'))?.channelId, 'shared');
});