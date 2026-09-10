import type { SearchFocusZone } from './search-view-model.js';

export interface SearchFocusState {
  zone: SearchFocusZone;
  focusedResultKey: string | null;
  restoreResultKey: string | null;
}

export interface SearchKeyboardEvent {
  key?: string;
  keyCode?: number;
}

export type SearchKeyboardIntent =
  | { type: 'CLOSE_SEARCH' }
  | { type: 'ACTIVATE_RESULT'; resultKey: string };

export interface SearchKeyboardOutput {
  handled: boolean;
  state: SearchFocusState;
  intent: SearchKeyboardIntent | null;
}

export interface HandleSearchKeyboardInput {
  state: SearchFocusState;
  resultKeys: readonly string[];
  event: SearchKeyboardEvent;
}

function isBack(event: SearchKeyboardEvent): boolean {
  return event.key === 'GoBack'
    || event.key === 'Escape'
    || event.keyCode === 10009
    || event.keyCode === 27;
}

function isKey(event: SearchKeyboardEvent, key: string, keyCode: number): boolean {
  return event.key === key || event.keyCode === keyCode;
}

function existingKey(
  resultKeys: readonly string[],
  focusedResultKey: string | null,
  restoreResultKey: string | null,
): string | null {
  if (focusedResultKey !== null && resultKeys.includes(focusedResultKey)) {
    return focusedResultKey;
  }
  if (restoreResultKey !== null && resultKeys.includes(restoreResultKey)) {
    return restoreResultKey;
  }
  return resultKeys[0] ?? null;
}

function resultState(state: SearchFocusState, resultKey: string): SearchFocusState {
  return {
    zone: 'results',
    focusedResultKey: resultKey,
    restoreResultKey: resultKey,
  };
}

export function handleSearchKeyboard(input: HandleSearchKeyboardInput): SearchKeyboardOutput {
  const { state, resultKeys, event } = input;

  if (isBack(event)) {
    return {
      handled: true,
      state,
      intent: { type: 'CLOSE_SEARCH' },
    };
  }

  if (state.zone === 'input') {
    if (isKey(event, 'ArrowDown', 40) || isKey(event, 'Enter', 13)) {
      const target = existingKey(resultKeys, null, state.restoreResultKey);
      return {
        handled: true,
        state: target === null ? state : resultState(state, target),
        intent: null,
      };
    }

    if (isKey(event, 'ArrowUp', 38)) {
      return { handled: true, state, intent: null };
    }

    return { handled: false, state, intent: null };
  }

  const current = existingKey(resultKeys, state.focusedResultKey, state.restoreResultKey);
  if (current === null) {
    return {
      handled: isKey(event, 'ArrowUp', 38)
        || isKey(event, 'ArrowDown', 40)
        || isKey(event, 'Enter', 13),
      state: {
        zone: 'input',
        focusedResultKey: null,
        restoreResultKey: state.restoreResultKey,
      },
      intent: null,
    };
  }

  if (isKey(event, 'ArrowUp', 38)) {
    const index = resultKeys.indexOf(current);
    if (index <= 0) {
      return {
        handled: true,
        state: {
          zone: 'input',
          focusedResultKey: null,
          restoreResultKey: current,
        },
        intent: null,
      };
    }
    return {
      handled: true,
      state: resultState(state, resultKeys[index - 1] ?? current),
      intent: null,
    };
  }

  if (isKey(event, 'ArrowDown', 40)) {
    const index = resultKeys.indexOf(current);
    const target = resultKeys[Math.min(resultKeys.length - 1, index + 1)] ?? current;
    return {
      handled: true,
      state: resultState(state, target),
      intent: null,
    };
  }

  if (isKey(event, 'Enter', 13)) {
    return {
      handled: true,
      state: resultState(state, current),
      intent: { type: 'ACTIVATE_RESULT', resultKey: current },
    };
  }

  if (isKey(event, 'ArrowLeft', 37) || isKey(event, 'ArrowRight', 39)) {
    return { handled: true, state: resultState(state, current), intent: null };
  }

  return { handled: false, state, intent: null };
}
