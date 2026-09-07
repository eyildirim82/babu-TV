export interface SyntheticCategoryFixture {
  id: string;
  name: string;
}

export interface SyntheticChannelFixture {
  id: string;
  name: string;
  categoryId: string | null;
  logoUrl: string | null;
  number: number | null;
}

export const DEMO_CREDENTIALS = {
  username: 'demo-user',
  password: 'demo-pass',
} as const;

export const BASIC_CATEGORIES: readonly SyntheticCategoryFixture[] = [
  { id: 'news', name: 'News' },
  { id: 'sports', name: 'Sports' },
];

export const BASIC_CHANNELS: readonly SyntheticChannelFixture[] = [
  {
    id: '42',
    name: 'Example News',
    categoryId: 'news',
    logoUrl: 'https://example.com/logos/news.png',
    number: 1,
  },
  {
    id: '77',
    name: 'Example Sports',
    categoryId: 'sports',
    logoUrl: 'https://example.com/logos/sports.png',
    number: 2,
  },
];

export function makeLargeChannelFixture(count: number): SyntheticChannelFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `channel-${index + 1}`,
    name: `Synthetic Channel ${index + 1}`,
    categoryId: 'bulk',
    logoUrl: null,
    number: index + 1,
  }));
}
