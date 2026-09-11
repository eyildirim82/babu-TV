export type PairingProviderPayloadV1 =
  | {
      version: 1;
      credential: {
        kind: 'xtream';
        serverUrl: string;
        username: string;
        password: string;
      };
    }
  | {
      version: 1;
      credential: {
        kind: 'm3u';
        playlistUrl: string;
      };
    };

const INVALID_PAYLOAD_MESSAGE = 'Pairing provider payload is invalid.';

function invalidPayload(): never {
  throw new Error(INVALID_PAYLOAD_MESSAGE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function encodePairingProviderPayload(payload: PairingProviderPayloadV1): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodePairingProviderPayload(bytes: Uint8Array): PairingProviderPayloadV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return invalidPayload();
  }

  if (!isRecord(parsed) || !exactKeys(parsed, ['version', 'credential']) || parsed.version !== 1) {
    return invalidPayload();
  }

  const credential = parsed.credential;
  if (!isRecord(credential) || typeof credential.kind !== 'string') return invalidPayload();

  if (credential.kind === 'xtream') {
    if (
      !exactKeys(credential, ['kind', 'serverUrl', 'username', 'password'])
      || typeof credential.serverUrl !== 'string'
      || typeof credential.username !== 'string'
      || typeof credential.password !== 'string'
    ) {
      return invalidPayload();
    }
    return {
      version: 1,
      credential: {
        kind: 'xtream',
        serverUrl: credential.serverUrl,
        username: credential.username,
        password: credential.password,
      },
    };
  }

  if (credential.kind === 'm3u') {
    if (!exactKeys(credential, ['kind', 'playlistUrl']) || typeof credential.playlistUrl !== 'string') {
      return invalidPayload();
    }
    return {
      version: 1,
      credential: { kind: 'm3u', playlistUrl: credential.playlistUrl },
    };
  }

  return invalidPayload();
}
