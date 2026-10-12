/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { BackfillLogControls } = require('./BackfillLogControls');

describe('BackfillLogControls', () => {
  test('given default rendering, when checking the checkbox, then it starts checked and uncontrolled', () => {
    render(<BackfillLogControls />);

    const checkbox = screen.getByRole('checkbox', { name: /Auto-scroll log while running/ });
    expect(checkbox).toBeChecked();
  });

  test('given refreshLogDisabled is true, when rendering, then the refresh log button is disabled', () => {
    render(<BackfillLogControls refreshLogDisabled />);

    expect(screen.getByRole('button', { name: 'Refresh log' })).toBeDisabled();
  });

  test('given a user toggles the checkbox, when changed, then onAutoscrollChange fires', async () => {
    const onAutoscrollChange = jest.fn();
    const user = userEvent.setup();
    render(<BackfillLogControls onAutoscrollChange={onAutoscrollChange} />);

    await user.click(screen.getByRole('checkbox', { name: /Auto-scroll log while running/ }));

    expect(onAutoscrollChange).toHaveBeenCalledTimes(1);
  });

  test('given a user clicks "Refresh log", when clicked, then onRefreshLog fires', async () => {
    const onRefreshLog = jest.fn();
    const user = userEvent.setup();
    render(<BackfillLogControls onRefreshLog={onRefreshLog} />);

    await user.click(screen.getByRole('button', { name: 'Refresh log' }));

    expect(onRefreshLog).toHaveBeenCalledTimes(1);
  });
});
