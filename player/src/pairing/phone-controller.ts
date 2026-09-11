import {
  PairingCryptoError,
  type PairingCiphertextV1,
} from './crypto.js';
import {
  PairingRelayError,
  normalizePairingRelayBaseUrl,
} from './relay-client.js';
import { validateM3uEntry } from '../providers/m3u/m3u-entry-validation.js';
import {
  encodePairingProviderPayload,
  type PairingProviderPayloadV1,
} from './phone-payload.js';

export interface PairingPhoneBootstrapV1 {
  version: 1;
  sessionId: string;
  expiresAtMs: number;
  tvPublicKey: JsonWebKey;
  relayBaseUrl: string;
}

export type PairingPhoneErrorCode =
  | 'INVALID_BOOTSTRAP'
  | 'REQUIRED'
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'CRYPTO_UNAVAILABLE'
  | 'INVALID_TV_KEY'
  | 'RELAY_UNAVAILABLE'
  | 'NETWORK';

export type XtreamPhoneInput = {
  serverUrl: string;
  username: string;
  password: string;
};

export type M3uPhoneInput = {
  playlistUrl: string;
};

export type PairingPhoneState =
  | { kind: 'choose-provider' }
  | { kind: 'xtream'; input: XtreamPhoneInput; error: PairingPhoneErrorCode | null }
  | { kind: 'm3u'; input: M3uPhoneInput; error: PairingPhoneErrorCode | null }
  | { kind: 'sending'; providerKind: 'xtream' | 'm3u' }
  | { kind: 'success' }
  | { kind: 'expired' }
  | { kind: 'error'; providerKind: 'xtream' | 'm3u' | null; code: PairingPhoneErrorCode };

export interface PairingPhoneCryptoPort {
  encryptForTv(tvPublicKey: JsonWebKey, plaintext: Uint8Array): Promise<PairingCiphertextV1>;
}

export interface PairingPhoneRelayPort {
  putCiphertext(request: { sessionId: string; ciphertext: string }): Promise<void>;
}

export interface PairingPhoneControllerDependencies {
  crypto: PairingPhoneCryptoPort;
  relay: PairingPhoneRelayPort;
  nowMs(): number;
}

function cryptoErrorCode(error: unknown): PairingPhoneErrorCode {
  if (error instanceof PairingCryptoError && error.code === 'INVALID_KEY') {
    return 'INVALID_TV_KEY';
  }
  return 'CRYPTO_UNAVAILABLE';
}

function relayErrorCode(error: unknown): PairingPhoneErrorCode {
  if (error instanceof PairingRelayError && error.code === 'NETWORK') return 'NETWORK';
  if (error instanceof PairingRelayError) return 'RELAY_UNAVAILABLE';
  return 'NETWORK';
}

export class PairingPhoneController {
  private xtreamDraft: XtreamPhoneInput = { serverUrl: '', username: '', password: '' };
  private m3uDraft: M3uPhoneInput = { playlistUrl: '' };
  private view: PairingPhoneState = { kind: 'choose-provider' };

  constructor(
    private readonly bootstrap: PairingPhoneBootstrapV1,
    private readonly deps: PairingPhoneControllerDependencies,
  ) {}

  state(): PairingPhoneState {
    return this.view;
  }

  chooseProvider(kind: 'xtream' | 'm3u'): void {
    if (this.view.kind === 'sending') return;
    this.view = kind === 'xtream'
      ? { kind: 'xtream', input: { ...this.xtreamDraft }, error: null }
      : { kind: 'm3u', input: { ...this.m3uDraft }, error: null };
  }

  updateXtream(input: XtreamPhoneInput): void {
    if (this.view.kind !== 'xtream') return;
    this.xtreamDraft = { ...input };
    this.view = { kind: 'xtream', input: { ...input }, error: null };
  }

  updateM3u(input: M3uPhoneInput): void {
    if (this.view.kind !== 'm3u') return;
    this.m3uDraft = { ...input };
    this.view = { kind: 'm3u', input: { ...input }, error: null };
  }

  back(): void {
    if (this.view.kind === 'xtream' || this.view.kind === 'm3u' || this.view.kind === 'error') {
      this.view = { kind: 'choose-provider' };
    }
  }

  async submit(): Promise<void> {
    if (this.view.kind === 'sending' || this.view.kind === 'success') return;

    const providerKind = this.view.kind === 'xtream' || this.view.kind === 'm3u'
      ? this.view.kind
      : this.view.kind === 'error'
        ? this.view.providerKind
        : null;

    if (!this.validBootstrap()) {
      this.view = { kind: 'error', providerKind, code: 'INVALID_BOOTSTRAP' };
      return;
    }

    if (this.deps.nowMs() >= this.bootstrap.expiresAtMs) {
      this.view = { kind: 'expired' };
      return;
    }

    if (providerKind === null) {
      this.view = { kind: 'error', providerKind: null, code: 'REQUIRED' };
      return;
    }

    const payload = providerKind === 'xtream'
      ? this.normalizedXtream()
      : this.normalizedM3u();
    if (payload === null) return;

    this.view = { kind: 'sending', providerKind };

    let envelope: PairingCiphertextV1;
    try {
      envelope = await this.deps.crypto.encryptForTv(
        this.bootstrap.tvPublicKey,
        encodePairingProviderPayload(payload),
      );
    } catch (error) {
      this.view = { kind: 'error', providerKind, code: cryptoErrorCode(error) };
      return;
    }

    try {
      await this.deps.relay.putCiphertext({
        sessionId: this.bootstrap.sessionId,
        ciphertext: JSON.stringify(envelope),
      });
    } catch (error) {
      this.view = { kind: 'error', providerKind, code: relayErrorCode(error) };
      return;
    }

    this.xtreamDraft = { serverUrl: '', username: '', password: '' };
    this.m3uDraft = { playlistUrl: '' };
    this.view = { kind: 'success' };
  }

  private validBootstrap(): boolean {
    if (
      this.bootstrap.version !== 1
      || typeof this.bootstrap.sessionId !== 'string'
      || this.bootstrap.sessionId.trim().length === 0
      || !Number.isFinite(this.bootstrap.expiresAtMs)
      || typeof this.bootstrap.relayBaseUrl !== 'string'
    ) {
      return false;
    }

    try {
      normalizePairingRelayBaseUrl(this.bootstrap.relayBaseUrl);
      return true;
    } catch {
      return false;
    }
  }

  private normalizedXtream(): PairingProviderPayloadV1 | null {
    const serverUrl = this.xtreamDraft.serverUrl.trim();
    const username = this.xtreamDraft.username.trim();
    const password = this.xtreamDraft.password.trim();

    if (!serverUrl || !username || !password) {
      this.view = { kind: 'xtream', input: { ...this.xtreamDraft }, error: 'REQUIRED' };
      return null;
    }

    return {
      version: 1,
      credential: { kind: 'xtream', serverUrl, username, password },
    };
  }

  private normalizedM3u(): PairingProviderPayloadV1 | null {
    const result = validateM3uEntry({ playlistUrl: this.m3uDraft.playlistUrl });
    if (!result.ok) {
      this.view = { kind: 'm3u', input: { ...this.m3uDraft }, error: result.code };
      return null;
    }

    return {
      version: 1,
      credential: result.credential,
    };
  }
}
