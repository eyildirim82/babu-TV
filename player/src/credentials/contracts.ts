import type { ProviderId } from '../domain/models.js';

export type XtreamCredential = {
  kind: 'xtream';
  serverUrl: string;
  username: string;
  password: string;
};

export type M3uCredential = {
  kind: 'm3u';
  playlistUrl: string;
};

export type ProviderCredential = XtreamCredential | M3uCredential;

export interface CredentialStore {
  isAvailable(): boolean;
  save(providerId: ProviderId, credential: ProviderCredential): Promise<void>;
  load(providerId: ProviderId): Promise<ProviderCredential | null>;
  remove(providerId: ProviderId): Promise<void>;
}
