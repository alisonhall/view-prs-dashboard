/** @jest-environment jsdom */

const { useEffect } = require('react');
const { render, screen, waitFor } = require('@testing-library/react');
require('@testing-library/jest-dom');
const userEvent = require('@testing-library/user-event').default;
const { useRowFilterSelection } = require('./RowFilterSelectionContext');
const { FilterStateProvider } = require('./FilterStateProvider');
const { RowFilterSelectionProvider } = require('./RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('./AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('./ChangeFilterActorSelectionProvider');
const { useTableFilterChips } = require('./useTableFilterChips');

function Probe() {
  const { chips } = useTableFilterChips();
  return (
    <ul>
      {chips.map((chip) => (
        <li key={chip.id}>
          {chip.label}
          <button type="button" onClick={chip.onRemove} aria-label={`remove ${chip.label}`} />
        </li>
      ))}
    </ul>
  );
}

function Seed({ listId, values }) {
  const { setChecked } = useRowFilterSelection();
  useEffect(() => {
    setChecked(listId, values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const renderProbe = ({ filterStateValues, seedListId, seedValues } = {}) =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider
            initialValues={{
              scopeMode: 'all',
              filterPrNumbers: '',
              alwaysShowInReview: false,
              filterCustomComments: '',
              filterOtherNotes: '',
              filterPrDifficulty: '',
              filterRallyStories: '',
              filterRallyLinks: '',
              filterAnalysisOfPr: '',
              ...filterStateValues,
            }}
          >
            {seedListId && <Seed listId={seedListId} values={seedValues} />}
            <Probe />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('useTableFilterChips', () => {
  test('given no non-default filters, when rendered, then returns no chips', () => {
    renderProbe();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  test('given a non-default field (filterPrNumbers), when its chip is removed, then the Context value resets to the default', async () => {
    const user = userEvent.setup();
    renderProbe({ filterStateValues: { filterPrNumbers: '42' } });

    expect(screen.getByText('PR #: 42')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'remove PR #: 42' }));

    // filterPrNumbers is debounced the same way the table's own live
    // filtering is (useVisiblePrNumbers.tsx) - the chip's disappearance
    // lags the click by up to FILTER_PR_NUMBERS_DEBOUNCE_MS, same as
    // typing into the real field would.
    await waitFor(() => expect(screen.queryByText('PR #: 42')).not.toBeInTheDocument());
  });

  test('given a checked label (RowFilterSelectionContext), when its chip is removed, then that label is unchecked', async () => {
    const user = userEvent.setup();
    renderProbe({ seedListId: 'label-list', seedValues: ['bug', 'docs'] });

    expect(screen.getByText('Label: bug')).toBeInTheDocument();
    expect(screen.getByText('Label: docs')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'remove Label: bug' }));

    expect(screen.queryByText('Label: bug')).not.toBeInTheDocument();
    expect(screen.getByText('Label: docs')).toBeInTheDocument();
  });

  test('given a non-default boolean field (alwaysShowInReview), when rendered, then shows its chip', () => {
    renderProbe({ filterStateValues: { alwaysShowInReview: true } });
    expect(screen.getByText('Always show in review')).toBeInTheDocument();
  });

  test('given openMode set to a non-default value, when rendered, then no chip is shown - openMode is a Run Script option, not a row filter', () => {
    renderProbe({ filterStateValues: { openMode: 'changed' } });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
