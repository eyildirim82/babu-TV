export interface PairingRelayCreateSessionRequest {
  sessionId: string;
  expiresAtMs: number;
}

export interface PairingRelayPutCiphertextRequest {
  sessionId: string;
  ciphertext: string;
}

export type PairingRelayPollResponse =
  | { status: 'pending' }
  | { status: 'ready'; ciphertext: string }
  | { status: 'expired' }
  | { status: 'consumed' };

export interface PairingRelayRequest {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
  timeoutMs: number;
}

export interface PairingRelayTransport {
  request<T>(request: PairingRelayRequest): Promise<T>;
}
