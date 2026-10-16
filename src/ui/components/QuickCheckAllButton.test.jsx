/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const { QuickCheckAllButton } = require('./QuickCheckAllButton');

describe('QuickCheckAllButton', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('given no interaction, when rendered, then it shows the default label, enabled', () => {
    render(<QuickCheckAllButton onCheck={() => Promise.resolve({ label: 'Quick check all' })} />);
    const button = screen.getByRole('button', { name: 'Quick check all' });
    expect(button).toBeEnabled();
    expect(document.getElementById('quick-check-all-btn')).toBe(button);
  });

  test('its tooltip warns that a CI/mergeability/thread-resolution-only change is not detected', () => {
    render(<QuickCheckAllButton onCheck={() => Promise.resolve({ label: 'Quick check all' })} />);
    const button = screen.getByRole('button', { name: 'Quick check all' });
    expect(button).toHaveAttribute('title', expect.stringContaining('updated at'));
    expect(button.getAttribute('title')).toMatch(/CI check finishing/);
  });

  test('given a click, when the onCheck call is pending, then the button disables and shows "Checking..."', async () => {
    let resolveCheck;
    const onCheck = jest.fn(() => new Promise((resolve) => { resolveCheck = resolve; }));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<QuickCheckAllButton onCheck={onCheck} />);

    await user.click(screen.getByRole('button', { name: 'Quick check all' }));

    expect(onCheck).toHaveBeenCalledTimes(1);
    const button = screen.getByRole('button', { name: 'Checking...' });
    expect(button).toBeDisabled();

    resolveCheck({ label: 'Quick check all' });
  });

  test('given onCheck resolves with updates found across repos and a resetAfterMs, when it settles, then the button shows that label immediately, re-enabled, then reverts after the delay', async () => {
    const onCheck = jest.fn(() =>
      Promise.resolve({ label: '3 updates found across 2 repos', resetAfterMs: 2500 }),
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<QuickCheckAllButton onCheck={onCheck} />);

    await user.click(screen.getByRole('button', { name: 'Quick check all' }));

    const button = await screen.findByRole('button', { name: '3 updates found across 2 repos' });
    expect(button).toBeEnabled();

    jest.advanceTimersByTime(2500);
    expect(await screen.findByRole('button', { name: 'Quick check all' })).toBeInTheDocument();
  });

  test('given onCheck resolves with the "nothing to check" descriptor and a resetAfterMs, when it settles, then the button shows that label immediately, re-enabled, then reverts after the delay', async () => {
    const onCheck = jest.fn(() =>
      Promise.resolve({ label: 'Nothing to check', resetAfterMs: 2500 }),
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<QuickCheckAllButton onCheck={onCheck} />);

    await user.click(screen.getByRole('button', { name: 'Quick check all' }));

    const button = await screen.findByRole('button', { name: 'Nothing to check' });
    expect(button).toBeEnabled();

    jest.advanceTimersByTime(2500);
    expect(await screen.findByRole('button', { name: 'Quick check all' })).toBeInTheDocument();
  });

  test('given onCheck throws, when it settles, then the button reverts to the default label', async () => {
    const onCheck = jest.fn(() => Promise.reject(new Error('network down')));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<QuickCheckAllButton onCheck={onCheck} />);

    await user.click(screen.getByRole('button', { name: 'Quick check all' }));

    const button = await screen.findByRole('button', { name: 'Quick check all' });
    expect(button).toBeEnabled();
  });
});
