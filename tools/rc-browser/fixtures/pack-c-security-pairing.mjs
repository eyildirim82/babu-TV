import { webcrypto } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  RC_ENDPOINTS,
  RC_SECRET_CANARIES,
  RC_SECRETS,
} from './common.mjs';

export const PAIRING_BROWSER_CONFIG = Object.freeze({
  relayBaseUrl: RC_ENDPOINTS.relay,
  phoneBaseUrl: RC_ENDPOINTS.phone,
  relayTimeoutMs: 1_000,
  pollIntervalMs: 40,
});

export const XTREAM_ERROR_CASES = Object.freeze([
  Object.freeze({ id: '401', mode: 'http-401', expected: 'Kullanıcı adı veya şifre hatalı.' }),
  Object.freeze({ id: '403', mode: 'http-403', expected: 'Kullanıcı adı veya şifre hatalı.' }),
  Object.freeze({ id: '404', mode: 'http-404', expected: 'Sunucu kaynağı bulunamadı.' }),
  Object.freeze({ id: '500', mode: 'http-500', expected: 'Sunucu geçici bir hata döndürdü.' }),
  Object.freeze({ id: 'transport', mode: 'transport-failure', expected: 'Sunucuya ulaşılamadı.' }),
  Object.freeze({ id: 'malformed', mode: 'malformed', expected: 'Sunucu yanıtı desteklenmiyor.' }),
]);

export const PAIRING_STATE_CASES = Object.freeze([
  Object.freeze({
    id: 'relay-unavailable',
    operation: 'create',
    mode: 'http-500',
    expected: 'Telefonla eşleştirme şu anda kullanılamıyor.',
  }),
  Object.freeze({
    id: 'expired',
    operation: 'poll',
    mode: 'expired',
    expected: 'Eşleştirme süresi doldu.',
  }),
  Object.freeze({
    id: 'consumed',
    operation: 'poll',
    mode: 'consumed',
    expected: 'Bu eşleştirme kodu daha önce kullanılmış.',
  }),
  Object.freeze({
    id: 'malformed',
    operation: 'poll',
    mode: 'malformed',
    expected: 'Telefonla eşleştirme tamamlanamadı.',
  }),
]);

export const PHONE_ROUTE_RESULT = Object.freeze({
  status: 'NOT-AVAILABLE',
  reason: 'no production browser route',
});

export function assertNoCanaryText(value, category = 'value') {
  let serialized;
  try {
    serialized = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    serialized = String(value);
  }
  if (RC_SECRET_CANARIES.some((canary) => canary && serialized.includes(canary))) {
    throw new Error(`${category}: synthetic secret canary leaked`);
  }
}

export async function installPairingBrowserConfig(context, overrides = {}) {
  const config = { ...PAIRING_BROWSER_CONFIG, ...overrides };
  await context.addInitScript((value) => {
    globalThis.BABUSTV_PAIRING_CONFIG = value;
    try {
      localStorage.setItem('en_last_seen_version', '1.10.1');
    } catch {
      // Ignore browser-storage availability; the application handles this too.
    }
  }, config);
}

export async function installPairingPublicKeyProbe(context) {
  await context.addInitScript(() => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    const prototype = Object.getPrototypeOf(subtle);
    const original = prototype.exportKey;
    if (typeof original !== 'function' || prototype.__rcPairingWrapped) return;
    Object.defineProperty(prototype, '__rcPairingWrapped', { value: true });
    prototype.exportKey = async function exportKey(format, key) {
      const exported = await original.call(this, format, key);
      if (
        format === 'jwk'
        && key?.type === 'public'
        && key?.algorithm?.name === 'ECDH'
        && key?.algorithm?.namedCurve === 'P-256'
      ) {
        globalThis.__rcPairingTvPublicKey = JSON.parse(JSON.stringify(exported));
      }
      return exported;
    };
  });
}

export async function readPairingTvPublicKey(page) {
  return page.evaluate(() => globalThis.__rcPairingTvPublicKey ?? null);
}

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

export async function encryptXtreamPayloadForTv(tvPublicKey) {
  if (!tvPublicKey || typeof tvPublicKey !== 'object') {
    throw new Error('pairing public key unavailable');
  }

  const importedTvPublicKey = await webcrypto.subtle.importKey(
    'jwk',
    tvPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sender = await webcrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
  const aesKey = await webcrypto.subtle.deriveKey(
    { name: 'ECDH', public: importedTvPublicKey },
    sender.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode('babustv-pairing-v1');
  const plaintext = new TextEncoder().encode(JSON.stringify({
    version: 1,
    credential: {
      kind: 'xtream',
      serverUrl: RC_ENDPOINTS.xtreamA,
      username: RC_SECRETS.xtreamUsername,
      password: RC_SECRETS.xtreamPassword,
    },
  }));
  const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    aesKey,
    plaintext,
  ));
  const senderPublicKey = await webcrypto.subtle.exportKey('jwk', sender.publicKey);

  const envelope = {
    version: 1,
    algorithm: 'ECDH-P256+A256GCM',
    senderPublicKey,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext),
  };
  assertNoCanaryText(envelope, 'pairing ciphertext envelope');
  return envelope;
}

const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.html', '.css', '.xml', '.md', '.yml', '.yaml',
]);

async function walkTextFiles(root) {
  let info;
  try {
    info = await stat(root);
  } catch {
    return [];
  }
  if (!info.isDirectory()) return [];

  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...await walkTextFiles(fullPath));
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      output.push(fullPath);
    }
  }
  return output;
}

export async function scanGeneratedOutputForCanaries(roots = ['player/dist', 'tizen/build']) {
  const leaks = [];
  for (const root of roots) {
    for (const filePath of await walkTextFiles(root)) {
      const content = await readFile(filePath, 'utf8');
      if (RC_SECRET_CANARIES.some((canary) => canary && content.includes(canary))) {
        leaks.push(filePath.replaceAll('\\', '/'));
      }
    }
  }
  return leaks.sort();
}
