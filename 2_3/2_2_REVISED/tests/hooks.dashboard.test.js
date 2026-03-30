import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferredPromise() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function loadHookHarness({
  initialStates = [],
  apiOverrides = {},
  runEffect = true
} = {}) {
  vi.resetModules();

  let stateCall = 0;
  let cleanupFn;
  const stateValues = [];
  const setters = [];

  const useStateMock = vi.fn((initialValue) => {
    const idx = stateCall++;
    const resolvedInitial = typeof initialValue === 'function' ? initialValue() : initialValue;
    const value = idx < initialStates.length ? initialStates[idx] : resolvedInitial;
    stateValues[idx] = value;

    const setter = vi.fn((nextValue) => {
      stateValues[idx] = typeof nextValue === 'function'
        ? nextValue(stateValues[idx])
        : nextValue;
    });
    setters[idx] = setter;

    return [value, setter];
  });

  const useEffectMock = vi.fn((effect) => {
    if (!runEffect) return undefined;
    cleanupFn = effect();
    return cleanupFn;
  });

  vi.doMock('react', () => ({
    useState: useStateMock,
    useEffect: useEffectMock
  }));

  const apiClient = {
    getGuidelines: vi.fn().mockResolvedValue([]),
    getLogs: vi.fn().mockResolvedValue([]),
    getDeclaration: vi.fn().mockResolvedValue(null),
    createLog: vi.fn().mockResolvedValue({ id: 'new-log' }),
    updateReflection: vi.fn().mockResolvedValue({ id: 'new-log', reflection: 'updated' }),
    deleteLog: vi.fn().mockResolvedValue(undefined),
    ...apiOverrides
  };

  vi.doMock('../src/api', () => ({ apiClient }));

  const { useDashboardData } = await import('../src/hooks');
  const hook = useDashboardData();

  const flush = async (steps = 4) => {
    for (let idx = 0; idx < steps; idx += 1) {
      await Promise.resolve();
    }
  };

  return {
    hook,
    apiClient,
    setters,
    stateValues,
    cleanupFn,
    flush
  };
}

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.doUnmock('react');
    vi.doUnmock('../src/api');
    vi.resetModules();
  });

  it('loads guidelines/logs/declaration on mount and stamps update time', async () => {
    const declaration = {
      declaration_text: 'AI declaration',
      total_logs: 1,
      compliant_logs: 1,
      needs_review_logs: 0
    };

    const { apiClient, setters, flush } = await loadHookHarness({
      apiOverrides: {
        getGuidelines: vi.fn().mockResolvedValue(['Guideline A']),
        getLogs: vi.fn().mockResolvedValue([{ id: 'log-1' }]),
        getDeclaration: vi.fn().mockResolvedValue(declaration)
      }
    });

    await flush();

    expect(apiClient.getGuidelines).toHaveBeenCalledTimes(1);
    expect(apiClient.getLogs).toHaveBeenCalledTimes(1);
    expect(apiClient.getDeclaration).toHaveBeenCalledTimes(1);
    expect(setters[6]).toHaveBeenCalledWith('');
    expect(setters[0]).toHaveBeenCalledWith(['Guideline A']);
    expect(setters[1]).toHaveBeenCalledWith([{ id: 'log-1' }]);
    expect(setters[2]).toHaveBeenCalledWith(declaration);
    expect(typeof setters[5].mock.calls.at(-1)[0]).toBe('string');
  });

  it('sets error when initial load fails while still mounted', async () => {
    const { setters, flush } = await loadHookHarness({
      apiOverrides: {
        getGuidelines: vi.fn().mockRejectedValue(new Error('initial load failed'))
      }
    });

    await flush();

    const errorCalls = setters[6].mock.calls.map(([value]) => value);
    expect(errorCalls).toContain('initial load failed');
  });

  it('skips late error updates after unmount cleanup', async () => {
    const deferred = deferredPromise();
    const { setters, cleanupFn, flush } = await loadHookHarness({
      apiOverrides: {
        getGuidelines: vi.fn(() => deferred.promise),
        getLogs: vi.fn().mockResolvedValue([]),
        getDeclaration: vi.fn().mockResolvedValue(null)
      }
    });

    cleanupFn();
    deferred.reject(new Error('late failure'));
    await flush(6);

    const errorCalls = setters[6].mock.calls.map(([value]) => value);
    expect(errorCalls).toEqual(['']);
  });

  it('refreshDeclaration success updates declaration, timestamp and busy state', async () => {
    const declaration = {
      declaration_text: 'Fresh declaration',
      total_logs: 2,
      compliant_logs: 1,
      needs_review_logs: 1
    };

    const { hook, setters } = await loadHookHarness({
      runEffect: false,
      apiOverrides: {
        getDeclaration: vi.fn().mockResolvedValue(declaration)
      }
    });

    await hook.refreshDeclaration();

    expect(setters[4]).toHaveBeenCalledWith(true);
    expect(setters[2]).toHaveBeenCalledWith(declaration);
    expect(typeof setters[5].mock.calls.at(-1)[0]).toBe('string');
    expect(setters[4]).toHaveBeenCalledWith(false);
  });

  it('refreshDeclaration failure uses fallback message for malformed errors', async () => {
    const { hook, setters } = await loadHookHarness({
      runEffect: false,
      apiOverrides: {
        getDeclaration: vi.fn().mockRejectedValue({})
      }
    });

    await hook.refreshDeclaration();

    expect(setters[6]).toHaveBeenCalledWith('Unexpected error, please retry.');
    expect(setters[4]).toHaveBeenCalledWith(false);
  });

  it('createLog success prepends new entry and refreshes declaration', async () => {
    const createdEntry = { id: 'new-log', tool: 'ChatGPT' };
    const startingLogs = [{ id: 'old-log' }];
    const declaration = {
      declaration_text: 'Updated declaration',
      total_logs: 2,
      compliant_logs: 2,
      needs_review_logs: 0
    };

    const { hook, setters, apiClient } = await loadHookHarness({
      runEffect: false,
      initialStates: [[], startingLogs, null, false, false, '', ''],
      apiOverrides: {
        createLog: vi.fn().mockResolvedValue(createdEntry),
        getDeclaration: vi.fn().mockResolvedValue(declaration)
      }
    });

    await expect(hook.createLog({ tool: 'ChatGPT', prompt: 'hello' })).resolves.toBe(true);

    expect(apiClient.createLog).toHaveBeenCalledWith({ tool: 'ChatGPT', prompt: 'hello' });
    expect(setters[3]).toHaveBeenCalledWith(true);
    expect(setters[6]).toHaveBeenCalledWith('');
    const prependUpdater = setters[1].mock.calls[0][0];
    expect(prependUpdater(startingLogs)).toEqual([createdEntry, ...startingLogs]);
    expect(setters[2]).toHaveBeenCalledWith(declaration);
    expect(setters[3]).toHaveBeenCalledWith(false);
  });

  it('createLog failure returns false and stores the error message', async () => {
    const { hook, setters } = await loadHookHarness({
      runEffect: false,
      apiOverrides: {
        createLog: vi.fn().mockRejectedValue(new Error('create failed'))
      }
    });

    await expect(hook.createLog({ tool: 'ChatGPT', prompt: 'hello' })).resolves.toBe(false);

    expect(setters[6]).toHaveBeenCalledWith('create failed');
    expect(setters[3]).toHaveBeenCalledWith(false);
  });

  it('updateReflection success replaces only the target entry', async () => {
    const initialLogs = [
      { id: 'a', reflection: 'old-a' },
      { id: 'b', reflection: 'old-b' }
    ];
    const updated = { id: 'b', reflection: 'new-b' };

    const { hook, setters } = await loadHookHarness({
      runEffect: false,
      initialStates: [[], initialLogs, null, false, false, '', ''],
      apiOverrides: {
        updateReflection: vi.fn().mockResolvedValue(updated),
        getDeclaration: vi.fn().mockResolvedValue(null)
      }
    });

    await hook.updateReflection('b', 'new-b');

    const replaceUpdater = setters[1].mock.calls[0][0];
    expect(replaceUpdater(initialLogs)).toEqual([
      { id: 'a', reflection: 'old-a' },
      updated
    ]);
  });

  it('updateReflection failure rethrows and stores the error', async () => {
    const { hook, setters } = await loadHookHarness({
      runEffect: false,
      apiOverrides: {
        updateReflection: vi.fn().mockRejectedValue(new Error('update failed'))
      }
    });

    await expect(hook.updateReflection('x', 'new')).rejects.toThrow('update failed');
    expect(setters[6]).toHaveBeenCalledWith('update failed');
  });

  it('deleteLog success removes only the requested entry', async () => {
    const initialLogs = [
      { id: '1', prompt: 'first' },
      { id: '2', prompt: 'second' }
    ];

    const { hook, setters } = await loadHookHarness({
      runEffect: false,
      initialStates: [[], initialLogs, null, false, false, '', '']
    });

    await hook.deleteLog('2');

    const filterUpdater = setters[1].mock.calls[0][0];
    expect(filterUpdater(initialLogs)).toEqual([{ id: '1', prompt: 'first' }]);
  });

  it('deleteLog failure rethrows and stores the error', async () => {
    const { hook, setters } = await loadHookHarness({
      runEffect: false,
      apiOverrides: {
        deleteLog: vi.fn().mockRejectedValue(new Error('delete failed'))
      }
    });

    await expect(hook.deleteLog('x')).rejects.toThrow('delete failed');
    expect(setters[6]).toHaveBeenCalledWith('delete failed');
  });
});
