import test from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogSearchResult } from '../src/search/search-core.js';

function result(input: {
  providerId: string;
  channelId: string;
  name: string;
  number?: number | null;
  matchedBy?: 'number' | 'name' | 'category';
  rank?: number;
}): CatalogSearchResult {
  return {
    channel: {
      providerId: input.providerId,
      id: input.channelId,
      name: input.name,
      categoryId: null,
      logoUrl: null,
      number: input.number ?? null,
    },
    matchedBy: input.matchedBy ?? 'name',
    rank: input.rank ?? 10,
  };
}

async function loadViewModel() {
  return import('../src/search/search-view-model.js').catch(() => null);
}

async function loadKeyboardBoundary() {
  return import('../src/search/search-input-boundary.js').catch(() => null);
}

test('SRCH-UI projects idle and no-results states without inventing search semantics', async () => {
  const module = await loadViewModel();
  assert.ok(module, 'search view-model module must exist');
  if (!module) return;

  const idle = module.projectSearchView({
    query: '   ',
    results: [],
    focusZone: 'results',
    focusedResultKey: 'p1:c1',
    restoreResultKey: 'p1:c1',
  });
  assert.equal(idle.status, 'idle');
  assert.equal(idle.focusZone, 'input');
  assert.equal(idle.focusedResultKey, null);
  assert.deepEqual(idle.items, []);
  assert.equal(idle.restoreResultKey, 'p1:c1');

  const noResults = module.projectSearchView({
    query: 'haber',
    results: [],
    focusZone: 'results',
    focusedResultKey: 'p1:c1',
    restoreResultKey: 'p1:c1',
  });
  assert.equal(noResults.status, 'no-results');
  assert.equal(noResults.focusZone, 'input');
  assert.equal(noResults.focusedResultKey, null);
  assert.deepEqual(noResults.items, []);
});

test('SRCH-UI projects provider-scoped stable result keys and presentation labels', async () => {
  const module = await loadViewModel();
  assert.ok(module, 'search view-model module must exist');
  if (!module) return;

  const view = module.projectSearchView({
    query: 'haber',
    results: [
      result({ providerId: 'p1', channelId: 'same', name: 'Haber Bir', number: 7, matchedBy: 'name' }),
      result({ providerId: 'p2', channelId: 'same', name: 'Haber İki', matchedBy: 'category', rank: 40 }),
    ],
    focusZone: 'input',
    focusedResultKey: null,
    restoreResultKey: null,
  });

  assert.equal(view.status, 'results');
  assert.equal(view.focusZone, 'input');
  assert.equal(view.focusedResultKey, null);
  assert.deepEqual(
    view.items.map((item) => [item.key, item.primaryText, item.numberText, item.matchedBy]),
    [
      ['p1:same', 'Haber Bir', '7', 'name'],
      ['p2:same', 'Haber İki', null, 'category'],
    ],
  );
});

test('SRCH-UI keeps stable result focus across reorder and falls back restore then first result', async () => {
  const module = await loadViewModel();
  assert.ok(module, 'search view-model module must exist');
  if (!module) return;

  const first = result({ providerId: 'p1', channelId: 'a', name: 'A' });
  const second = result({ providerId: 'p1', channelId: 'b', name: 'B' });

  const reordered = module.projectSearchView({
    query: 'x',
    results: [second, first],
    focusZone: 'results',
    focusedResultKey: 'p1:a',
    restoreResultKey: 'p1:b',
  });
  assert.equal(reordered.focusedResultKey, 'p1:a');
  assert.equal(reordered.restoreResultKey, 'p1:a');

  const restored = module.projectSearchView({
    query: 'x',
    results: [second],
    focusZone: 'results',
    focusedResultKey: 'p1:missing',
    restoreResultKey: 'p1:b',
  });
  assert.equal(restored.focusedResultKey, 'p1:b');
  assert.equal(restored.restoreResultKey, 'p1:b');

  const firstFallback = module.projectSearchView({
    query: 'x',
    results: [first, second],
    focusZone: 'results',
    focusedResultKey: 'p1:missing',
    restoreResultKey: 'p1:also-missing',
  });
  assert.equal(firstFallback.focusedResultKey, 'p1:a');
  assert.equal(firstFallback.restoreResultKey, 'p1:a');
});

test('SRCH-UI keeps native text-edit keys inside the input and closes only on explicit back keys', async () => {
  const module = await loadKeyboardBoundary();
  assert.ok(module, 'search keyboard boundary module must exist');
  if (!module) return;

  const inputState = {
    zone: 'input' as const,
    focusedResultKey: null,
    restoreResultKey: 'p1:b',
  };

  for (const key of ['ArrowLeft', 'ArrowRight', 'Backspace', 'a']) {
    const output = module.handleSearchKeyboard({
      state: inputState,
      resultKeys: ['p1:a', 'p1:b'],
      event: { key },
    });
    assert.equal(output.handled, false, `${key} should remain native while editing`);
    assert.equal(output.intent, null);
    assert.deepEqual(output.state, inputState);
  }

  const back = module.handleSearchKeyboard({
    state: inputState,
    resultKeys: ['p1:a'],
    event: { key: 'GoBack', keyCode: 10009 },
  });
  assert.equal(back.handled, true);
  assert.deepEqual(back.intent, { type: 'CLOSE_SEARCH' });
});

test('SRCH-UI moves focus without activation and emits activation only on Enter over a result', async () => {
  const module = await loadKeyboardBoundary();
  assert.ok(module, 'search keyboard boundary module must exist');
  if (!module) return;

  const input = {
    zone: 'input' as const,
    focusedResultKey: null,
    restoreResultKey: 'p1:b',
  };
  const down = module.handleSearchKeyboard({
    state: input,
    resultKeys: ['p1:a', 'p1:b', 'p1:c'],
    event: { key: 'ArrowDown', keyCode: 40 },
  });
  assert.equal(down.handled, true);
  assert.equal(down.intent, null);
  assert.deepEqual(down.state, {
    zone: 'results',
    focusedResultKey: 'p1:b',
    restoreResultKey: 'p1:b',
  });

  const next = module.handleSearchKeyboard({
    state: down.state,
    resultKeys: ['p1:a', 'p1:b', 'p1:c'],
    event: { key: 'ArrowDown', keyCode: 40 },
  });
  assert.equal(next.intent, null);
  assert.equal(next.state.focusedResultKey, 'p1:c');
  assert.equal(next.state.restoreResultKey, 'p1:c');

  const activate = module.handleSearchKeyboard({
    state: next.state,
    resultKeys: ['p1:a', 'p1:b', 'p1:c'],
    event: { key: 'Enter', keyCode: 13 },
  });
  assert.equal(activate.handled, true);
  assert.deepEqual(activate.intent, { type: 'ACTIVATE_RESULT', resultKey: 'p1:c' });
  assert.deepEqual(activate.state, next.state);
});

test('SRCH-UI returns from the first result to input while preserving the stable restore target', async () => {
  const module = await loadKeyboardBoundary();
  assert.ok(module, 'search keyboard boundary module must exist');
  if (!module) return;

  const firstResultState = {
    zone: 'results' as const,
    focusedResultKey: 'p1:a',
    restoreResultKey: 'p1:a',
  };
  const up = module.handleSearchKeyboard({
    state: firstResultState,
    resultKeys: ['p1:a', 'p1:b'],
    event: { key: 'ArrowUp', keyCode: 38 },
  });

  assert.equal(up.handled, true);
  assert.equal(up.intent, null);
  assert.deepEqual(up.state, {
    zone: 'input',
    focusedResultKey: null,
    restoreResultKey: 'p1:a',
  });
});
