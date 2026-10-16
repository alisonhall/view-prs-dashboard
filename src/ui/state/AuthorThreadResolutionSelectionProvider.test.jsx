/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorThreadResolutionSelectionProvider } = require('./AuthorThreadResolutionSelectionProvider');
const { useAuthorThreadResolutionSelection } = require('./AuthorThreadResolutionSelectionContext');

function Probe() {
  const { checkedByListId, toggle, setChecked } = useAuthorThreadResolutionSelection();
  const allowChecked = Array.from(checkedByListId['attention-author-thread-resolution-allow-list'] || [])
    .sort()
    .join(',');
  const denyChecked = Array.from(checkedByListId['attention-author-thread-resolution-deny-list'] || [])
    .sort()
    .join(',');
  return (
    <div>
      <span data-testid="allow-checked">{allowChecked}</span>
      <span data-testid="deny-checked">{denyChecked}</span>
      <button onClick={() => toggle('attention-author-thread-resolution-allow-list', 'alice')}>
        toggle alice allow
      </button>
      <button onClick={() => setChecked('attention-author-thread-resolution-deny-list', ['bob', 'carol'])}>
        seed deny
      </button>
    </div>
  );
}

describe('AuthorThreadResolutionSelectionProvider', () => {
  test('given no selections, when rendering, then checkedByListId starts empty', () => {
    render(
      <AuthorThreadResolutionSelectionProvider>
        <Probe />
      </AuthorThreadResolutionSelectionProvider>,
    );

    expect(screen.getByTestId('allow-checked')).toHaveTextContent('');
    expect(screen.getByTestId('deny-checked')).toHaveTextContent('');
  });

  test('given toggle is called on an unchecked value, when it runs, then that value becomes checked for that list only', async () => {
    const user = userEvent.setup();
    render(
      <AuthorThreadResolutionSelectionProvider>
        <Probe />
      </AuthorThreadResolutionSelectionProvider>,
    );

    await user.click(screen.getByText('toggle alice allow'));

    expect(screen.getByTestId('allow-checked')).toHaveTextContent('alice');
    expect(screen.getByTestId('deny-checked')).toHaveTextContent('');
  });

  test('given toggle is called twice on the same value, when the second call runs, then it unchecks again', async () => {
    const user = userEvent.setup();
    render(
      <AuthorThreadResolutionSelectionProvider>
        <Probe />
      </AuthorThreadResolutionSelectionProvider>,
    );

    await user.click(screen.getByText('toggle alice allow'));
    await user.click(screen.getByText('toggle alice allow'));

    expect(screen.getByTestId('allow-checked')).toHaveTextContent('');
  });

  test("given setChecked is called, when it runs, then it replaces that list's entire checked set", async () => {
    const user = userEvent.setup();
    render(
      <AuthorThreadResolutionSelectionProvider>
        <Probe />
      </AuthorThreadResolutionSelectionProvider>,
    );

    await user.click(screen.getByText('seed deny'));

    expect(screen.getByTestId('deny-checked')).toHaveTextContent('bob,carol');
  });

  test('given no AuthorThreadResolutionSelectionProvider ancestor, when useAuthorThreadResolutionSelection is called, then it throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(
      'useAuthorThreadResolutionSelection() must be called within a <AuthorThreadResolutionSelectionProvider>',
    );
    errorSpy.mockRestore();
  });
});
