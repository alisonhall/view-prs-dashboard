/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ContextFilterCheckbox } = require('./ContextFilterCheckbox');
const { FilterStateProvider } = require('../state/FilterStateProvider');

const renderWithProvider = (initialValues, props) =>
  render(
    <FilterStateProvider initialValues={initialValues}>
      <ContextFilterCheckbox {...props} />
    </FilterStateProvider>,
  );

describe('ContextFilterCheckbox', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
  });

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

  test('given a user clicks the checkbox, when clicking, then it toggles and window.getFilterStateValues() reflects it', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      { attentionIgnoreMergeOnlyCommits: false },
      { id: 'attention-ignore-merge-only-commits', name: 'attentionIgnoreMergeOnlyCommits', filterStateKey: 'attentionIgnoreMergeOnlyCommits' },
    );
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(window.getFilterStateValues().attentionIgnoreMergeOnlyCommits).toBe(true);

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
