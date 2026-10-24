/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { RunScriptActionButton } = require('./RunScriptActionButton');

describe('RunScriptActionButton', () => {
  test('given id/label/title/className props, when rendering, then it renders a plain enabled button with them', () => {
    render(
      <RunScriptActionButton id="refresh-labels-btn" label="Refresh" title="Reload labels" className="my-class" />,
    );

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveAttribute('id', 'refresh-labels-btn');
    expect(button).toHaveAttribute('title', 'Reload labels');
    expect(button).toHaveClass('my-class');
    expect(button).toBeEnabled();
  });

  test('given a user clicks the button, when clicked, then onClick fires', async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();
    render(<RunScriptActionButton id="run-script-btn" label="Run script" onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Run script' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('given no onClick prop, when clicked, then nothing throws (safe no-op)', async () => {
    const user = userEvent.setup();
    render(<RunScriptActionButton id="ack-only-btn" label="Apply ack only" />);

    await expect(
      user.click(screen.getByRole('button', { name: 'Apply ack only' })),
    ).resolves.not.toThrow();
  });
});
