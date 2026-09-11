import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PairingCryptoError,
  decryptPairingOnTv,
  encryptForPairingTv,
  generatePairingTvKeyPair,
  type PairingCiphertextV1,
  type PairingCryptoErrorCode,
} from '../src/pairing/crypto.js';

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function flipFirstByte(value: string): string {
  const bytes = decodeBase64Url(value);
  assert.ok(bytes.length > 0);
  bytes[0] ^= 0x01;
  return encodeBase64Url(bytes);
}

async function assertPairingError(
  code: PairingCryptoErrorCode,
  action: () => Promise<unknown>,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof PairingCryptoError);
    assert.equal(error.code, code);
    assert.equal(
      error.message,
      code === 'UNAVAILABLE'
        ? 'Pairing cryptography is unavailable.'
        : 'Pairing payload is invalid.',
    );
    return true;
  });
}

void test('PAIR-C round trips opaque bytes with ephemeral authenticated encryption', async () => {
  const tv = await generatePairingTvKeyPair();
  const plaintext = new TextEncoder().encode('synthetic pairing payload');

  const envelope = await encryptForPairingTv(tv.publicKey, plaintext);
  const decrypted = await decryptPairingOnTv(tv.privateKey, envelope);

  assert.equal(new TextDecoder().decode(decrypted), 'synthetic pairing payload');
  assert.equal(envelope.version, 1);
  assert.equal(envelope.algorithm, 'ECDH-P256+A256GCM');
});

void test('PAIR-C keeps private keys non-extractable and exposes only public JWK material', async () => {
  const tv = await generatePairingTvKeyPair();
  const envelope = await encryptForPairingTv(
    tv.publicKey,
    new TextEncoder().encode('opaque bytes'),
  );

  assert.equal(tv.privateKey.extractable, false);
  await assert.rejects(() => globalThis.crypto.subtle.exportKey('jwk', tv.privateKey));
  assert.equal(tv.publicKey.d, undefined);
  assert.equal(envelope.senderPublicKey.d, undefined);
  assert.equal(envelope.senderPublicKey.kty, 'EC');
  assert.equal(envelope.senderPublicKey.crv, 'P-256');
});

void test('PAIR-C envelope is minimal, uses a 12-byte IV, and contains no plaintext or secret fields', async () => {
  const tv = await generatePairingTvKeyPair();
  const plaintextText = 'synthetic pairing payload';
  const envelope = await encryptForPairingTv(
    tv.publicKey,
    new TextEncoder().encode(plaintextText),
  );

  assert.deepEqual(Object.keys(envelope).sort(), [
    'algorithm',
    'ciphertext',
    'iv',
    'senderPublicKey',
    'version',
  ]);
  assert.equal(decodeBase64Url(envelope.iv).length, 12);

  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes(plaintextText), false);
  for (const forbidden of ['privateKey', 'plaintext', 'password', 'token', 'username', 'url']) {
    assert.equal(new RegExp(`"${forbidden}"\\s*:`, 'i').test(serialized), false);
  }
});

void test('PAIR-C uses fresh sender material and IVs for repeated encryption', async () => {
  const tv = await generatePairingTvKeyPair();
  const plaintext = new TextEncoder().encode('same opaque bytes');

  const first = await encryptForPairingTv(tv.publicKey, plaintext);
  const second = await encryptForPairingTv(tv.publicKey, plaintext);

  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notDeepEqual(first.senderPublicKey, second.senderPublicKey);
});

void test('PAIR-C rejects ciphertext and IV tampering with sanitized INVALID_PAYLOAD', async () => {
  const tv = await generatePairingTvKeyPair();
  const envelope = await encryptForPairingTv(
    tv.publicKey,
    new TextEncoder().encode('tamper target'),
  );

  await assertPairingError('INVALID_PAYLOAD', () => decryptPairingOnTv(tv.privateKey, {
    ...envelope,
    ciphertext: flipFirstByte(envelope.ciphertext),
  }));

  await assertPairingError('INVALID_PAYLOAD', () => decryptPairingOnTv(tv.privateKey, {
    ...envelope,
    iv: flipFirstByte(envelope.iv),
  }));
});

void test('PAIR-C rejects a different TV private key with sanitized INVALID_PAYLOAD', async () => {
  const intendedTv = await generatePairingTvKeyPair();
  const otherTv = await generatePairingTvKeyPair();
  const envelope = await encryptForPairingTv(
    intendedTv.publicKey,
    new TextEncoder().encode('wrong-key target'),
  );

  await assertPairingError('INVALID_PAYLOAD', () => decryptPairingOnTv(otherTv.privateKey, envelope));
});

void test('PAIR-C rejects malformed envelope version, algorithm, IV, and sender key', async () => {
  const tv = await generatePairingTvKeyPair();
  const envelope = await encryptForPairingTv(
    tv.publicKey,
    new TextEncoder().encode('malformed target'),
  );

  await assertPairingError('INVALID_PAYLOAD', () => decryptPairingOnTv(
    tv.privateKey,
    { ...envelope, version: 2 } as unknown as PairingCiphertextV1,
  ));
  await assertPairingError('INVALID_PAYLOAD', () => decryptPairingOnTv(
    tv.privateKey,
    { ...envelope, algorithm: 'OTHER' } as unknown as PairingCiphertextV1,
  ));
  await assertPairingError('INVALID_PAYLOAD', () => decryptPairingOnTv(
    tv.privateKey,
    { ...envelope, iv: 'AQ' },
  ));
  await assertPairingError('INVALID_PAYLOAD', () => decryptPairingOnTv(
    tv.privateKey,
    { ...envelope, iv: '***' },
  ));
  await assertPairingError('INVALID_PAYLOAD', () => decryptPairingOnTv(tv.privateKey, {
    ...envelope,
    senderPublicKey: {
      kty: 'EC',
      crv: 'P-256',
      x: 'invalid',
      y: 'invalid',
    },
  }));
  await assertPairingError('INVALID_PAYLOAD', () => decryptPairingOnTv(tv.privateKey, {
    ...envelope,
    senderPublicKey: {
      ...envelope.senderPublicKey,
      d: 'private-material-must-not-be-accepted',
    },
  }));
});

void test('PAIR-C rejects malformed TV public keys with sanitized INVALID_KEY', async () => {
  await assertPairingError('INVALID_KEY', () => encryptForPairingTv(
    {
      kty: 'EC',
      crv: 'P-256',
      x: 'invalid',
      y: 'invalid',
    },
    new TextEncoder().encode('opaque bytes'),
  ));
});

void test('PAIR-C performs crypto operations without console logging payload or key material', async () => {
  const calls: unknown[][] = [];
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const capture = (...args: unknown[]): void => {
    calls.push(args);
  };

  console.log = capture;
  console.info = capture;
  console.warn = capture;
  console.error = capture;
  try {
    const tv = await generatePairingTvKeyPair();
    const envelope = await encryptForPairingTv(
      tv.publicKey,
      new TextEncoder().encode('do-not-log-this-plaintext'),
    );
    await decryptPairingOnTv(tv.privateKey, envelope);
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  }

  assert.deepEqual(calls, []);
});
