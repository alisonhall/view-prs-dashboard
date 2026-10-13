/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ChangeFilterActorSelectionProvider } = require('./ChangeFilterActorSelectionProvider');
const { useChangeFilterActorSelection } = require('./ChangeFilterActorSelectionContext');

function Probe() {
  const { checkedByListId, toggle, setChecked } = useChangeFilterActorSelection();
  const commentAuthorsChecked = Array.from(checkedByListId['change-filter-ignore-comment-authors-list'] || [])
    .sort()
    .join(',');
  const reviewAuthorsChecked = Array.from(checkedByListId['change-filter-ignore-review-authors-list'] || [])
    .sort()
    .join(',');
  return (
    <div>
      <span data-testid="comment-authors-checked">{commentAuthorsChecked}</span>
      <span data-testid="review-authors-checked">{reviewAuthorsChecked}</span>
      <button onClick={() => toggle('change-filter-ignore-comment-authors-list', 'alice')}>toggle alice</button>
      <button onClick={() => setChecked('change-filter-ignore-review-authors-list', ['bob', 'carol'])}>
        seed review authors
      </button>
    </div>
  );
}

describe('ChangeFilterActorSelectionProvider', () => {
  test('given no selections, when rendering, then checkedByListId starts empty', () => {
    render(
      <ChangeFilterActorSelectionProvider>
        <Probe />
      </ChangeFilterActorSelectionProvider>,
    );

    expect(screen.getByTestId('comment-authors-checked')).toHaveTextContent('');
    expect(screen.getByTestId('review-authors-checked')).toHaveTextContent('');
  });

  test('given toggle is called on an unchecked value, when it runs, then that value becomes checked for that list only', async () => {
    const user = userEvent.setup();
    render(
      <ChangeFilterActorSelectionProvider>
        <Probe />
      </ChangeFilterActorSelectionProvider>,
    );

    await user.click(screen.getByText('toggle alice'));

    expect(screen.getByTestId('comment-authors-checked')).toHaveTextContent('alice');
    expect(screen.getByTestId('review-authors-checked')).toHaveTextContent('');
  });

  test('given toggle is called twice on the same value, when the second call runs, then it unchecks again', async () => {
    const user = userEvent.setup();
    render(
      <ChangeFilterActorSelectionProvider>
        <Probe />
      </ChangeFilterActorSelectionProvider>,
    );

    await user.click(screen.getByText('toggle alice'));
    await user.click(screen.getByText('toggle alice'));

    expect(screen.getByTestId('comment-authors-checked')).toHaveTextContent('');
  });

  test("given setChecked is called, when it runs, then it replaces that list's entire checked set", async () => {
    const user = userEvent.setup();
    render(
      <ChangeFilterActorSelectionProvider>
        <Probe />
      </ChangeFilterActorSelectionProvider>,
    );

    await user.click(screen.getByText('seed review authors'));

    expect(screen.getByTestId('review-authors-checked')).toHaveTextContent('bob,carol');
  });

  test('given no ChangeFilterActorSelectionProvider ancestor, when useChangeFilterActorSelection is called, then it throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(
      'useChangeFilterActorSelection() must be called within a <ChangeFilterActorSelectionProvider>',
    );
    errorSpy.mockRestore();
  });
});
