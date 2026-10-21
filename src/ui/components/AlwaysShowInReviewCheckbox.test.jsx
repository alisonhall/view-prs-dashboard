/** @jest-environment jsdom */

const { render, screen, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AlwaysShowInReviewCheckbox } = require('./AlwaysShowInReviewCheckbox');
const { FilterStateProvider } = require('../state/FilterStateProvider');
const { createFilterStateProbe } = require('../test-fixtures/filter-state-probe');
const { RowFilterSelectionProvider } = require('../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../state/ChangeFilterActorSelectionProvider');

const filterStateProbe = createFilterStateProbe();

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// FilterStateProvider's own buildOverrides() now calls
// useRowFilterSelection()/useAuthorThreadResolutionSelection()/
// useChangeFilterActorSelection() directly (all 3 throw without a real
// Provider ancestor), so every render here needs them too.
const renderWithProvider = (initialValues = { scopeMode: 'all', alwaysShowInReview: false }) =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={initialValues}>
            <filterStateProbe.FilterStateProbe />
            <AlwaysShowInReviewCheckbox />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('AlwaysShowInReviewCheckbox', () => {

  test('given the provider seeds false, when rendering, then starts unchecked', () => {
    renderWithProvider({ scopeMode: 'all', alwaysShowInReview: false });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('id', 'always-show-in-review');
    expect(checkbox).toHaveAttribute('name', 'alwaysShowInReview');
    expect(checkbox).not.toBeChecked();
  });

  test('given the provider seeds true, when rendering, then starts checked', () => {
    renderWithProvider({ scopeMode: 'all', alwaysShowInReview: true });
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('given a user clicks the checkbox, when clicking, then it toggles', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('given a user clicks the checkbox, when clicking, then filterStateProbe.readValues() reflects the new value', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);

    expect(filterStateProbe.readValues().alwaysShowInReview).toBe(true);
  });

  test('given an external .click() (e.g. some other legacy code restoring a persisted override the old way), when the native click fires, then React state picks it up', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  test('given setValue is called directly through the Context (the restore path), when called, then the checkbox reflects the new value', () => {
    renderWithProvider();
    const checkbox = screen.getByRole('checkbox');

    act(() => {
      filterStateProbe.setValue('alwaysShowInReview', true);
    });

    expect(checkbox).toBeChecked();
  });
});
