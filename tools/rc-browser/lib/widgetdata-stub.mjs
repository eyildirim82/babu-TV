const CONTROLLERS = new WeakMap();

const BINDINGS = Object.freeze({
  read: '__rcWidgetDataRead',
  write: '__rcWidgetDataWrite',
  remove: '__rcWidgetDataRemove',
});

function shouldFail(mode, operation) {
  return mode === 'all' || mode === operation;
}

function operationError(operation) {
  return {
    ok: false,
    error: {
      name: 'OperationError',
      message: `WidgetData ${operation} failed`,
    },
  };
}

export async function installWidgetDataStub(context, options = {}) {
  const existing = CONTROLLERS.get(context);
  if (existing) return existing;

  const state = {
    value: options.initialValue ?? null,
    failureMode: options.failureMode ?? null,
    available: options.available !== false,
  };

  await context.exposeBinding(BINDINGS.read, async () => {
    if (shouldFail(state.failureMode, 'read')) return operationError('read');
    return { ok: true, value: state.value };
  });

  await context.exposeBinding(BINDINGS.write, async (_source, value) => {
    if (shouldFail(state.failureMode, 'write')) return operationError('write');
    state.value = typeof value === 'string' ? value : String(value ?? '');
    return { ok: true };
  });

  await context.exposeBinding(BINDINGS.remove, async () => {
    if (shouldFail(state.failureMode, 'remove')) return operationError('remove');
    state.value = null;
    return { ok: true };
  });

  await context.addInitScript(({ bindings, available }) => {
    const root = window.webapis && typeof window.webapis === 'object'
      ? window.webapis
      : {};
    window.webapis = root;

    if (!available) {
      try { delete root.widgetdata; } catch {}
      return;
    }

    const invoke = (binding, args, success, failure, mapSuccess = (value) => value) => {
      Promise.resolve(window[binding](...args)).then((result) => {
        if (result?.ok) {
          if (typeof success === 'function') success(mapSuccess(result));
          return;
        }
        if (typeof failure === 'function') failure(result?.error ?? { name: 'OperationError' });
      }).catch(() => {
        if (typeof failure === 'function') failure({ name: 'OperationError' });
      });
    };

    root.widgetdata = {
      read(success, failure) {
        invoke(bindings.read, [], success, failure, (result) => result.value ?? null);
      },
      write(value, success, failure) {
        invoke(bindings.write, [value], success, failure, () => undefined);
      },
      remove(success, failure) {
        invoke(bindings.remove, [], success, failure, () => undefined);
      },
    };
  }, { bindings: BINDINGS, available: state.available });

  const controller = Object.freeze({
    readRaw() {
      return state.value;
    },
    setRaw(value) {
      state.value = value ?? null;
    },
    matchesRaw(expected) {
      return state.value === expected;
    },
    clear() {
      state.value = null;
    },
    setFailureMode(mode) {
      if (![null, 'read', 'write', 'remove', 'all'].includes(mode)) {
        throw new Error('Unsupported WidgetData failure mode.');
      }
      state.failureMode = mode;
    },
    isAvailableConfigured() {
      return state.available;
    },
  });

  CONTROLLERS.set(context, controller);
  return controller;
}
