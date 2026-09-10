import { makeChannelKey } from '../domain/models.js';
import type { CatalogSearchMatch, CatalogSearchResult } from './search-core.js';

export type SearchFocusZone = 'input' | 'results';
export type SearchViewStatus = 'idle' | 'no-results' | 'results';

export interface SearchResultItemViewModel {
  key: string;
  primaryText: string;
  numberText: string | null;
  matchedBy: CatalogSearchMatch;
}

export interface SearchViewModel {
  status: SearchViewStatus;
  query: string;
  items: readonly SearchResultItemViewModel[];
  focusZone: SearchFocusZone;
  focusedResultKey: string | null;
  restoreResultKey: string | null;
}

export interface ProjectSearchViewInput {
  query: string;
  results: readonly CatalogSearchResult[];
  focusZone: SearchFocusZone;
  focusedResultKey: string | null;
  restoreResultKey: string | null;
}

function itemFromResult(result: CatalogSearchResult): SearchResultItemViewModel {
  return {
    key: makeChannelKey(result.channel.providerId, result.channel.id),
    primaryText: result.channel.name,
    numberText: result.channel.number === null ? null : String(result.channel.number),
    matchedBy: result.matchedBy,
  };
}

export function projectSearchView(input: ProjectSearchViewInput): SearchViewModel {
  if (input.query.trim().length === 0) {
    return {
      status: 'idle',
      query: input.query,
      items: [],
      focusZone: 'input',
      focusedResultKey: null,
      restoreResultKey: input.restoreResultKey,
    };
  }

  const items = input.results.map(itemFromResult);
  if (items.length === 0) {
    return {
      status: 'no-results',
      query: input.query,
      items,
      focusZone: 'input',
      focusedResultKey: null,
      restoreResultKey: input.restoreResultKey,
    };
  }

  if (input.focusZone === 'input') {
    return {
      status: 'results',
      query: input.query,
      items,
      focusZone: 'input',
      focusedResultKey: null,
      restoreResultKey: input.restoreResultKey,
    };
  }

  const keys = new Set(items.map((item) => item.key));
  const focusedResultKey =
    (input.focusedResultKey !== null && keys.has(input.focusedResultKey)
      ? input.focusedResultKey
      : null)
    ?? (input.restoreResultKey !== null && keys.has(input.restoreResultKey)
      ? input.restoreResultKey
      : null)
    ?? items[0]?.key
    ?? null;

  return {
    status: 'results',
    query: input.query,
    items,
    focusZone: 'results',
    focusedResultKey,
    restoreResultKey: focusedResultKey,
  };
}
