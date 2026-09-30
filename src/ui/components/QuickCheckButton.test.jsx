/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const { QuickCheckButton } = require('./QuickCheckButton');

describe('QuickCheckButton', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('given no interaction, when rendered, then it shows the default label, enabled', () => {
    render(<QuickCheckButton onCheck={() => Promise.resolve({ label: 'Quick check' })} />);
    const button = screen.getByRole('button', { name: 'Quick check' });
    expect(button).toBeEnabled();
    expect(document.getElementById('quick-check-btn')).toBe(button);
  });

  test('given a click, when the onCheck call is pending, then the button disables and shows "Checking..."', async () => {
    let resolveCheck;
    const onCheck = jest.fn(() => new Promise((resolve) => { resolveCheck = resolve; }));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<QuickCheckButton onCheck={onCheck} />);

    await user.click(screen.getByRole('button', { name: 'Quick check' }));

    expect(onCheck).toHaveBeenCalledTimes(1);
    const button = screen.getByRole('button', { name: 'Checking...' });
    expect(button).toBeDisabled();

    resolveCheck({ label: 'Quick check' });
  });

  test('given onCheck resolves with updates found and a resetAfterMs, when it settles, then the button shows that label immediately, re-enabled, then reverts after the delay', async () => {
    const onCheck = jest.fn(() => Promise.resolve({ label: '3 updates found', resetAfterMs: 2500 }));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<QuickCheckButton onCheck={onCheck} />);

    await user.click(screen.getByRole('button', { name: 'Quick check' }));

    const button = await screen.findByRole('button', { name: '3 updates found' });
    expect(button).toBeEnabled();

    jest.advanceTimersByTime(2500);
    expect(await screen.findByRole('button', { name: 'Quick check' })).toBeInTheDocument();
  });

  test('given onCheck resolves with a 409/immediate-revert descriptor (no resetAfterMs), when it settles, then the button reverts to the default label right away and stays there', async () => {
    const onCheck = jest.fn(() => Promise.resolve({ label: 'Quick check' }));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<QuickCheckButton onCheck={onCheck} />);

    await user.click(screen.getByRole('button', { name: 'Quick check' }));

    const button = await screen.findByRole('button', { name: 'Quick check' });
    expect(button).toBeEnabled();

    // No stray timer should fire and do anything unexpected.
    jest.advanceTimersByTime(5000);
    expect(screen.getByRole('button', { name: 'Quick check' })).toBeEnabled();
  });

  test('given a second click arrives while a pending reset timer is still running, when it fires, then the earlier timer is cancelled so it cannot clobber the new result', async () => {
    const onCheck = jest
      .fn()
      .mockResolvedValueOnce({ label: 'No changes found', resetAfterMs: 2500 })
      .mockResolvedValueOnce({ label: '5 updates found', resetAfterMs: 2500 });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<QuickCheckButton onCheck={onCheck} />);

    await user.click(screen.getByRole('button', { name: 'Quick check' }));
    await screen.findByRole('button', { name: 'No changes found' });

    // Click again before the first reset timer (2500ms) would have fired.
    jest.advanceTimersByTime(1000);
    await user.click(screen.getByRole('button', { name: 'No changes found' }));
    await screen.findByRole('button', { name: '5 updates found' });

    // Advance past when the FIRST timer would have fired - it must not
    // have reset the label back to "Quick check" out from under the
    // second result.
    jest.advanceTimersByTime(1600);
    expect(screen.getByRole('button', { name: '5 updates found' })).toBeInTheDocument();
  });
});
