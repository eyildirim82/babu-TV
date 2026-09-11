import type { ProviderId } from '../domain/models.js';
import type { PairingCiphertextV1, PairingTvKeyPair } from './crypto.js';
import type { PairingSessionDescriptor } from './session.js';

export interface PairingTvCryptoPort {
  generateTvKeyPair(): Promise<PairingTvKeyPair>;
  decrypt(privateKey: CryptoKey, envelope: PairingCiphertextV1): Promise<Uint8Array>;
}

export interface PairingTvSessionPort<T> {
  create(value: T): PairingSessionDescriptor;
  consume(sessionId: string):
    | { status: 'ok'; value: T }
    | { status: 'missing' }
    | { status: 'expired' }
    | { status: 'consumed' };
}

export interface PairingTvRelayPort {
  createSession(request: { sessionId: string; expiresAtMs: number }): Promise<void>;
  poll(sessionId: string): Promise<
    | { status: 'pending' }
    | { status: 'ready'; ciphertext: string }
    | { status: 'expired' }
    | { status: 'consumed' }
  >;
}

export interface PairingTvOnboardingPort {
  connectXtream(input: {
    serverUrl: string;
    username: string;
    password: string;
  }): Promise<{ providerId: ProviderId }>;
  connectM3u(input: {
    playlistUrl: string;
  }): Promise<{ ok: true; providerId: ProviderId } | { ok: false }>;
}

export interface PairingTvBootstrapV1 {
  version: 1;
  sessionId: string;
  expiresAtMs: number;
  tvPublicKey: JsonWebKey;
  relayBaseUrl: string;
}

export type PairingTvPollResult =
  | { status: 'pending' }
  | { status: 'completed'; providerId: ProviderId }
  | { status: 'expired' }
  | { status: 'consumed' }
  | { status: 'error'; code: 'INVALID_PAYLOAD' | 'UNAVAILABLE' };

export interface PairingTvSessionValue {
  privateKey: CryptoKey;
}

export interface PairingTvControllerDependencies {
  crypto: PairingTvCryptoPort;
  sessions: PairingTvSessionPort<PairingTvSessionValue>;
  relay: PairingTvRelayPort;
  onboarding: PairingTvOnboardingPort;
  relayBaseUrl: string;
}

export class PairingTvError extends Error {
  readonly code = 'UNAVAILABLE' as const;

  constructor() {
    super('TV pairing is unavailable.');
    this.name = 'PairingTvError';
  }
}

export class PairingTvController {
  constructor(private readonly deps: PairingTvControllerDependencies) {}

  async start(): Promise<PairingTvBootstrapV1> {
    try {
      const keyPair = await this.deps.crypto.generateTvKeyPair();
      const session = this.deps.sessions.create({ privateKey: keyPair.privateKey });
      await this.deps.relay.createSession({
        sessionId: session.sessionId,
        expiresAtMs: session.expiresAtMs,
      });

      return {
        version: 1,
        sessionId: session.sessionId,
        expiresAtMs: session.expiresAtMs,
        tvPublicKey: keyPair.publicKey,
        relayBaseUrl: this.deps.relayBaseUrl,
      };
    } catch {
      throw new PairingTvError();
    }
  }

  async poll(sessionId: string): Promise<PairingTvPollResult> {
    let relayResult: Awaited<ReturnType<PairingTvRelayPort['poll']>>;
    try {
      relayResult = await this.deps.relay.poll(sessionId);
    } catch {
      return { status: 'error', code: 'UNAVAILABLE' };
    }

    if (relayResult.status !== 'ready') {
      return relayResult;
    }

    const session = this.deps.sessions.consume(sessionId);
    if (session.status === 'expired' || session.status === 'consumed') {
      return { status: session.status };
    }
    if (session.status === 'missing') {
      return { status: 'error', code: 'UNAVAILABLE' };
    }

    let envelope: PairingCiphertextV1;
    try {
      envelope = JSON.parse(relayResult.ciphertext) as PairingCiphertextV1;
    } catch {
      return { status: 'error', code: 'INVALID_PAYLOAD' };
    }

    try {
      await this.deps.crypto.decrypt(session.value.privateKey, envelope);
    } catch {
      return { status: 'error', code: 'INVALID_PAYLOAD' };
    }

    return { status: 'error', code: 'INVALID_PAYLOAD' };
  }
}
