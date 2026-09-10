import test from 'node:test';
import assert from 'node:assert/strict';
import { RepositoryEpgQuery } from '../src/epg/query-engine.js';
import { MemoryEpgProgramRepository } from './support/v1-rc-memory-repositories.js';

test('EPG-Q current lookup uses half-open intervals', async () => {
  const repo = new MemoryEpgProgramRepository();
  await repo.replaceWindow('p1', { startMs: 0, endMs: 300 }, [
    { channelId: 'c1', startMs: 100, endMs: 200, title: 'A', description: null },
    { channelId: 'c1', startMs: 200, endMs: 300, title: 'B', description: null },
  ]);
  const query = new RepositoryEpgQuery(repo, { lookBehindMs: 1000, lookAheadMs: 1000 });
  assert.equal((await query.getCurrent('p1', 'c1', 199))?.title, 'A');
  assert.equal((await query.getCurrent('p1', 'c1', 200))?.title, 'B');
});

test('EPG-Q next lookup starts after the current programme ends', async () => {
  const repo = new MemoryEpgProgramRepository();
  await repo.replaceWindow('p1', { startMs: 0, endMs: 500 }, [
    { channelId: 'c1', startMs: 100, endMs: 250, title: 'Current', description: null },
    { channelId: 'c1', startMs: 200, endMs: 220, title: 'Overlap', description: null },
    { channelId: 'c1', startMs: 250, endMs: 300, title: 'Next', description: null },
  ]);
  const query = new RepositoryEpgQuery(repo, { lookBehindMs: 1000, lookAheadMs: 1000 });
  assert.equal((await query.getNext('p1', 'c1', 150))?.title, 'Next');
});

test('EPG-Q next lookup crosses a gap when there is no current programme', async () => {
  const repo = new MemoryEpgProgramRepository();
  await repo.replaceWindow('p1', { startMs: 0, endMs: 500 }, [
    { channelId: 'c1', startMs: 200, endMs: 300, title: 'Future', description: null },
  ]);
  const query = new RepositoryEpgQuery(repo, { lookBehindMs: 1000, lookAheadMs: 1000 });
  assert.equal(await query.getCurrent('p1', 'c1', 150), null);
  assert.equal((await query.getNext('p1', 'c1', 150))?.title, 'Future');
});

test('EPG-Q next lookup returns null when there is no future programme', async () => {
  const repo = new MemoryEpgProgramRepository();
  await repo.replaceWindow('p1', { startMs: 0, endMs: 500 }, [
    { channelId: 'c1', startMs: 100, endMs: 200, title: 'Current', description: null },
  ]);
  const query = new RepositoryEpgQuery(repo, { lookBehindMs: 1000, lookAheadMs: 1000 });
  assert.equal(await query.getNext('p1', 'c1', 150), null);
});

test('EPG-Q window lookup delegates provider, channel, and half-open window', async () => {
  const repo = new MemoryEpgProgramRepository();
  await repo.replaceWindow('p1', { startMs: 0, endMs: 400 }, [
    { channelId: 'c1', startMs: 100, endMs: 200, title: 'A', description: null },
    { channelId: 'c1', startMs: 200, endMs: 300, title: 'B', description: null },
    { channelId: 'c2', startMs: 100, endMs: 300, title: 'Other channel', description: null },
  ]);
  await repo.replaceWindow('p2', { startMs: 0, endMs: 400 }, [
    { channelId: 'c1', startMs: 100, endMs: 300, title: 'Other provider', description: null },
  ]);
  const query = new RepositoryEpgQuery(repo, { lookBehindMs: 1000, lookAheadMs: 1000 });
  assert.deepEqual(
    (await query.listWindow('p1', 'c1', { startMs: 150, endMs: 250 })).map((program) => program.title),
    ['A', 'B'],
  );
});
