/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { createFilterValuesStore } = require('./filterValuesStore');
const {
  FilterFieldStoreContext,
  useFilterFieldValue,
  useFilterFieldActions,
} = require('./FilterStateContext');

describe('createFilterValuesStore', () => {
  test('given initial values, when read, then getSnapshot and getAll return them', () => {
    const store = createFilterValuesStore({ a: '1', b: '2' });

    expect(store.getSnapshot('a')).toBe('1');
    expect(store.getSnapshot('missing')).toBeUndefined();
    expect(store.getAll()).toEqual({ a: '1', b: '2' });
  });

  test('given a write, when read, then it is visible immediately and the previous snapshot object is not mutated', () => {
    const store = createFilterValuesStore({ a: '1' });
    const before = store.getAll();

    expect(store.setValue('a', '2')).toBe(true);

    expect(store.getSnapshot('a')).toBe('2');
    expect(before).toEqual({ a: '1' });
    expect(store.getAll()).not.toBe(before);
  });

  test('given a write of the same value, when set, then it reports no change and notifies nobody', () => {
    const store = createFilterValuesStore({ a: '1' });
    const listener = jest.fn();
    store.subscribe('a', listener);

    expect(store.setValue('a', '1')).toBe(false);

    expect(listener).not.toHaveBeenCalled();
  });

  test('given subscribers on different keys, when one key changes, then only that key\'s subscribers are notified', () => {
    const store = createFilterValuesStore({ a: '', b: '' });
    const onA = jest.fn();
    const onB = jest.fn();
    store.subscribe('a', onA);
    store.subscribe('b', onB);

    store.setValue('a', 'x');

    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
  });

  test('given setMany, when it changes some keys, then each changed key is notified once and unchanged keys are not', () => {
    const store = createFilterValuesStore({ a: '1', b: '2', c: '3' });
    const listeners = { a: jest.fn(), b: jest.fn(), c: jest.fn() };
    Object.entries(listeners).forEach(([key, listener]) => store.subscribe(key, listener));

    expect(store.setMany({ a: '1', b: 'changed', c: 'changed' })).toBe(true);

    expect(listeners.a).not.toHaveBeenCalled();
    expect(listeners.b).toHaveBeenCalledTimes(1);
    expect(listeners.c).toHaveBeenCalledTimes(1);
    expect(store.getAll()).toEqual({ a: '1', b: 'changed', c: 'changed' });
    expect(store.setMany({ a: '1' })).toBe(false);
    expect(store.setMany(null)).toBe(false);
  });

  test('given an unsubscribe, when the key changes afterwards, then that listener is not called; and a listener may unsubscribe itself mid-notify', () => {
    const store = createFilterValuesStore({ a: '' });
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribeFirst = store.subscribe('a', first);
    store.subscribe('a', () => {
      second();
      unsubscribeFirst();
    });

    store.setValue('a', '1');
    store.setValue('a', '2');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  test('given two stores, when one is written, then the other is untouched (nothing is module-global)', () => {
    const one = createFilterValuesStore({ a: '1' });
    const two = createFilterValuesStore({ a: '1' });

    one.setValue('a', 'changed');

    expect(two.getSnapshot('a')).toBe('1');
  });
});

describe('useFilterFieldValue / useFilterFieldActions', () => {
  const makeContext = (initial) => {
    const store = createFilterValuesStore(initial);
    const actions = {
      getFieldValue: (key) => store.getSnapshot(key),
      setFieldValue: (key, value) => store.setValue(key, value),
    };
    return { store, actions };
  };

  test('given a mounted field, when its key changes, then the hook returns the new value', () => {
    const context = makeContext({ a: 'one' });
    let latest;
    function Reader() {
      latest = useFilterFieldValue('a');
      return null;
    }
    render(
      <FilterFieldStoreContext.Provider value={context}>
        <Reader />
      </FilterFieldStoreContext.Provider>,
    );
    expect(latest).toBe('one');

    act(() => {
      context.store.setValue('a', 'two');
    });

    expect(latest).toBe('two');
  });

  test('given a selector, when the underlying value changes but the selected value does not, then the component does not re-render', () => {
    const context = makeContext({ list: 'a,b' });
    let renders = 0;
    function Reader() {
      useFilterFieldValue('list', (raw) => raw.includes('a'));
      renders += 1;
      return null;
    }
    render(
      <FilterFieldStoreContext.Provider value={context}>
        <Reader />
      </FilterFieldStoreContext.Provider>,
    );
    const baseline = renders;

    act(() => {
      context.store.setValue('list', 'a,b,c');
    });
    expect(renders).toBe(baseline);

    act(() => {
      context.store.setValue('list', 'b,c');
    });
    expect(renders).toBe(baseline + 1);
  });

  test('given the key prop changes, when re-rendered, then it resubscribes to the new key', () => {
    const context = makeContext({ a: 'A', b: 'B' });
    let latest;
    function Reader({ field }) {
      latest = useFilterFieldValue(field);
      return null;
    }
    const tree = (field) => (
      <FilterFieldStoreContext.Provider value={context}>
        <Reader field={field} />
      </FilterFieldStoreContext.Provider>
    );
    const { rerender } = render(tree('a'));
    expect(latest).toBe('A');

    rerender(tree('b'));
    expect(latest).toBe('B');
    act(() => {
      context.store.setValue('b', 'B2');
    });
    expect(latest).toBe('B2');
    // The old key no longer drives this component.
    act(() => {
      context.store.setValue('a', 'A2');
    });
    expect(latest).toBe('B2');
  });

  test('given actions, when writing twice in a row, then each read sees the previous write', () => {
    const context = makeContext({ n: '' });
    let actions;
    function Writer() {
      actions = useFilterFieldActions();
      return null;
    }
    render(
      <FilterFieldStoreContext.Provider value={context}>
        <Writer />
      </FilterFieldStoreContext.Provider>,
    );

    actions.setFieldValue('n', '1');
    actions.setFieldValue('n', `${actions.getFieldValue('n')},2`);

    expect(actions.getFieldValue('n')).toBe('1,2');
  });

  test('given no provider at all, when the hooks are used, then they are inert and never throw', () => {
    let value;
    let actions;
    function Reader() {
      value = useFilterFieldValue('anything', (raw) => raw);
      actions = useFilterFieldActions();
      return null;
    }
    render(<Reader />);

    expect(value).toBeUndefined();
    expect(() => actions.setFieldValue('anything', 'x')).not.toThrow();
    expect(actions.getFieldValue('anything')).toBeUndefined();
  });
});
