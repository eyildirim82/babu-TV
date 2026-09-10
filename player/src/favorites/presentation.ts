export interface FavoriteActionPresentation {
  kind: 'favorite-toggle';
  label: 'Favoriye Ekle' | 'Favorilerden Çıkar';
  selected: boolean;
}

export function favoriteActionPresentation(isFavorite: boolean): FavoriteActionPresentation {
  return {
    kind: 'favorite-toggle',
    label: isFavorite ? 'Favorilerden Çıkar' : 'Favoriye Ekle',
    selected: isFavorite,
  };
}
