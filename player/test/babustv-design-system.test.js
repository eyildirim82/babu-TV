import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tokensUrl = new URL('../src/ui/tokens.css', import.meta.url);
const themeUrl = new URL('../src/ui/theme.css', import.meta.url);
const primitivesUrl = new URL('../src/ui/primitives.css', import.meta.url);

const exactTokens = new Map([
  ['--babu-bg', '#0b0b0f'],
  ['--babu-surface', '#14141a'],
  ['--babu-surface-raised', '#1b1b23'],
  ['--babu-surface-focus', '#242331'],
  ['--babu-accent', '#8b5cf6'],
  ['--babu-accent-strong', '#a78bfa'],
  ['--babu-text-primary', '#f5f3f7'],
  ['--babu-text-secondary', '#b8b5c0'],
  ['--babu-text-muted', '#777381'],
  ['--babu-success', '#4ade80'],
  ['--babu-warning', '#fbbf24'],
  ['--babu-error', '#f87171'],
  ['--babu-radius-sm', '8px'],
  ['--babu-radius-md', '12px'],
  ['--babu-radius-lg', '16px'],
  ['--babu-motion-fast', '120ms'],
  ['--babu-motion-base', '180ms'],
  ['--babu-motion-slow', '220ms'],
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

void test('BabuşTV tokens expose the exact B0 semantic contract', async () => {
  const tokens = await readFile(tokensUrl, 'utf8');

  for (const [name, value] of exactTokens) {
    assert.match(tokens, new RegExp(`${escapeRegExp(name)}\\s*:\\s*${escapeRegExp(value)}\\s*;`, 'i'));
  }
});

void test('BabuşTV primitives expose stable surface, focus, pill, and muted contracts', async () => {
  const primitives = await readFile(primitivesUrl, 'utf8');

  for (const className of [
    '.babu-focus-ring',
    '.babu-surface',
    '.babu-surface-raised',
    '.babu-pill',
    '.babu-muted',
  ]) {
    assert.match(primitives, new RegExp(`${escapeRegExp(className)}\\s*\\{`));
  }

  assert.match(primitives, /\.babu-focus-ring\s*\{[\s\S]*outline\s*:/);
  assert.match(primitives, /\.babu-focus-ring\s*\{[\s\S]*box-shadow\s*:/);
  assert.match(primitives, /prefers-reduced-motion\s*:\s*reduce/);
});

void test('new BabuşTV CSS does not carry the inherited ENTV accent', async () => {
  const css = (await Promise.all([
    readFile(tokensUrl, 'utf8'),
    readFile(themeUrl, 'utf8'),
    readFile(primitivesUrl, 'utf8'),
  ])).join('\n');
  const inheritedAccent = ['#ED', '421F'].join('');

  assert.equal(css.toUpperCase().includes(inheritedAccent), false);
});
