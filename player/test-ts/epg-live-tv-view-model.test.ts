import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, EpgProgram } from '../src/domain/models.js';
import type { EpgQuery } from '../src/epg/contracts.js';
import { buildEpgLiveTvViewModel } from '../src/live-tv/epg-live-tv-view-model.js';

function channel(id: string): Channel {
  return {
    providerId: 'provider-1',
    id,
    name: `Channel ${id}`,
    categoryId: null,
    logoUrl: null,
    number: null,
  };
}

function program(channelId: string, title: string): EpgProgram {
  return {
    channelId,
    startMs: 1_000,
    endMs: 2_000,
    title,
    description: `${title} description`,
  };
}

function query(overrides: Partial<Pick<EpgQuery, 'getCurrent' | 'getNext'>> = {}): Pick<EpgQuery, 'getCurrent' | 'getNext'> {
  return {
    async getCurrent(_providerId, channelId) {
      return program(channelId, `Current ${channelId}`);
    },
    async getNext(_providerId, channelId) {
      return program(channelId, `Next ${channelId}`);
    },
    ...overrides,
  };
}

void test('projects current EPG in visible channel order and selected detail from highlighted stable ID', async () => {
  const currentCalls: string[] = [];
  const nextCalls: string[] = [];
  const epg = query({
    async getCurrent(providerId, channelId, atMs) {
      currentCalls.push(`${providerId}:${channelId}:${atMs}`);
      return program(channelId, `Current ${channelId}`);
    },
    async getNext(providerId, channelId, atMs) {
      nextCalls.push(`${providerId}:${channelId}:${atMs}`);
      return program(channelId, `Next ${channelId}`);
    },
  });

  const model = await buildEpgLiveTvViewModel({
    providerId: 'provider-1',
    visibleChannels: [channel('b'), channel('a')],
    highlightedChannelId: 'a',
    atMs: 1_500,
    query: epg,
  });

  assert.deepEqual(model.channelContext.map((entry) => entry.channelId), ['b', 'a']);
  assert.equal(model.channelContext[0]?.current.status, 'available');
  assert.equal(model.channelContext[1]?.current.status, 'available');
  assert.equal(model.selected?.channelId, 'a');
  assert.equal(model.selected?.current.status, 'available');
  assert.equal(model.selected?.current.status === 'available' ? model.selected.current.program.title : null, 'Current a');
  assert.equal(model.selected?.next.status, 'available');
  assert.equal(model.selected?.next.status === 'available' ? model.selected.next.program.title : null, 'Next a');
  assert.deepEqual(currentCalls, ['provider-1:b:1500', 'provider-1:a:1500']);
  assert.deepEqual(nextCalls, ['provider-1:a:1500']);
});

void test('represents missing current and next EPG without removing the selected channel', async () => {
  const model = await buildEpgLiveTvViewModel({
    providerId: 'provider-1',
    visibleChannels: [channel('a')],
    highlightedChannelId: 'a',
    atMs: 1_500,
    query: query({
      async getCurrent() { return null; },
      async getNext() { return null; },
    }),
  });

  assert.deepEqual(model.channelContext, [{ channelId: 'a', current: { status: 'missing' } }]);
  assert.deepEqual(model.selected, {
    channelId: 'a',
    current: { status: 'missing' },
    next: { status: 'missing' },
  });
});

void test('isolates current EPG query failure per channel and degrades selected next failure', async () => {
  const model = await buildEpgLiveTvViewModel({
    providerId: 'provider-1',
    visibleChannels: [channel('bad'), channel('good')],
    highlightedChannelId: 'good',
    atMs: 1_500,
    query: query({
      async getCurrent(_providerId, channelId) {
        if (channelId === 'bad') throw new Error('provider details must not escape');
        return program(channelId, 'Still usable');
      },
      async getNext() {
        throw new Error('EPG unavailable');
      },
    }),
  });

  assert.deepEqual(model.channelContext[0], { channelId: 'bad', current: { status: 'unavailable' } });
  assert.equal(model.channelContext[1]?.current.status, 'available');
  assert.equal(model.selected?.channelId, 'good');
  assert.equal(model.selected?.current.status, 'available');
  assert.deepEqual(model.selected?.next, { status: 'unavailable' });
});

void test('does not invent selected EPG when highlight is absent from the visible stable-ID set', async () => {
  let nextCalls = 0;
  const model = await buildEpgLiveTvViewModel({
    providerId: 'provider-1',
    visibleChannels: [channel('a')],
    highlightedChannelId: 'removed',
    atMs: 1_500,
    query: query({
      async getNext() {
        nextCalls += 1;
        return null;
      },
    }),
  });

  assert.equal(model.selected, null);
  assert.equal(nextCalls, 0);
});
