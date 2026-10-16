/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { BackfillControls } = require('./BackfillControls');

describe('BackfillControls', () => {
  test('given no buttonState, when rendering, then nothing is disabled', () => {
    render(<BackfillControls />);

    expect(screen.getByRole('button', { name: 'Start backfill' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop backfill' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeEnabled();
  });

  test('given buttonState disables each button, when rendering, then each is disabled', () => {
    render(
      <BackfillControls
        buttonState={{ startDisabled: true, stopDisabled: false, refreshDisabled: true }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Start backfill' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop backfill' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled();
  });

  test('given a user clicks each button, when clicked, then the matching callback fires', async () => {
    const onStart = jest.fn();
    const onStop = jest.fn();
    const onRefreshStatus = jest.fn();
    const user = userEvent.setup();
    render(
      <BackfillControls
        buttonState={{ startDisabled: false, stopDisabled: false, refreshDisabled: false }}
        onStart={onStart}
        onStop={onStop}
        onRefreshStatus={onRefreshStatus}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Start backfill' }));
    await user.click(screen.getByRole('button', { name: 'Stop backfill' }));
    await user.click(screen.getByRole('button', { name: 'Refresh status' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onRefreshStatus).toHaveBeenCalledTimes(1);
  });
});
