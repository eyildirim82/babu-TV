import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSecurityProfileNames } from '../../tizen/security-profiles.mjs';

test('parses profile names from `tizen security-profiles list` output', () => {
  const stdout = "Loaded in 'C:\tizen-studio-data\profile\profiles.xml'.\r\n"
    + '[Profile Name]      [Active]  \r\n'
    + 'samsung             O         \r\n'
    + 'tizen                         \r\n';

  assert.deepEqual(parseSecurityProfileNames(stdout), ['samsung', 'tizen']);
});

test('reports no profiles when the list has only its header or is empty', () => {
  assert.deepEqual(parseSecurityProfileNames("Loaded in 'x'.\n[Profile Name]      [Active]\n"), []);
  assert.deepEqual(parseSecurityProfileNames(''), []);
});
