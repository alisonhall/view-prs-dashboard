/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ContextFilterCheckbox } = require('./ContextFilterCheckbox');
const { FilterStateProvider: RealFilterStateProvider } = require('../../state/FilterStateProvider');
const { createFilterStateProbe } = require('../../test-fixtures/filter-state-probe');
const { RowFilterSelectionProvider } = require('../../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../../state/ChangeFilterActorSelectionProvider');

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// FilterStateProvider's own buildOverrides() now calls
// useRowFilterSelection()/useAuthorThreadResolutionSelection()/
// useChangeFilterActorSelection() directly (all 3 throw without a real
// Provider ancestor), so every render in this file needs them too.
function FilterStateProvider({ initialValues, children }) {
  return (
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <RealFilterStateProvider initialValues={initialValues}>
            <filterStateProbe.FilterStateProbe />
            {children}
          </RealFilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>
  );
}

const filterStateProbe = createFilterStateProbe();

const renderWithProvider = (initialValues, props) =>
  render(
    <FilterStateProvider initialValues={initialValues}>
      <ContextFilterCheckbox {...props} />
    </FilterStateProvider>,
  );

describe('ContextFilterCheckbox', () => {

  test('given the provider seeds false for this key, when rendering, then starts unchecked', () => {
    renderWithProvider(
      { attentionIncludePendingComments: false },
      { id: 'attention-include-pending-comments', name: 'attentionIncludePendingComments', filterStateKey: 'attentionIncludePendingComments' },
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('id', 'attention-include-pending-comments');
    expect(checkbox).toHaveAttribute('name', 'attentionIncludePendingComments');
    expect(checkbox).not.toBeChecked();
  });

  test('given the provider seeds true for this key, when rendering, then starts checked', () => {
    renderWithProvider(
      { attentionIncludePendingComments: true },
      { id: 'attention-include-pending-comments', name: 'attentionIncludePendingComments', filterStateKey: 'attentionIncludePendingComments' },
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('given a user clicks the checkbox, when clicking, then it toggles and filterStateProbe.readValues() reflects it', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      { attentionIgnoreMergeOnlyCommits: false },
      { id: 'attention-ignore-merge-only-commits', name: 'attentionIgnoreMergeOnlyCommits', filterStateKey: 'attentionIgnoreMergeOnlyCommits' },
    );
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(filterStateProbe.readValues().attentionIgnoreMergeOnlyCommits).toBe(true);

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('given multiple ContextFilterCheckbox instances with different keys, when one changes, then the other is unaffected', async () => {
    const user = userEvent.setup();
    render(
      <FilterStateProvider
        initialValues={{ attentionIncludeClosedMerged: false, attentionIncludeDraftChanged: false }}
      >
        <ContextFilterCheckbox
          id="attention-include-closed-merged"
          name="attentionIncludeClosedMerged"
          filterStateKey="attentionIncludeClosedMerged"
        />
        <ContextFilterCheckbox
          id="attention-include-draft-changed"
          name="attentionIncludeDraftChanged"
          filterStateKey="attentionIncludeDraftChanged"
        />
      </FilterStateProvider>,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });
});
