import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function toArray(children) {
  if (children === null || children === undefined || children === false) return [];
  return Array.isArray(children) ? children : [children];
}

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;

  const children = toArray(node.props?.children);
  for (const child of children) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

async function loadComponentsWithMockedReact(initialStates = []) {
  vi.resetModules();

  let stateCall = 0;
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

  const useEffectMock = vi.fn((effect) => effect());

  vi.doMock('react', () => ({
    useState: useStateMock,
    useEffect: useEffectMock
  }));

  const components = await import('../src/components');
  return { ...components, setters };
}

describe('components interaction logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('react');
    vi.resetModules();
  });

  it('LogCard save success path toggles busy/saved and schedules reset', async () => {
    const setTimeoutMock = vi.fn((callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('window', {
      confirm: vi.fn(() => true),
      setTimeout: setTimeoutMock
    });

    const { LogCard, setters } = await loadComponentsWithMockedReact();
    const onReflection = vi.fn().mockResolvedValue(undefined);

    const element = LogCard({
      entry: {
        id: 'log-1',
        tool: 'ChatGPT',
        timestamp: '2026-03-29T10:00:00.000Z',
        prompt: 'Prompt text',
        reflection: 'Initial reflection',
        compliance: null
      },
      onReflection,
      onDelete: vi.fn()
    });

    const saveButton = findElement(
      element,
      (candidate) => candidate.type === 'button' && candidate.props?.children === 'Save reflection'
    );

    await saveButton.props.onClick();

    expect(onReflection).toHaveBeenCalledWith('log-1', 'Initial reflection');
    expect(setters[0]).toHaveBeenCalledWith('Initial reflection');
    expect(setters[1]).toHaveBeenCalledWith(true);
    expect(setters[1]).toHaveBeenCalledWith(false);
    expect(setters[4]).toHaveBeenCalledWith(true);
    expect(setters[4]).toHaveBeenCalledWith(false);
    expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 1200);
  });

  it('LogCard save error path surfaces the error message', async () => {
    vi.stubGlobal('window', {
      confirm: vi.fn(() => true),
      setTimeout: vi.fn()
    });

    const { LogCard, setters } = await loadComponentsWithMockedReact();
    const onReflection = vi.fn().mockRejectedValue(new Error('save failed'));

    const element = LogCard({
      entry: {
        id: 'log-2',
        tool: 'ChatGPT',
        timestamp: '2026-03-29T10:00:00.000Z',
        prompt: 'Prompt text',
        reflection: 'Draft text',
        compliance: null
      },
      onReflection,
      onDelete: vi.fn()
    });

    const saveButton = findElement(
      element,
      (candidate) => candidate.type === 'button' && candidate.props?.children === 'Save reflection'
    );

    await saveButton.props.onClick();

    expect(setters[3]).toHaveBeenCalledWith('save failed');
    expect(setters[1]).toHaveBeenCalledWith(false);
  });

  it('LogCard delete aborts when confirmation is cancelled', async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('window', {
      confirm: confirmMock,
      setTimeout: vi.fn()
    });

    const onDelete = vi.fn();
    const { LogCard, setters } = await loadComponentsWithMockedReact();

    const element = LogCard({
      entry: {
        id: 'log-3',
        tool: '',
        timestamp: '2026-03-29T10:00:00.000Z',
        prompt: 'Prompt text',
        reflection: '',
        compliance: { status: 'needs_review', reasons: [] }
      },
      onReflection: vi.fn(),
      onDelete
    });

    const deleteButton = findElement(
      element,
      (candidate) => candidate.type === 'button' && candidate.props?.['aria-label'] === 'Delete log'
    );

    await deleteButton.props.onClick();

    expect(confirmMock).toHaveBeenCalledWith('Delete this log entry?');
    expect(onDelete).not.toHaveBeenCalled();
    expect(setters[2]).not.toHaveBeenCalledWith(true);
  });

  it('LogCard delete error path clears busy state and sets message', async () => {
    vi.stubGlobal('window', {
      confirm: vi.fn(() => true),
      setTimeout: vi.fn()
    });

    const onDelete = vi.fn().mockRejectedValue(new Error('delete failed'));
    const { LogCard, setters } = await loadComponentsWithMockedReact();

    const element = LogCard({
      entry: {
        id: 'log-4',
        tool: 'ChatGPT',
        timestamp: '2026-03-29T10:00:00.000Z',
        prompt: 'Prompt text',
        reflection: '',
        compliance: null
      },
      onReflection: vi.fn(),
      onDelete
    });

    const deleteButton = findElement(
      element,
      (candidate) => candidate.type === 'button' && candidate.props?.['aria-label'] === 'Delete log'
    );

    await deleteButton.props.onClick();

    expect(onDelete).toHaveBeenCalledWith('log-4');
    expect(setters[2]).toHaveBeenCalledWith(true);
    expect(setters[2]).toHaveBeenCalledWith(false);
    expect(setters[3]).toHaveBeenCalledWith('delete failed');
  });

  it('PromptForm field updates and submit-success reset state', async () => {
    const { PromptForm, setters } = await loadComponentsWithMockedReact();
    const onSubmit = vi.fn().mockResolvedValue(true);

    const element = PromptForm({ onSubmit, busy: false });

    const form = findElement(element, (candidate) => candidate.type === 'form');
    const toolInput = findElement(
      element,
      (candidate) => candidate.type === 'input' && candidate.props?.id === 'tool'
    );
    const promptInput = findElement(
      element,
      (candidate) => candidate.type === 'textarea' && candidate.props?.id === 'prompt'
    );
    const reflectionInput = findElement(
      element,
      (candidate) => candidate.type === 'textarea' && candidate.props?.id === 'reflection'
    );

    toolInput.props.onChange({ target: { value: 'ChatGPT' } });
    promptInput.props.onChange({ target: { value: 'Summarize this' } });
    reflectionInput.props.onChange({ target: { value: 'Reviewed output' } });

    expect(setters[0]).toHaveBeenCalledWith({
      tool: 'ChatGPT',
      prompt: '',
      reflection: ''
    });
    expect(setters[0]).toHaveBeenCalledWith({
      tool: '',
      prompt: 'Summarize this',
      reflection: ''
    });
    expect(setters[0]).toHaveBeenCalledWith({
      tool: '',
      prompt: '',
      reflection: 'Reviewed output'
    });

    const preventDefault = vi.fn();
    await form.props.onSubmit({ preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({
      tool: '',
      prompt: '',
      reflection: ''
    });
    expect(setters[0]).toHaveBeenCalledWith({
      tool: '',
      prompt: '',
      reflection: ''
    });
  });

  it('PromptForm submit-failure path does not reset state', async () => {
    const { PromptForm, setters } = await loadComponentsWithMockedReact();
    const onSubmit = vi.fn().mockResolvedValue(false);

    const element = PromptForm({ onSubmit, busy: true });
    const form = findElement(element, (candidate) => candidate.type === 'form');

    await form.props.onSubmit({ preventDefault: vi.fn() });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(setters[0]).not.toHaveBeenCalled();
  });
});
