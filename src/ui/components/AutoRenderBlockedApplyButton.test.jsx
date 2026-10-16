/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AutoRenderBlockedApplyButton } = require('./AutoRenderBlockedApplyButton');
const { AutoRenderBlockingContext } = require('../state/AutoRenderBlockingContext');

describe('AutoRenderBlockedApplyButton', () => {
  test('given a user clicks the button, when clicked, then it calls discardAndApply', async () => {
    const discardAndApply = jest.fn();
    const user = userEvent.setup();
    render(
      <AutoRenderBlockingContext.Provider
        value={{ isBlocked: true, statusText: '', discardAndApply }}
      >
        <AutoRenderBlockedApplyButton />
      </AutoRenderBlockingContext.Provider>,
    );

    await user.click(screen.getByRole('button', { name: 'Discard unsaved' }));

    expect(discardAndApply).toHaveBeenCalledTimes(1);
  });

  test('given no Provider ancestor, when clicked, then nothing throws (safe default no-op)', async () => {
    const user = userEvent.setup();
    render(<AutoRenderBlockedApplyButton />);

    await expect(user.click(screen.getByRole('button', { name: 'Discard unsaved' }))).resolves.not.toThrow();
  });
});
