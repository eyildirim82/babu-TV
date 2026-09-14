import type { ProviderRecord } from './models.js';

function compareStableId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Orders providers for display by creation time (then stable id) and numbers
// providers that share a name, e.g. two M3U playlists become "M3U" and "M3U 2".
// The label is display-only: stored records keep their name, and M3U names never
// carry any part of the credential-bearing playlist URL.
export function orderProvidersForDisplay(providers: readonly ProviderRecord[]): ProviderRecord[] {
  const seen = new Map<string, number>();
  return [...providers]
    .sort((a, b) => a.createdAtMs - b.createdAtMs || compareStableId(a.id, b.id))
    .map((provider) => {
      const occurrence = (seen.get(provider.name) ?? 0) + 1;
      seen.set(provider.name, occurrence);
      return occurrence === 1 ? { ...provider } : { ...provider, name: `${provider.name} ${occurrence}` };
    });
}
