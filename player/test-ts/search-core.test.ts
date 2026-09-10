import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { normalizeSearchText, searchCatalog } from '../src/search/search-core.js';

test('SRCH-C is Turkish-case-safe for channel and category names', () => {
  const categories = [{ providerId: 'p1', id: 'news', name: 'İç Haber' }];
  const channels = [
    { providerId: 'p1', id: 'c1', name: 'İSTANBUL TV', categoryId: 'news', logoUrl: null, number: 7 },
    { providerId: 'p1', id: 'c2', name: 'Spor', categoryId: null, logoUrl: null, number: 8 },
  ];

  assert.equal(normalizeSearchText('  İSTANBUL   TV '), 'istanbul tv');
  assert.deepEqual(searchCatalog({ channels, categories, query: 'istanbul' }).map((x) => x.channel.id), ['c1']);
  assert.deepEqual(searchCatalog({ channels, categories, query: 'iç haber' }).map((x) => x.channel.id), ['c1']);
});

test('SRCH-C ranks name matches before category matches and preserves inputs', () => {
  const categories = [
    { providerId: 'p1', id: 'cat-exact', name: 'Haber' },
    { providerId: 'p1', id: 'cat-prefix', name: 'Haber Yerel' },
    { providerId: 'p1', id: 'cat-contains', name: 'Güncel Haberler' },
  ];
  const channels = [
    { providerId: 'p1', id: 'name-contains', name: 'Yeni Haber Merkezi', categoryId: null, logoUrl: null, number: 3 },
    { providerId: 'p1', id: 'category-exact', name: 'Kanal Dört', categoryId: 'cat-exact', logoUrl: null, number: 4 },
    { providerId: 'p1', id: 'name-prefix', name: 'Haber Türk', categoryId: null, logoUrl: null, number: 2 },
    { providerId: 'p1', id: 'category-prefix', name: 'Kanal Beş', categoryId: 'cat-prefix', logoUrl: null, number: 5 },
    { providerId: 'p1', id: 'name-exact', name: 'Haber', categoryId: 'cat-contains', logoUrl: null, number: 1 },
    { providerId: 'p1', id: 'category-contains', name: 'Kanal Altı', categoryId: 'cat-contains', logoUrl: null, number: 6 },
  ];
  const channelIdsBefore = channels.map((channel) => channel.id);
  const categoryIdsBefore = categories.map((category) => category.id);

  assert.deepEqual(
    searchCatalog({ channels, categories, query: 'haber' }).map((result) => [result.channel.id, result.matchedBy, result.rank]),
    [
      ['name-exact', 'name', 10],
      ['name-prefix', 'name', 20],
      ['name-contains', 'name', 30],
      ['category-exact', 'category', 40],
      ['category-prefix', 'category', 50],
      ['category-contains', 'category', 60],
    ],
  );
  assert.deepEqual(channels.map((channel) => channel.id), channelIdsBefore);
  assert.deepEqual(categories.map((category) => category.id), categoryIdsBefore);
  assert.deepEqual(searchCatalog({ channels, categories, query: '   ' }), []);
  assert.deepEqual(searchCatalog({ channels, categories, query: 'haber', limit: 0 }), []);
  assert.deepEqual(searchCatalog({ channels, categories, query: 'haber', limit: Number.NaN }), []);
  assert.equal(searchCatalog({ channels, categories, query: 'haber', limit: 2 }).length, 2);
});

test('SRCH-C promotes an exact channel number only when unambiguous', () => {
  const base = { providerId: 'p1', categoryId: null, logoUrl: null };
  const unique = [
    { ...base, id: 'c7', name: 'Yedi', number: 7 },
    { ...base, id: 'c8', name: 'Sekiz', number: 8 },
  ];

  assert.deepEqual(searchCatalog({ channels: unique, categories: [], query: '7' }).map((x) => x.channel.id), ['c7']);
  assert.deepEqual(searchCatalog({ channels: unique, categories: [], query: '007' }).map((x) => x.channel.id), ['c7']);

  const ambiguous = [...unique, { ...base, id: 'other7', name: 'Başka', number: 7 }];
  assert.deepEqual(searchCatalog({ channels: ambiguous, categories: [], query: '7' }), []);
  assert.deepEqual(searchCatalog({ channels: unique, categories: [], query: '999999999999999999999999999999' }), []);
});

test('SRCH-C has provider-agnostic stable ordering and category lookup by channel categoryId', () => {
  const categories = [
    { providerId: 'p1', id: 'sports', name: 'Spor' },
    { providerId: 'p1', id: 'news', name: 'Haber' },
    { providerId: 'p2', id: 'news', name: 'Belgesel' },
  ];
  const channels = [
    { providerId: 'p1', id: 'c-null', name: 'Haber Z', categoryId: null, logoUrl: null, number: null },
    { providerId: 'p1', id: 'c20b', name: 'Haber B', categoryId: 'sports', logoUrl: null, number: 20 },
    { providerId: 'p1', id: 'c10', name: 'Haber C', categoryId: 'news', logoUrl: null, number: 10 },
    { providerId: 'p1', id: 'c20a', name: 'Haber A', categoryId: 'sports', logoUrl: null, number: 20 },
  ];

  const forward = searchCatalog({ channels, categories, query: 'haber' }).map((x) => x.channel.id);
  const reverse = searchCatalog({ channels: [...channels].reverse(), categories: [...categories].reverse(), query: 'haber' }).map((x) => x.channel.id);

  assert.deepEqual(forward, ['c10', 'c20a', 'c20b', 'c-null']);
  assert.deepEqual(reverse, forward);

  const categoryOnly = [{ providerId: 'p1', id: 'cat-channel', name: 'Kanal', categoryId: 'news', logoUrl: null, number: 1 }];
  assert.deepEqual(searchCatalog({ channels: categoryOnly, categories: [...categories].reverse(), query: 'haber' }).map((x) => x.channel.id), ['cat-channel']);
  assert.deepEqual(searchCatalog({ channels: [{ ...categoryOnly[0], providerId: 'p2' }], categories, query: 'haber' }), []);
});

test('SRCH-C stays responsive on a 10,000-channel synthetic catalog', () => {
  const categories = Array.from({ length: 100 }, (_, index) => ({
    providerId: 'p1',
    id: `cat-${index}`,
    name: `Kategori ${index}`,
  }));
  const channels = Array.from({ length: 10_000 }, (_, index) => ({
    providerId: 'p1',
    id: `c-${index}`,
    name: `Kanal ${index}`,
    categoryId: `cat-${index % 100}`,
    logoUrl: null,
    number: index + 1,
  }));
  channels[9_997] = { ...channels[9_997], name: 'Özel İstanbul Kanalı' };

  searchCatalog({ channels, categories, query: 'özel istanbul kanalı' });
  const start = performance.now();
  const results = searchCatalog({ channels, categories, query: 'özel istanbul kanalı' });
  const elapsedMs = performance.now() - start;

  assert.equal(results[0]?.channel.id, 'c-9997');
  assert.ok(elapsedMs < 500, `expected 10,000-channel search under 500 ms, got ${elapsedMs.toFixed(2)} ms`);
});
