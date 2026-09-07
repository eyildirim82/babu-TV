import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import {
  CredentialStoreUnavailableError,
  TizenKeyManagerCredentialStore,
  type KeyManagerLike,
} from '../src/credentials/tizen-keymanager-credential-store.js';

class FakeKeyManager implements KeyManagerLike {
  readonly data = new Map<string, string>();
  failSaveWithCredentialEcho = false;

  saveData(
    name: string,
    data: string,
    _password: string | null,
    successCallback?: () => void,
    errorCallback?: (error: unknown) => void,
  ): void {
    if (this.failSaveWithCredentialEcho) {
      errorCallback?.(new Error(`storage failed for ${data}`));
      return;
    }
    this.data.set(name, data);
    successCallback?.();
  }

  getData(alias: string): { rawData?: string } | null {
    const rawData = this.data.get(alias);
    if (rawData === undefined) throw new Error('NotFoundError');
    return { rawData };
  }

  removeData(alias: string): void {
    if (!this.data.delete(alias)) throw new Error('NotFoundError');
  }
}

void test('memory credential store isolates credentials by provider', async () => {
  const store = new MemoryCredentialStore();
  await store.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo-user',
    password: 'demo-pass',
  });
  await store.save('provider-b', {
    kind: 'm3u',
    playlistUrl: 'https://example.com/demo.m3u?username=demo-user&password=demo-pass',
  });

  assert.deepEqual(await store.load('provider-a'), {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo-user',
    password: 'demo-pass',
  });
  assert.equal((await store.load('provider-b'))?.kind, 'm3u');
  assert.equal(await store.load('provider-missing'), null);
});

void test('memory credential store removes only the selected provider', async () => {
  const store = new MemoryCredentialStore();
  await store.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo-user',
    password: 'demo-pass',
  });
  await store.save('provider-b', {
    kind: 'm3u',
    playlistUrl: 'https://example.com/demo.m3u',
  });

  await store.remove('provider-a');

  assert.equal(await store.load('provider-a'), null);
  assert.equal((await store.load('provider-b'))?.kind, 'm3u');
});

void test('Tizen KeyManager credential store saves loads replaces and removes provider data', async () => {
  const keyManager = new FakeKeyManager();
  const store = new TizenKeyManagerCredentialStore(keyManager);

  assert.equal(store.isAvailable(), true);

  await store.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo-user',
    password: 'demo-pass',
  });
  assert.deepEqual(await store.load('provider-a'), {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo-user',
    password: 'demo-pass',
  });

  await store.save('provider-a', {
    kind: 'm3u',
    playlistUrl: 'https://example.com/replacement.m3u',
  });
  assert.equal((await store.load('provider-a'))?.kind, 'm3u');
  assert.equal(keyManager.data.size, 1);

  await store.remove('provider-a');
  assert.equal(await store.load('provider-a'), null);
  assert.equal(keyManager.data.size, 0);
});

void test('Tizen KeyManager credential store treats removal of a missing alias as idempotent', async () => {
  const store = new TizenKeyManagerCredentialStore(new FakeKeyManager());
  await assert.doesNotReject(store.remove('provider-missing'));
});

void test('unavailable KeyManager fails closed instead of persisting elsewhere', async () => {
  const store = new TizenKeyManagerCredentialStore(null);

  assert.equal(store.isAvailable(), false);
  await assert.rejects(
    store.save('provider-a', {
      kind: 'm3u',
      playlistUrl: 'https://example.com/demo.m3u',
    }),
    CredentialStoreUnavailableError,
  );
  await assert.rejects(store.load('provider-a'), CredentialStoreUnavailableError);
  await assert.rejects(store.remove('provider-a'), CredentialStoreUnavailableError);
});

void test('KeyManager failures never expose serialized credentials', async () => {
  const keyManager = new FakeKeyManager();
  keyManager.failSaveWithCredentialEcho = true;
  const store = new TizenKeyManagerCredentialStore(keyManager);

  await assert.rejects(
    store.save('provider-a', {
      kind: 'xtream',
      serverUrl: 'https://example.com',
      username: 'demo-user',
      password: 'demo-pass',
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes('demo-user'), false);
      assert.equal(error.message.includes('demo-pass'), false);
      assert.equal(error.message.includes('https://example.com'), false);
      return true;
    },
  );
});
