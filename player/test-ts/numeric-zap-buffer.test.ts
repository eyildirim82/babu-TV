import test from 'node:test';
import assert from 'node:assert/strict';
import type { LogicalInput } from '../src/domain/actions.js';
import {
  NumericZapBuffer,
  type NumericZapTimers,
} from '../src/live-tv/numeric-zap-buffer.js';

class FakeTimers implements NumericZapTimers {
  readonly delays: number[] = [];
  readonly cleared: unknown[] = [];
  private callbacks = new Map<number, () => void>();
  private latestHandle: number | null = null;
  private nextHandle = 1;

  setTimeout(callback: () => void, delayMs: number): unknown {
    const handle = this.nextHandle++;
    this.delays.push(delayMs);
    this.callbacks.set(handle, callback);
    this.latestHandle = handle;
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.cleared.push(handle);
    if (typeof handle === 'number') this.callbacks.delete(handle);
  }

  fireLatest(): void {
    if (this.latestHandle === null) return;
    const handle = this.latestHandle;
    const callback = this.callbacks.get(handle);
    this.callbacks.delete(handle);
    if (callback) callback();
  }
}

void test('accumulates digits and commits after 500ms from the last digit', () => {
  const timers = new FakeTimers();
  const changes: string[] = [];
  const commits: number[] = [];
  const buffer = new NumericZapBuffer({
    timers,
    onChange: (value) => changes.push(value),
    onCommit: (value) => commits.push(value),
  });

  buffer.push(1);
  buffer.push(2);

  assert.deepEqual(changes, ['1', '12']);
  assert.deepEqual(commits, []);
  assert.deepEqual(timers.delays, [500, 500]);
  assert.deepEqual(timers.cleared, [1]);

  timers.fireLatest();

  assert.deepEqual(commits, [12]);
  assert.equal(changes[changes.length - 1], '');
});

void test('clear cancels a pending numeric zap without committing', () => {
  const timers = new FakeTimers();
  const changes: string[] = [];
  const commits: number[] = [];
  const buffer = new NumericZapBuffer({
    timers,
    onChange: (value) => changes.push(value),
    onCommit: (value) => commits.push(value),
  });

  buffer.push(4);
  buffer.clear();
  timers.fireLatest();

  assert.deepEqual(timers.cleared, [1]);
  assert.deepEqual(changes, ['4', '']);
  assert.deepEqual(commits, []);
});

void test('ignores values that are not single decimal digits', () => {
  const timers = new FakeTimers();
  const changes: string[] = [];
  const commits: number[] = [];
  const buffer = new NumericZapBuffer({
    timers,
    onChange: (value) => changes.push(value),
    onCommit: (value) => commits.push(value),
  });

  buffer.push(-1);
  buffer.push(10);
  buffer.push(1.5);

  assert.deepEqual(timers.delays, []);
  assert.deepEqual(changes, []);
  assert.deepEqual(commits, []);
});

void test('supports an injected timeout and normalized digit input contract', () => {
  const timers = new FakeTimers();
  const commits: number[] = [];
  const input: LogicalInput = { type: 'DIGIT', digit: 7 };
  const buffer = new NumericZapBuffer({
    timers,
    delayMs: 250,
    onChange() {},
    onCommit: (value) => commits.push(value),
  });

  buffer.push(input.digit);
  assert.deepEqual(timers.delays, [250]);

  timers.fireLatest();
  assert.deepEqual(commits, [7]);
});
