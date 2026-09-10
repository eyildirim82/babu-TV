import test from 'node:test';
import assert from 'node:assert/strict';
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
