import test from 'node:test';
import assert from 'node:assert/strict';
import type { EpgProgram } from '../src/domain/models.js';
import type { EpgProgramRepository } from '../src/epg/contracts.js';
import type { StructuredStore } from '../src/storage/contracts.js';
import { IndexedDbStructuredStore } from '../src/storage/indexeddb-structured-store.js';
import { MemoryStructuredStore } from '../src/storage/memory-structured-store.js';
import { MemoryEpgProgramRepository } from './support/v1-rc-memory-repositories.js';

type FlatRecord = Record<string, unknown>;
type IndexDefinition = { keyPath: string | readonly string[]; unique: boolean };

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
  const value = {
    result: undefined as T,
    error: null,
    onsuccess: null,
    onerror: null,
  } as unknown as IDBRequest<T>;
  queueMicrotask(() => {
    try {
      value.result = operation();
      value.onsuccess?.call(value, new Event('success'));
    } catch {
      value.onerror?.call(value, new Event('error'));
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
  const value = {
    result: null as IDBCursorWithValue | null,
    error: null,
    onsuccess: null,
    onerror: null,
  } as unknown as IDBRequest<IDBCursorWithValue | null>;

  const emit = () => {
    queueMicrotask(() => {
      const entry = entries[index];
      if (!entry) {
        value.result = null;
        value.onsuccess?.call(value, new Event('success'));
        transaction.endRequest();
        return;
      }
      const [primaryKey, storedValue] = entry;
      const cursor = {
        primaryKey,
        value: withValue ? storedValue : undefined,
        continue: () => {
          index += 1;
          emit();
        },
      } as unknown as IDBCursorWithValue;
      value.result = cursor;
      value.onsuccess?.call(value, new Event('success'));
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
    return request(this.transaction, () => {
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
    for (const name of existingStores) this.stores.set(name, new RecordingObjectStore());
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

  constructor(existingStores: readonly string[] = []) {
    this.database = new RecordingDatabase(existingStores);
  }

  open(name: string, version?: number): IDBOpenDBRequest {
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
      openRequest.onupgradeneeded?.call(openRequest, new Event('upgradeneeded') as IDBVersionChangeEvent);
      openRequest.onsuccess?.call(openRequest, new Event('success'));
    });
    return openRequest;
  }
}

type StructuredEpgRepositoryConstructor = new (store: StructuredStore) => EpgProgramRepository;

async function structuredRepository(store: StructuredStore): Promise<EpgProgramRepository> {
  const loaded: unknown = await import('../src/epg/structured-epg-program-repository.js').catch(() => null);
  const constructor = loaded && typeof loaded === 'object'
    ? (loaded as { StructuredEpgProgramRepository?: unknown }).StructuredEpgProgramRepository
    : null;
  assert.equal(typeof constructor, 'function', 'StructuredEpgProgramRepository must be implemented.');
  return new (constructor as StructuredEpgRepositoryConstructor)(store);
}

function program(channelId: string, startMs: number, endMs: number, title: string): EpgProgram {
  return { channelId, startMs, endMs, title, description: null };
}

async function exerciseRepository(repository: EpgProgramRepository): Promise<unknown> {
  await repository.replaceWindow('p1', { startMs: 0, endMs: 500 }, [
    program('c1', 50, 150, 'Ends at replacement start'),
    program('c1', 100, 200, 'Old current'),
    program('c2', 250, 300, 'Other channel in replacement'),
    program('c1', 300, 400, 'Old next'),
    program('c1', 350, 450, 'Starts at replacement end'),
  ]);
  await repository.replaceWindow('p2', { startMs: 0, endMs: 500 }, [
    program('c1', 100, 200, 'Provider two'),
  ]);

  await repository.replaceWindow('p1', { startMs: 150, endMs: 350 }, [
    program('c1', 160, 170, 'Replacement'),
  ]);

  const beforeDelete = {
    p1c1: await repository.listPrograms('p1', 'c1', { startMs: 0, endMs: 500 }),
    p1c2: await repository.listPrograms('p1', 'c2', { startMs: 0, endMs: 500 }),
    boundaryWindow: await repository.listPrograms('p1', 'c1', { startMs: 150, endMs: 350 }),
    p2c1: await repository.listPrograms('p2', 'c1', { startMs: 0, endMs: 500 }),
  };

  await repository.deleteProvider('p1');

  return {
    beforeDelete,
    afterDelete: {
      p1c1: await repository.listPrograms('p1', 'c1', { startMs: 0, endMs: 500 }),
      p2c1: await repository.listPrograms('p2', 'c1', { startMs: 0, endMs: 500 }),
    },
  };
}

test('EPG-P migrates v1 structured storage to v2 with provider-scoped EPG indexes', async () => {
  const factory = new RecordingFactory(['providers', 'categories', 'channels', 'app_state']);
  const existingProviders = factory.database.stores.get('providers');
  const store = new IndexedDbStructuredStore(factory as unknown as IDBFactory);

  await (store as unknown as { database(): Promise<IDBDatabase> }).database();

  assert.equal(factory.openedName, 'babustv');
  assert.equal(factory.openedVersion, 2);
  assert.equal(factory.database.stores.get('providers'), existingProviders);
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

test('EPG-P structured repository matches the memory contract for bounded replacement and provider cleanup', async () => {
  const expected = await exerciseRepository(new MemoryEpgProgramRepository());
  const actual = await exerciseRepository(await structuredRepository(new MemoryStructuredStore()));

  assert.deepEqual(actual, expected);
});

test('EPG-P IndexedDB repository has the same bounded-window behavior as the memory repository', async () => {
  const expected = await exerciseRepository(new MemoryEpgProgramRepository());
  const factory = new RecordingFactory();
  const indexedDb = new IndexedDbStructuredStore(factory as unknown as IDBFactory);
  const actual = await exerciseRepository(await structuredRepository(indexedDb));

  assert.deepEqual(actual, expected);
});
