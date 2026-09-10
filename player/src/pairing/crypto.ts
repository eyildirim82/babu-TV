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

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
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

export async function generatePairingTvKeyPair(): Promise<PairingTvKeyPair> {
  const crypto = pairingCrypto();
  const keyPair = await generateEcdhKeyPair(crypto);
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  return {
    publicKey,
    privateKey: keyPair.privateKey,
  };
}

export async function encryptForPairingTv(
  tvPublicKey: JsonWebKey,
  plaintext: Uint8Array,
): Promise<PairingCiphertextV1> {
  const crypto = pairingCrypto();
  const importedTvPublicKey = await crypto.subtle.importKey(
    'jwk',
    tvPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const senderKeyPair = await generateEcdhKeyPair(crypto);
  const aesKey = await deriveAesKey(crypto, senderKeyPair.privateKey, importedTvPublicKey, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(PAIRING_IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: PAIRING_AAD },
    aesKey,
    copyBytes(plaintext),
  );
  const senderPublicKey = await crypto.subtle.exportKey('jwk', senderKeyPair.publicKey);

  return {
    version: 1,
    algorithm: PAIRING_ALGORITHM,
    senderPublicKey,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(encrypted)),
  };
}

export async function decryptPairingOnTv(
  tvPrivateKey: CryptoKey,
  envelope: PairingCiphertextV1,
): Promise<Uint8Array> {
  const crypto = pairingCrypto();
  const senderPublicKey = await crypto.subtle.importKey(
    'jwk',
    envelope.senderPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const aesKey = await deriveAesKey(crypto, tvPrivateKey, senderPublicKey, 'decrypt');
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(envelope.iv),
      additionalData: PAIRING_AAD,
    },
    aesKey,
    fromBase64Url(envelope.ciphertext),
  );

  return new Uint8Array(decrypted);
}
