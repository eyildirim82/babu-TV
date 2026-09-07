import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCredentialStore } from '../src/credentials/memory-credential-store.js';
import {
  CredentialStoreCapacityError,
  CredentialStoreOperationError,
  CredentialStoreUnavailableError,
  SamsungWidgetDataCredentialStore,
  type WidgetDataLike,
} from '../src/credentials/samsung-widgetdata-credential-store.js';

class FakeWidgetData implements WidgetDataLike {
  data: string | null = null;
  removeCalls = 0;
  failRead: unknown = null;
  failWriteWithPayloadEcho = false;
  failRemove: unknown = null;

  read(
    successCallback: (data: string) => void,
    errorCallback?: (error: unknown) => void,
  ): void {
    if (this.failRead !== null) {
      errorCallback?.(this.failRead);
      return;
    }
    if (this.data === null) {
      errorCallback?.({ name: 'NotFoundError' });
      return;
    }
    successCallback(this.data);
  }

  write(
    data: string,
    successCallback?: () => void,
    errorCallback?: (error: unknown) => void,
  ): void {
    if (this.failWriteWithPayloadEcho) {
      errorCallback?.(new Error(`native write failed for ${data}`));
      return;
    }
    this.data = data;
    successCallback?.();
  }

  remove(
    successCallback?: () => void,
    errorCallback?: (error: unknown) => void,
  ): void {
    this.removeCalls += 1;
    if (this.failRemove !== null) {
      errorCallback?.(this.failRemove);
      return;
    }
    if (this.data === null) {
      errorCallback?.({ name: 'NotFoundError' });
      return;
    }
    this.data = null;
    successCallback?.();
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

void test('WidgetData secure store keeps multiple provider credentials in one secure document', async () => {
  const widgetData = new FakeWidgetData();
  const store = new SamsungWidgetDataCredentialStore(widgetData);

  assert.equal(store.isAvailable(), true);

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

  assert.deepEqual(await store.load('provider-a'), {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo-user',
    password: 'demo-pass',
  });
  assert.equal((await store.load('provider-b'))?.kind, 'm3u');
  assert.equal(await store.load('provider-missing'), null);
});

void test('WidgetData secure store replaces one provider without losing another', async () => {
  const widgetData = new FakeWidgetData();
  const store = new SamsungWidgetDataCredentialStore(widgetData);

  await store.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo-user',
    password: 'demo-pass',
  });
  await store.save('provider-b', {
    kind: 'm3u',
    playlistUrl: 'https://example.com/b.m3u',
  });
  await store.save('provider-a', {
    kind: 'm3u',
    playlistUrl: 'https://example.com/replacement.m3u',
  });

  assert.equal((await store.load('provider-a'))?.kind, 'm3u');
  assert.equal((await store.load('provider-b'))?.kind, 'm3u');
});

void test('WidgetData secure store removes one provider while retaining the others', async () => {
  const widgetData = new FakeWidgetData();
  const store = new SamsungWidgetDataCredentialStore(widgetData);

  await store.save('provider-a', {
    kind: 'xtream',
    serverUrl: 'https://example.com',
    username: 'demo-user',
    password: 'demo-pass',
  });
  await store.save('provider-b', {
    kind: 'm3u',
    playlistUrl: 'https://example.com/b.m3u',
  });

  await store.remove('provider-a');

  assert.equal(await store.load('provider-a'), null);
  assert.equal((await store.load('provider-b'))?.kind, 'm3u');
  assert.equal(widgetData.removeCalls, 0);
});

void test('WidgetData secure store removes the secure document when the last provider is deleted', async () => {
  const widgetData = new FakeWidgetData();
  const store = new SamsungWidgetDataCredentialStore(widgetData);

  await store.save('provider-a', {
    kind: 'm3u',
    playlistUrl: 'https://example.com/a.m3u',
  });
  await store.remove('provider-a');

  assert.equal(widgetData.data, null);
  assert.equal(widgetData.removeCalls, 1);
  assert.equal(await store.load('provider-a'), null);
  await assert.doesNotReject(store.remove('provider-a'));
});

void test('unavailable WidgetData fails closed instead of persisting elsewhere', async () => {
  const store = new SamsungWidgetDataCredentialStore(null);

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

void test('WidgetData native failures never expose serialized credentials', async () => {
  const widgetData = new FakeWidgetData();
  widgetData.failWriteWithPayloadEcho = true;
  const store = new SamsungWidgetDataCredentialStore(widgetData);

  await assert.rejects(
    store.save('provider-a', {
      kind: 'xtream',
      serverUrl: 'https://example.com',
      username: 'demo-user',
      password: 'demo-pass',
    }),
    (error: unknown) => {
      assert.ok(error instanceof CredentialStoreOperationError);
      assert.equal(error.message.includes('demo-user'), false);
      assert.equal(error.message.includes('demo-pass'), false);
      assert.equal(error.message.includes('https://example.com'), false);
      return true;
    },
  );
});

void test('malformed WidgetData secure document fails with a sanitized load error', async () => {
  const widgetData = new FakeWidgetData();
  widgetData.data = '{not-json';
  const store = new SamsungWidgetDataCredentialStore(widgetData);

  await assert.rejects(store.load('provider-a'), CredentialStoreOperationError);
});

void test('WidgetData credential document enforces the documented 20000 character limit', async () => {
  const widgetData = new FakeWidgetData();
  const store = new SamsungWidgetDataCredentialStore(widgetData);

  await assert.rejects(
    store.save('provider-a', {
      kind: 'm3u',
      playlistUrl: `https://example.com/${'x'.repeat(20000)}`,
    }),
    CredentialStoreCapacityError,
  );
  assert.equal(widgetData.data, null);
});
