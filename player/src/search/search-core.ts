import type { Category, Channel } from '../domain/models.js';

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR');
}

export type CatalogSearchMatch = 'number' | 'name' | 'category';

export interface CatalogSearchResult {
  channel: Channel;
  matchedBy: CatalogSearchMatch;
  rank: number;
}

function textMatchRank(value: string, query: string, exactRank: number): number | null {
  if (value === query) return exactRank;
  if (value.startsWith(query)) return exactRank + 10;
  if (value.includes(query)) return exactRank + 20;
  return null;
}

function categoryKey(providerId: string, categoryId: string): string {
  return `${providerId}\u0000${categoryId}`;
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareResults(left: CatalogSearchResult, right: CatalogSearchResult): number {
  if (left.rank !== right.rank) return left.rank - right.rank;

  const numberOrder = compareNullableNumbers(left.channel.number, right.channel.number);
  if (numberOrder !== 0) return numberOrder;

  const nameOrder = compareText(normalizeSearchText(left.channel.name), normalizeSearchText(right.channel.name));
  if (nameOrder !== 0) return nameOrder;

  const idOrder = compareText(left.channel.id, right.channel.id);
  if (idOrder !== 0) return idOrder;

  return compareText(left.channel.providerId, right.channel.providerId);
}

function normalizeLimit(limit: number | undefined): number | null {
  if (limit === undefined) return 50;
  if (!Number.isFinite(limit) || limit <= 0) return null;

  const normalized = Math.floor(limit);
  return normalized > 0 ? normalized : null;
}

export function searchCatalog(input: {
  channels: readonly Channel[];
  categories: readonly Category[];
  query: string;
  limit?: number;
}): readonly CatalogSearchResult[] {
  const query = normalizeSearchText(input.query);
  const limit = normalizeLimit(input.limit);

  if (query.length === 0 || limit === null) return [];

  if (/^\d+$/.test(query)) {
    const number = Number(query);
    if (!Number.isSafeInteger(number)) return [];

    const matches = input.channels.filter((channel) => channel.number !== null && channel.number === number);
    if (matches.length !== 1) return [];

    return [{ channel: matches[0], matchedBy: 'number', rank: 0 }];
  }

  const categoryNames = new Map<string, string>();
  for (const category of input.categories) {
    categoryNames.set(categoryKey(category.providerId, category.id), normalizeSearchText(category.name));
  }

  const results: CatalogSearchResult[] = [];

  for (const channel of input.channels) {
    const nameRank = textMatchRank(normalizeSearchText(channel.name), query, 10);
    let bestRank = nameRank;
    let matchedBy: CatalogSearchMatch | null = nameRank === null ? null : 'name';

    if (channel.categoryId !== null) {
      const categoryName = categoryNames.get(categoryKey(channel.providerId, channel.categoryId));
      if (categoryName !== undefined) {
        const categoryRank = textMatchRank(categoryName, query, 40);
        if (categoryRank !== null && (bestRank === null || categoryRank < bestRank)) {
          bestRank = categoryRank;
          matchedBy = 'category';
        }
      }
    }

    if (bestRank !== null && matchedBy !== null) {
      results.push({ channel, matchedBy, rank: bestRank });
    }
  }

  results.sort(compareResults);
  return results.slice(0, limit);
}
