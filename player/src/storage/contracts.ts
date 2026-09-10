export type StructuredStoreName = 'providers' | 'categories' | 'channels' | 'app_state' | 'epg_programs';

export interface StructuredStore {
  get<T>(store: StructuredStoreName, key: IDBValidKey): Promise<T | null>;
  getAll<T>(store: StructuredStoreName): Promise<readonly T[]>;
  getAllByIndex<T>(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
  ): Promise<readonly T[]>;
  put<T>(store: StructuredStoreName, value: T): Promise<void>;
  delete(store: StructuredStoreName, key: IDBValidKey): Promise<void>;
  replaceByIndex<T>(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
    values: readonly T[],
  ): Promise<void>;
  deleteByIndex(
    store: StructuredStoreName,
    indexName: string,
    indexValue: IDBValidKey,
  ): Promise<void>;
}
