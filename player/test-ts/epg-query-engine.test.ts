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
