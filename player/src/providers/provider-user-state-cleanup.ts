import type { ProviderId } from '../domain/models.js';
import type { FavoriteRepository } from '../favorites/contracts.js';
import type { WatchStateRepository } from '../watch/contracts.js';

export class ProviderUserStateCleanup {
  constructor(
    private readonly watch: Pick<WatchStateRepository, 'deleteProvider'>,
    private readonly favorites: Pick<FavoriteRepository, 'deleteProvider'>,
  ) {}

  async deleteProvider(providerId: ProviderId): Promise<void> {
    await this.watch.deleteProvider(providerId);
    await this.favorites.deleteProvider(providerId);
  }
}
