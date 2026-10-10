/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { useDebouncedValue } = require('./useDebouncedValue');

function Probe({ value, onRender }) {
  const debounced = useDebouncedValue(value, 150);
  onRender(debounced);
  return null;
}

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('given the initial render, when it happens, then the initial value is returned immediately (no delay)', () => {
    const onRender = jest.fn();
    render(<Probe value="a" onRender={onRender} />);

    expect(onRender).toHaveBeenLastCalledWith('a');
  });

  test('given a value change, when the delay has not elapsed yet, then the OLD value is still returned', () => {
    const onRender = jest.fn();
    const { rerender } = render(<Probe value="a" onRender={onRender} />);

    rerender(<Probe value="b" onRender={onRender} />);
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(onRender).toHaveBeenLastCalledWith('a');
  });

  test('given a value change, when the delay elapses, then the NEW value is returned', () => {
    const onRender = jest.fn();
    const { rerender } = render(<Probe value="a" onRender={onRender} />);

    rerender(<Probe value="b" onRender={onRender} />);
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(onRender).toHaveBeenLastCalledWith('b');
  });

  test('given rapid successive changes (e.g. fast typing), when they happen within the delay of each other, then only the FINAL value is ever returned - no flicker through intermediate values', () => {
    const onRender = jest.fn();
    const { rerender } = render(<Probe value="1" onRender={onRender} />);

    rerender(<Probe value="12" onRender={onRender} />);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender(<Probe value="123" onRender={onRender} />);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    // Still within 150ms of the latest change - old value held.
    expect(onRender).toHaveBeenLastCalledWith('1');

    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(onRender).toHaveBeenLastCalledWith('123');
  });
});
