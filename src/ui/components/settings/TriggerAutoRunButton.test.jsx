/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const { TriggerAutoRunButton } = require('./TriggerAutoRunButton');

describe('TriggerAutoRunButton', () => {
  test('given no interaction, when rendered, then it shows the default label, enabled', () => {
    render(<TriggerAutoRunButton onTrigger={() => Promise.resolve()} />);
    const button = screen.getByRole('button', { name: 'Full refresh now' });
    expect(button).toBeEnabled();
    expect(document.getElementById('trigger-auto-run-btn')).toBe(button);
  });

  test('given a click, when the onTrigger call is pending, then the button disables and shows "Starting..."', async () => {
    let resolveTrigger;
    const onTrigger = jest.fn(() => new Promise((resolve) => { resolveTrigger = resolve; }));
    const user = userEvent.setup();
    render(<TriggerAutoRunButton onTrigger={onTrigger} />);

    await user.click(screen.getByRole('button', { name: 'Full refresh now' }));

    expect(onTrigger).toHaveBeenCalledTimes(1);
    const button = screen.getByRole('button', { name: 'Starting...' });
    expect(button).toBeDisabled();

    resolveTrigger();
  });

  test('given onTrigger resolves, when it settles, then the button re-enables and reverts to the default label', async () => {
    const onTrigger = jest.fn(() => Promise.resolve());
    const user = userEvent.setup();
    render(<TriggerAutoRunButton onTrigger={onTrigger} />);

    await user.click(screen.getByRole('button', { name: 'Full refresh now' }));

    const button = await screen.findByRole('button', { name: 'Full refresh now' });
    expect(button).toBeEnabled();
  });
});
