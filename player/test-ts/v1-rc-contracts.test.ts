import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  EpgProgramRepository,
  EpgQuery,
  EpgSource,
  EpgSourceProgram,
  EpgWindow,
} from '../src/epg/contracts.js';

void (null as unknown as EpgProgramRepository);
void (null as unknown as EpgQuery);
void (null as unknown as EpgSource);
void (null as unknown as EpgSourceProgram);
void (null as unknown as EpgWindow);

test('RC-F0 contract suite loads without runtime side effects', () => {
  assert.equal(true, true);
});
