import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexedDbStructuredStore } from '../src/storage/indexeddb-structured-store.js';

class RecordingObjectStore {
  readonly indexes = new Map<string, { keyPath: string | readonly string[]; unique: boolean }>();

  createIndex(name: string, keyPath: string | readonly string[], options?: IDBIndexParameters): IDBIndex {
    this.indexes.set(name, { keyPath, unique: options?.unique ?? false });
    return {} as IDBIndex;
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

  createObjectStore(name: string): IDBObjectStore {
    const store = new RecordingObjectStore();
    this.stores.set(name, store);
    return store as unknown as IDBObjectStore;
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
    const request = {
      result: this.database as unknown as IDBDatabase,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest;

    queueMicrotask(() => {
      request.onupgradeneeded?.call(request, new Event('upgradeneeded') as IDBVersionChangeEvent);
      request.onsuccess?.call(request, new Event('success'));
    });
    return request;
  }
}

test('EPG-P migrates v1 structured storage to v2 with provider-scoped EPG indexes', async () => {
  const factory = new RecordingFactory(['providers', 'categories', 'channels', 'app_state']);
  const store = new IndexedDbStructuredStore(factory as unknown as IDBFactory);

  await (store as unknown as { database(): Promise<IDBDatabase> }).database();

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
