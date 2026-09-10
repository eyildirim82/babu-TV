import type { StructuredStore, StructuredStoreName } from './contracts.js';

type FlatRecord = Record<string, unknown>;

const KEY_PATHS: Readonly<Record<StructuredStoreName, 'id' | 'key'>> = {
  providers: 'id',
  categories: 'key',
  channels: 'key',
  app_state: 'key',
  epg_programs: 'key',
};

function copyValue<T>(value: T): T {
  if (Array.isArray(value)) return value.slice() as T;
  if (value !== null && typeof value === 'object') return { ...(value as FlatRecord) } as T;
  return value;
}

function recordOf(value: unknown): FlatRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Structured storage record is invalid.');
  }
  return value as FlatRecord;
}

function keyOf(store: StructuredStoreName, value: unknown): IDBValidKey {
  const record = recordOf(value);
  const key = record[KEY_PATHS[store]];
  if (typeof key !== 'string' && typeof key !== 'number') {
    throw new Error('Structured storage key is invalid.');
  }
  return key;
}

export class MemoryStructuredStore implements StructuredStore {
  private readonly stores: Record<StructuredStoreName, Map<IDBValidKey, unknown>> = {
    providers: new Map(),
    categories: new Map(),
    channels: new Map(),
    app_state: new Map(),
    epg_programs: new Map(),
  };

  async get<T>(store: StructuredStoreName, key: IDBValidKey): Promise<T | null> {
    const value = this.stores[store].get(key);
    return value === undefined ? null : copyValue(value as T);
  }

  async getAll<T>(store: StructuredStoreName): Promise<readonly T[]> {
    return Array.from(this.stores[store].values(), (value) => copyValue(value as T));
  }

  async getAllByIndex<T>(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
  ): Promise<readonly T[]> {
    const values: T[] = [];
    for (const value of this.stores[store].values()) {
      const record = recordOf(value);
      if (record[indexName] === indexValue) values.push(copyValue(value as T));
    }
    return values;
  }

  async put<T>(store: StructuredStoreName, value: T): Promise<void> {
    this.stores[store].set(keyOf(store, value), copyValue(value));
  }

  async delete(store: StructuredStoreName, key: IDBValidKey): Promise<void> {
    this.stores[store].delete(key);
  }

  async replaceByIndex<T>(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
    values: readonly T[],
  ): Promise<void> {
    const next = new Map(this.stores[store]);
    for (const [key, value] of next) {
      if (recordOf(value)[indexName] === indexValue) next.delete(key);
    }
    for (const value of values) next.set(keyOf(store, value), copyValue(value));
    this.stores[store].clear();
    for (const [key, value] of next) this.stores[store].set(key, value);
  }

  async deleteByIndex(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
  ): Promise<void> {
    for (const [key, value] of this.stores[store]) {
      if (recordOf(value)[indexName] === indexValue) this.stores[store].delete(key);
    }
  }
}
