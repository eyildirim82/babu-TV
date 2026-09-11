import {
  decryptPairingOnTv,
  generatePairingTvKeyPair,
} from './crypto.js';
import type { PairingRelayClient } from './relay-client.js';
import { PairingSessionManager } from './session.js';
import {
  PairingTvController,
  type PairingTvOnboardingPort,
  type PairingTvSessionValue,
} from './tv-controller.js';

export interface CreateTvPairingCoreInput {
  relay: PairingRelayClient;
  relayBaseUrl: string;
  onboarding: PairingTvOnboardingPort;
  sessions?: PairingSessionManager<PairingTvSessionValue>;
}

export function createTvPairingCore(
  input: CreateTvPairingCoreInput,
): PairingTvController {
  return new PairingTvController({
    crypto: {
      generateTvKeyPair: generatePairingTvKeyPair,
      decrypt: decryptPairingOnTv,
    },
    sessions: input.sessions ?? new PairingSessionManager<PairingTvSessionValue>(),
    relay: input.relay,
    onboarding: input.onboarding,
    relayBaseUrl: input.relayBaseUrl,
  });
}
