export const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;

export interface PairingSessionDescriptor {
  sessionId: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface PairingSessionDependencies {
  nowMs?: () => number;
  makeSessionId?: () => string;
}

export class PairingSessionManager<T> {
  private readonly nowMs: () => number;
  private readonly makeSessionId: () => string;

  constructor(dependencies: PairingSessionDependencies = {}) {
    this.nowMs = dependencies.nowMs ?? Date.now;
    this.makeSessionId = dependencies.makeSessionId ?? (() => {
      throw new Error('Pairing session randomness is unavailable.');
    });
  }

  create(_value: T, ttlMs = DEFAULT_PAIRING_TTL_MS): PairingSessionDescriptor {
    const createdAtMs = this.nowMs();

    return {
      sessionId: this.makeSessionId(),
      createdAtMs,
      expiresAtMs: createdAtMs + ttlMs,
    };
  }
}
