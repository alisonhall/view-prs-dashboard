/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { RowFilterSelectionProvider } = require('./RowFilterSelectionProvider');
const { useRowFilterSelection } = require('./RowFilterSelectionContext');

function Probe() {
  const { checkedByListId, toggle, setChecked } = useRowFilterSelection();
  const authorChecked = Array.from(checkedByListId['author-list'] || []).sort().join(',');
  const labelChecked = Array.from(checkedByListId['label-list'] || []).sort().join(',');
  return (
    <div>
      <span data-testid="author-checked">{authorChecked}</span>
      <span data-testid="label-checked">{labelChecked}</span>
      <button onClick={() => toggle('author-list', 'alice')}>toggle alice</button>
      <button onClick={() => setChecked('label-list', ['bug', 'docs'])}>seed labels</button>
    </div>
  );
}

describe('RowFilterSelectionProvider', () => {
  test('given no selections, when rendering, then checkedByListId starts empty', () => {
    render(
      <RowFilterSelectionProvider>
        <Probe />
      </RowFilterSelectionProvider>,
    );

    expect(screen.getByTestId('author-checked')).toHaveTextContent('');
    expect(screen.getByTestId('label-checked')).toHaveTextContent('');
  });

  test('given toggle is called on an unchecked value, when it runs, then that value becomes checked for that list only', async () => {
    const user = userEvent.setup();
    render(
      <RowFilterSelectionProvider>
        <Probe />
      </RowFilterSelectionProvider>,
    );

    await user.click(screen.getByText('toggle alice'));

    expect(screen.getByTestId('author-checked')).toHaveTextContent('alice');
    expect(screen.getByTestId('label-checked')).toHaveTextContent('');
  });

  test('given toggle is called twice on the same value, when the second call runs, then it unchecks again', async () => {
    const user = userEvent.setup();
    render(
      <RowFilterSelectionProvider>
        <Probe />
      </RowFilterSelectionProvider>,
    );

    await user.click(screen.getByText('toggle alice'));
    await user.click(screen.getByText('toggle alice'));

    expect(screen.getByTestId('author-checked')).toHaveTextContent('');
  });

  test('given setChecked is called, when it runs, then it replaces that list\'s entire checked set', async () => {
    const user = userEvent.setup();
    render(
      <RowFilterSelectionProvider>
        <Probe />
      </RowFilterSelectionProvider>,
    );

    await user.click(screen.getByText('seed labels'));

    expect(screen.getByTestId('label-checked')).toHaveTextContent('bug,docs');
  });

  test('given no RowFilterSelectionProvider ancestor, when useRowFilterSelection is called, then it throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(
      'useRowFilterSelection() must be called within a <RowFilterSelectionProvider>',
    );
    errorSpy.mockRestore();
  });
});
