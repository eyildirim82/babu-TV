const PAIRING_ALGORITHM = 'ECDH-P256+A256GCM' as const;
const PAIRING_AAD = new TextEncoder().encode('babustv-pairing-v1');
const PAIRING_IV_BYTES = 12;

export type PairingCryptoErrorCode = 'UNAVAILABLE' | 'INVALID_KEY' | 'INVALID_PAYLOAD';

export class PairingCryptoError extends Error {
  constructor(public readonly code: PairingCryptoErrorCode) {
    super(code === 'UNAVAILABLE' ? 'Pairing cryptography is unavailable.' : 'Pairing payload is invalid.');
    this.name = 'PairingCryptoError';
  }
}

export interface PairingTvKeyPair {
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
}

export interface PairingCiphertextV1 {
  version: 1;
  algorithm: typeof PAIRING_ALGORITHM;
  senderPublicKey: JsonWebKey;
  iv: string;
  ciphertext: string;
}

function pairingCrypto(): Crypto {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new PairingCryptoError('UNAVAILABLE');
  }
  return crypto;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: unknown): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 4 === 1
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new PairingCryptoError('INVALID_PAYLOAD');
  }

  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    if (toBase64Url(bytes) !== value) {
      throw new PairingCryptoError('INVALID_PAYLOAD');
    }
    return bytes;
  } catch (error) {
    if (error instanceof PairingCryptoError) {
      throw error;
    }
    throw new PairingCryptoError('INVALID_PAYLOAD');
  }
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

function isPublicP256Jwk(value: unknown): value is JsonWebKey {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const key = value as JsonWebKey;
  return key.kty === 'EC'
    && key.crv === 'P-256'
    && typeof key.x === 'string'
    && key.x.length > 0
    && typeof key.y === 'string'
    && key.y.length > 0
    && key.d === undefined;
}

function assertNonExtractable(key: CryptoKey): void {
  if (key.extractable) {
    throw new PairingCryptoError('UNAVAILABLE');
  }
}

async function generateEcdhKeyPair(crypto: Crypto): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey'],
  ) as Promise<CryptoKeyPair>;
}

async function deriveAesKey(
  crypto: Crypto,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  usage: KeyUsage,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

function throwSanitized(error: unknown, code: PairingCryptoErrorCode): never {
  if (error instanceof PairingCryptoError) {
    throw error;
  }
  throw new PairingCryptoError(code);
}

export async function generatePairingTvKeyPair(): Promise<PairingTvKeyPair> {
  const crypto = pairingCrypto();

  try {
    const keyPair = await generateEcdhKeyPair(crypto);
    assertNonExtractable(keyPair.privateKey);
    const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    if (!isPublicP256Jwk(publicKey)) {
      throw new PairingCryptoError('UNAVAILABLE');
    }

    return {
      publicKey,
      privateKey: keyPair.privateKey,
    };
  } catch (error) {
    throwSanitized(error, 'UNAVAILABLE');
  }
}

export async function encryptForPairingTv(
  tvPublicKey: JsonWebKey,
  plaintext: Uint8Array,
): Promise<PairingCiphertextV1> {
  const crypto = pairingCrypto();
  if (!isPublicP256Jwk(tvPublicKey)) {
    throw new PairingCryptoError('INVALID_KEY');
  }

  let importedTvPublicKey: CryptoKey;
  try {
    importedTvPublicKey = await crypto.subtle.importKey(
      'jwk',
      tvPublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
  } catch (error) {
    throwSanitized(error, 'INVALID_KEY');
  }

  try {
    const senderKeyPair = await generateEcdhKeyPair(crypto);
    assertNonExtractable(senderKeyPair.privateKey);
    const aesKey = await deriveAesKey(
      crypto,
      senderKeyPair.privateKey,
      importedTvPublicKey,
      'encrypt',
    );
    assertNonExtractable(aesKey);

    const iv = crypto.getRandomValues(new Uint8Array(PAIRING_IV_BYTES));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: PAIRING_AAD },
      aesKey,
      copyBytes(plaintext),
    );
    const senderPublicKey = await crypto.subtle.exportKey('jwk', senderKeyPair.publicKey);
    if (!isPublicP256Jwk(senderPublicKey)) {
      throw new PairingCryptoError('UNAVAILABLE');
    }

    return {
      version: 1,
      algorithm: PAIRING_ALGORITHM,
      senderPublicKey,
      iv: toBase64Url(iv),
      ciphertext: toBase64Url(new Uint8Array(encrypted)),
    };
  } catch (error) {
    throwSanitized(error, 'UNAVAILABLE');
  }
}

export async function decryptPairingOnTv(
  tvPrivateKey: CryptoKey,
  envelope: PairingCiphertextV1,
): Promise<Uint8Array> {
  const crypto = pairingCrypto();
  const candidate = envelope as unknown as Record<string, unknown> | null;
  if (
    typeof candidate !== 'object'
    || candidate === null
    || candidate.version !== 1
    || candidate.algorithm !== PAIRING_ALGORITHM
    || !isPublicP256Jwk(candidate.senderPublicKey)
  ) {
    throw new PairingCryptoError('INVALID_PAYLOAD');
  }

  const iv = fromBase64Url(candidate.iv);
  if (iv.length !== PAIRING_IV_BYTES) {
    throw new PairingCryptoError('INVALID_PAYLOAD');
  }
  const ciphertext = fromBase64Url(candidate.ciphertext);

  try {
    const senderPublicKey = await crypto.subtle.importKey(
      'jwk',
      candidate.senderPublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const aesKey = await deriveAesKey(crypto, tvPrivateKey, senderPublicKey, 'decrypt');
    assertNonExtractable(aesKey);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: PAIRING_AAD,
      },
      aesKey,
      ciphertext,
    );

    return new Uint8Array(decrypted);
  } catch (error) {
    if (error instanceof PairingCryptoError && error.code === 'UNAVAILABLE') {
      throw new PairingCryptoError('INVALID_PAYLOAD');
    }
    throwSanitized(error, 'INVALID_PAYLOAD');
  }
}
