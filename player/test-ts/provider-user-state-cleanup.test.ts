import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderUserStateCleanup } from '../src/providers/provider-user-state-cleanup.js';

void test('provider user-state cleanup deletes watch before favorites for the target provider', async () => {
  const events: string[] = [];
  const cleanup = new ProviderUserStateCleanup(
    { async deleteProvider(providerId) { events.push(`watch:${providerId}`); } },
    { async deleteProvider(providerId) { events.push(`favorites:${providerId}`); } },
  );

  await cleanup.deleteProvider('p1');

  assert.deepEqual(events, ['watch:p1', 'favorites:p1']);
});

void test('provider user-state cleanup stops before favorites when watch cleanup fails', async () => {
  const failure = { kind: 'synthetic-watch-failure' };
  const events: string[] = [];
  const cleanup = new ProviderUserStateCleanup(
    {
      async deleteProvider(providerId) {
        events.push(`watch:${providerId}`);
        throw failure;
      },
    },
    { async deleteProvider(providerId) { events.push(`favorites:${providerId}`); } },
  );

  await assert.rejects(cleanup.deleteProvider('p1'), (error: unknown) => error === failure);
  assert.deepEqual(events, ['watch:p1']);
});

void test('provider user-state cleanup propagates favorites failure after one watch cleanup', async () => {
  const failure = { kind: 'synthetic-favorites-failure' };
  const events: string[] = [];
  const cleanup = new ProviderUserStateCleanup(
    { async deleteProvider(providerId) { events.push(`watch:${providerId}`); } },
    {
      async deleteProvider(providerId) {
        events.push(`favorites:${providerId}`);
        throw failure;
      },
    },
  );

  await assert.rejects(cleanup.deleteProvider('p1'), (error: unknown) => error === failure);
  assert.deepEqual(events, ['watch:p1', 'favorites:p1']);
});

void test('provider user-state cleanup never redirects deletion to another provider', async () => {
  const watchCalls: string[] = [];
  const favoriteCalls: string[] = [];
  const cleanup = new ProviderUserStateCleanup(
    { async deleteProvider(providerId) { watchCalls.push(providerId); } },
    { async deleteProvider(providerId) { favoriteCalls.push(providerId); } },
  );

  await cleanup.deleteProvider('p1');

  assert.deepEqual(watchCalls, ['p1']);
  assert.deepEqual(favoriteCalls, ['p1']);
  assert.equal(watchCalls.includes('p2'), false);
  assert.equal(favoriteCalls.includes('p2'), false);
});
