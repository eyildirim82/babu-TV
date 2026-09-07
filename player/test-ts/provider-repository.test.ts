import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderRecord } from '../src/domain/models.js';
import {
  MemoryProviderRepository,
  UnknownProviderError,
} from '../src/repository/memory-provider-repository.js';

function provider(
  id: string,
  kind: 'xtream' | 'm3u' = 'xtream',
  name = id,
): ProviderRecord {
  return {
    id,
    kind,
    name,
    createdAtMs: 1_788_806_400_000,
    lastSuccessfulSyncAtMs: null,
  };
}

void test('provider repository stores multiple non-secret provider records', async () => {
  const repository = new MemoryProviderRepository();
  await repository.saveProvider(provider('provider-a', 'xtream', 'Main'));
  await repository.saveProvider(provider('provider-b', 'm3u', 'Backup'));

  assert.deepEqual(await repository.listProviders(), [
    provider('provider-a', 'xtream', 'Main'),
    provider('provider-b', 'm3u', 'Backup'),
  ]);
  assert.deepEqual(await repository.getProvider('provider-a'), provider('provider-a', 'xtream', 'Main'));
  assert.equal(await repository.getProvider('provider-missing'), null);
});

void test('provider repository strips credential-shaped extra fields at its persistence boundary', async () => {
  const repository = new MemoryProviderRepository();
  const unsafeInput = {
    ...provider('provider-a'),
    serverUrl: 'https://example.com',
    playlistUrl: 'https://example.com/demo.m3u',
    username: 'demo-user',
    password: 'demo-pass',
  } as ProviderRecord;

  await repository.saveProvider(unsafeInput);
  const stored = await repository.getProvider('provider-a');

  assert.deepEqual(stored, provider('provider-a'));
  assert.equal(Object.hasOwn(stored ?? {}, 'serverUrl'), false);
  assert.equal(Object.hasOwn(stored ?? {}, 'playlistUrl'), false);
  assert.equal(Object.hasOwn(stored ?? {}, 'username'), false);
  assert.equal(Object.hasOwn(stored ?? {}, 'password'), false);
});

void test('provider repository keeps exactly one active provider and supports switching', async () => {
  const repository = new MemoryProviderRepository();
  await repository.saveProvider(provider('provider-a'));
  await repository.saveProvider(provider('provider-b', 'm3u'));

  assert.equal(await repository.getActiveProviderId(), null);

  await repository.setActiveProviderId('provider-a');
  assert.equal(await repository.getActiveProviderId(), 'provider-a');

  await repository.setActiveProviderId('provider-b');
  assert.equal(await repository.getActiveProviderId(), 'provider-b');

  await repository.setActiveProviderId(null);
  assert.equal(await repository.getActiveProviderId(), null);
});

void test('provider repository rejects an unknown active provider ID', async () => {
  const repository = new MemoryProviderRepository();

  await assert.rejects(
    repository.setActiveProviderId('provider-missing'),
    (error: unknown) => error instanceof UnknownProviderError
      && error.providerId === 'provider-missing',
  );
  assert.equal(await repository.getActiveProviderId(), null);
});

void test('removing the active provider clears active state without touching other providers', async () => {
  const repository = new MemoryProviderRepository();
  await repository.saveProvider(provider('provider-a'));
  await repository.saveProvider(provider('provider-b', 'm3u'));
  await repository.setActiveProviderId('provider-a');

  await repository.removeProvider('provider-a');

  assert.equal(await repository.getProvider('provider-a'), null);
  assert.deepEqual(await repository.getProvider('provider-b'), provider('provider-b', 'm3u'));
  assert.equal(await repository.getActiveProviderId(), null);
});

void test('saving an existing provider replaces its metadata without changing active identity', async () => {
  const repository = new MemoryProviderRepository();
  await repository.saveProvider(provider('provider-a', 'xtream', 'Old name'));
  await repository.setActiveProviderId('provider-a');

  const updated: ProviderRecord = {
    ...provider('provider-a', 'xtream', 'New name'),
    lastSuccessfulSyncAtMs: 1_788_806_460_000,
  };
  await repository.saveProvider(updated);

  assert.deepEqual(await repository.getProvider('provider-a'), updated);
  assert.equal(await repository.getActiveProviderId(), 'provider-a');
});
