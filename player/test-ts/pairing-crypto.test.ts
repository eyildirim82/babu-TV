import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptPairingOnTv,
  encryptForPairingTv,
  generatePairingTvKeyPair,
} from '../src/pairing/crypto.js';

void test('PAIR-C round trips opaque bytes with ephemeral authenticated encryption', async () => {
  const tv = await generatePairingTvKeyPair();
  const plaintext = new TextEncoder().encode('synthetic pairing payload');

  const envelope = await encryptForPairingTv(tv.publicKey, plaintext);
  const decrypted = await decryptPairingOnTv(tv.privateKey, envelope);

  assert.equal(new TextDecoder().decode(decrypted), 'synthetic pairing payload');
  assert.equal(envelope.version, 1);
});
