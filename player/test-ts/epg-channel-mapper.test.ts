import test from 'node:test';
import assert from 'node:assert/strict';

import { matchEpgChannel } from '../src/epg/channel-mapper.js';

test('EPG-MAP prefers provider-scoped channel id then tvg id', () => {
  const channels = [
    { providerId: 'p1', channelId: '42', name: 'TRT 1', epgIds: ['trt1.tr'] },
    { providerId: 'p2', channelId: '42', name: 'Other', epgIds: ['other'] },
  ] as const;

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: '42',
    tvgId: 'wrong',
    name: 'Wrong',
  }, channels), '42');

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null,
    tvgId: 'trt1.tr',
    name: null,
  }, channels), '42');
});

test('EPG-MAP matches provider channel id through descriptor EPG ids after direct id misses', () => {
  const channels = [
    { providerId: 'p1', channelId: 'internal-42', name: 'TRT 1', epgIds: ['provider-42'] },
  ] as const;

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: ' provider-42 ',
    tvgId: null,
    name: null,
  }, channels), 'internal-42');
});

test('EPG-MAP uses normalized name only when unambiguous', () => {
  const unique = [
    { providerId: 'p1', channelId: 'a', name: 'İstanbul TV', epgIds: [] },
  ] as const;

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null,
    tvgId: null,
    name: '  İSTANBUL   TV ',
  }, unique), 'a');

  const ambiguous = [
    ...unique,
    { providerId: 'p1', channelId: 'b', name: 'İstanbul TV', epgIds: [] },
  ] as const;

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null,
    tvgId: null,
    name: 'İstanbul TV',
  }, ambiguous), null);
});

test('EPG-MAP is deterministic across reorder and duplicate descriptors', () => {
  const channels = [
    { providerId: 'p1', channelId: 'a', name: 'Alpha', epgIds: ['alpha.tv'] },
    { providerId: 'p1', channelId: 'b', name: 'Beta', epgIds: ['beta.tv'] },
  ] as const;
  const source = { providerChannelId: null, tvgId: 'beta.tv', name: 'Beta' } as const;

  assert.equal(matchEpgChannel('p1', source, channels), 'b');
  assert.equal(matchEpgChannel('p1', source, [...channels].reverse()), 'b');
  assert.equal(matchEpgChannel('p1', source, [channels[1], channels[1]]), 'b');
});

test('EPG-MAP rejects stable-id ambiguity instead of falling through', () => {
  const channels = [
    { providerId: 'p1', channelId: 'a', name: 'Alpha', epgIds: ['shared.tv'] },
    { providerId: 'p1', channelId: 'b', name: 'Shared TV', epgIds: ['shared.tv'] },
  ] as const;

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null,
    tvgId: 'shared.tv',
    name: 'Shared TV',
  }, channels), null);
});

test('EPG-MAP isolates providers and returns null without usable source identity', () => {
  const channels = [
    { providerId: 'p2', channelId: '42', name: 'TRT 1', epgIds: ['trt1.tr'] },
  ] as const;

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: '42',
    tvgId: 'trt1.tr',
    name: 'TRT 1',
  }, channels), null);

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null,
    tvgId: null,
    name: '   ',
  }, channels), null);
});

test('EPG-MAP trims stable identifiers without changing their case', () => {
  const channels = [
    { providerId: 'p1', channelId: 'CaseSensitive', name: 'Case', epgIds: [' TVG.ID '] },
  ] as const;

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: ' CaseSensitive ',
    tvgId: null,
    name: null,
  }, channels), 'CaseSensitive');

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null,
    tvgId: ' TVG.ID ',
    name: null,
  }, channels), 'CaseSensitive');

  assert.equal(matchEpgChannel('p1', {
    providerChannelId: null,
    tvgId: 'tvg.id',
    name: null,
  }, channels), null);
});
