import type { StructuredStore, StructuredStoreName } from './contracts.js';

const DATABASE_NAME = 'babustv';
const DATABASE_VERSION = 1;

export class StorageUnavailableError extends Error {
  constructor() {
    super('Structured storage is unavailable.');
    this.name = 'StorageUnavailableError';
  }
}

export class StructuredStorageError extends Error {
  constructor() {
    super('Structured storage operation failed.');
    this.name = 'StructuredStorageError';
  }
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new StructuredStorageError());
    transaction.onabort = () => reject(new StructuredStorageError());
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StructuredStorageError());
  });
}

function cursorValues<T>(request: IDBRequest<IDBCursorWithValue | null>): Promise<readonly T[]> {
  return new Promise((resolve, reject) => {
    const values: T[] = [];
    request.onerror = () => reject(new StructuredStorageError());
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null) {
        resolve(values);
        return;
      }
      values.push(cursor.value as T);
      cursor.continue();
    };
  });
}

export class IndexedDbStructuredStore implements StructuredStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null) {}

  private async database(): Promise<IDBDatabase> {
    if (this.factory === null) throw new StorageUnavailableError();
    if (this.databasePromise !== null) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = this.factory!.open(DATABASE_NAME, DATABASE_VERSION);
      } catch {
        reject(new StructuredStorageError());
        return;
      }

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('providers')) {
          database.createObjectStore('providers', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('categories')) {
          const categories = database.createObjectStore('categories', { keyPath: 'key' });
          categories.createIndex('providerId', 'providerId', { unique: false });
        }
        if (!database.objectStoreNames.contains('channels')) {
          const channels = database.createObjectStore('channels', { keyPath: 'key' });
          channels.createIndex('providerId', 'providerId', { unique: false });
        }
        if (!database.objectStoreNames.contains('app_state')) {
          database.createObjectStore('app_state', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new StructuredStorageError());
      request.onblocked = () => reject(new StructuredStorageError());
    });

    try {
      return await this.databasePromise;
    } catch (error) {
      this.databasePromise = null;
      throw error;
    }
  }

  async get<T>(store: StructuredStoreName, key: IDBValidKey): Promise<T | null> {
    const database = await this.database();
    const transaction = database.transaction(store, 'readonly');
    const result = await requestResult(transaction.objectStore(store).get(key));
    return result === undefined ? null : result as T;
  }

  async getAll<T>(store: StructuredStoreName): Promise<readonly T[]> {
    const database = await this.database();
    const transaction = database.transaction(store, 'readonly');
    return cursorValues<T>(transaction.objectStore(store).openCursor());
  }

  async getAllByIndex<T>(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
  ): Promise<readonly T[]> {
    const database = await this.database();
    const transaction = database.transaction(store, 'readonly');
    return cursorValues<T>(transaction.objectStore(store).index(indexName).openCursor(indexValue));
  }

  async put<T>(store: StructuredStoreName, value: T): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value);
    await transactionDone(transaction);
  }

  async delete(store: StructuredStoreName, key: IDBValidKey): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(key);
    await transactionDone(transaction);
  }

  async replaceByIndex<T>(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
    values: readonly T[],
  ): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(store, 'readwrite');
    const objectStore = transaction.objectStore(store);
    const cursorRequest = objectStore.index(indexName).openKeyCursor(indexValue);

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor !== null) {
        objectStore.delete(cursor.primaryKey);
        cursor.continue();
        return;
      }
      for (const value of values) objectStore.put(value);
    };
    cursorRequest.onerror = () => transaction.abort();

    await transactionDone(transaction);
  }

  async deleteByIndex(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
  ): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction(store, 'readwrite');
    const objectStore = transaction.objectStore(store);
    const cursorRequest = objectStore.index(indexName).openKeyCursor(indexValue);

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor === null) return;
      objectStore.delete(cursor.primaryKey);
      cursor.continue();
    };
    cursorRequest.onerror = () => transaction.abort();

    await transactionDone(transaction);
  }
}
