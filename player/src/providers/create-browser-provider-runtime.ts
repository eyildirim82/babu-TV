import {
  SamsungWidgetDataCredentialStore,
  type WidgetDataLike,
} from '../credentials/samsung-widgetdata-credential-store.js';
import { StructuredEpgProgramRepository } from '../epg/structured-epg-program-repository.js';
import { StructuredCatalogRepository } from '../repository/structured-catalog-repository.js';
import { StructuredFavoriteRepository } from '../repository/structured-favorite-repository.js';
import { StructuredProviderRepository } from '../repository/structured-provider-repository.js';
import { StructuredWatchStateRepository } from '../repository/structured-watch-state-repository.js';
import { IndexedDbStructuredStore } from '../storage/indexeddb-structured-store.js';
import { FetchProviderHttpClient } from './http/fetch-provider-http-client.js';
import { ProviderAdapterFactoryImpl } from './provider-adapter-factory.js';
import { ProviderCoreService } from './provider-core-service.js';
import { ProviderEpgService } from './provider-epg-service.js';
import { ProviderSyncService } from './provider-sync-service.js';
import { ProviderUserStateCleanup } from './provider-user-state-cleanup.js';

export interface BrowserProviderRuntimeDependencies {
  indexedDb: IDBFactory | null;
  widgetData: WidgetDataLike | null;
  fetchImpl: typeof fetch;
}

export function createBrowserProviderRuntime(deps: BrowserProviderRuntimeDependencies) {
  const store = new IndexedDbStructuredStore(deps.indexedDb);
  const providers = new StructuredProviderRepository(store);
  const catalog = new StructuredCatalogRepository(store);
  const watchState = new StructuredWatchStateRepository(store);
  const favorites = new StructuredFavoriteRepository(store);
  const userStateCleanup = new ProviderUserStateCleanup(watchState, favorites);
  const credentials = new SamsungWidgetDataCredentialStore(deps.widgetData);
  const http = new FetchProviderHttpClient(deps.fetchImpl);
  const adapters = new ProviderAdapterFactoryImpl(http);
  const epgRepository = new StructuredEpgProgramRepository(store);
  const epg = new ProviderEpgService({ providers, catalog, credentials, adapters, repository: epgRepository });
  const sync = new ProviderSyncService(providers, catalog, credentials, adapters);
  const core = new ProviderCoreService(
    providers,
    catalog,
    credentials,
    sync,
    adapters,
    epg,
    userStateCleanup,
  );

  return {
    providers,
    catalog,
    watchState,
    favorites,
    credentials,
    http,
    adapters,
    epgRepository,
    epg,
    sync,
    core,
  };
}
