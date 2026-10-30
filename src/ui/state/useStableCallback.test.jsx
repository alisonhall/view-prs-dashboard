/** @jest-environment jsdom */

const { render } = require('@testing-library/react');
const { useStableCallback } = require('./useStableCallback');

let captured;
function Probe({ callback }) {
  captured = useStableCallback(callback);
  return null;
}

describe('useStableCallback', () => {
  beforeEach(() => {
    captured = undefined;
  });

  test('given re-renders with a new callback each time, when rendered, then the returned function identity never changes', () => {
    const { rerender } = render(<Probe callback={() => 1} />);
    const first = captured;

    rerender(<Probe callback={() => 2} />);
    rerender(<Probe callback={() => 3} />);

    expect(captured).toBe(first);
  });

  test('given the callback changed on a later render, when the returned function is called, then it calls the latest callback with the same arguments and returns its result', () => {
    const older = jest.fn(() => 'older');
    const latest = jest.fn(() => 'latest');
    const { rerender } = render(<Probe callback={older} />);
    const stable = captured;

    rerender(<Probe callback={latest} />);

    expect(stable('a', 2)).toBe('latest');
    expect(latest).toHaveBeenCalledWith('a', 2);
    expect(older).not.toHaveBeenCalled();
  });

  test('given no callback, when the returned function is called, then it returns undefined instead of throwing', () => {
    render(<Probe callback={undefined} />);

    expect(captured()).toBeUndefined();
  });
});
