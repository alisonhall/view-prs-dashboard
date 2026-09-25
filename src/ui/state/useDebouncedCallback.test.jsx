/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { useDebouncedEffect } = require('./useDebouncedCallback');

function Probe({ value, callback }) {
  useDebouncedEffect(callback, [value], 150);
  return null;
}

describe('useDebouncedEffect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('given the initial render, when it happens, then the callback is not called even after the delay', () => {
    const callback = jest.fn();
    render(<Probe value="a" callback={callback} />);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  test('given a dependency change, when the delay elapses, then the callback fires once', () => {
    const callback = jest.fn();
    const { rerender } = render(<Probe value="a" callback={callback} />);

    rerender(<Probe value="b" callback={callback} />);
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('given a second dependency change before the delay elapses, when it happens, then the earlier pending call is cancelled', () => {
    const callback = jest.fn();
    const { rerender } = render(<Probe value="a" callback={callback} />);

    rerender(<Probe value="b" callback={callback} />);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender(<Probe value="c" callback={callback} />);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
