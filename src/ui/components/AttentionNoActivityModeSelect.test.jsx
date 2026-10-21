/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AttentionNoActivityModeSelect } = require('./AttentionNoActivityModeSelect');
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
const renderWithProvider = (attentionNoActivityMode = 'all') =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={{ attentionNoActivityMode }}>
            <filterStateProbe.FilterStateProbe />
            <AttentionNoActivityModeSelect />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('AttentionNoActivityModeSelect', () => {

  test('given the provider seeds "all", when rendering, then the select starts with that value', () => {
    renderWithProvider('all');
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'attention-no-activity-mode');
    expect(select).toHaveAttribute('name', 'attentionNoActivityMode');
    expect(select).toHaveValue('all');
  });

  test('given the provider seeds a non-default value, when rendering, then the select starts with that value', () => {
    renderWithProvider('mine-only');
    expect(screen.getByRole('combobox')).toHaveValue('mine-only');
  });

  test('given a user selects a different option, when selecting, then the displayed value updates', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const select = screen.getByRole('combobox');

    await user.selectOptions(select, 'none');

    expect(select).toHaveValue('none');
    expect(filterStateProbe.readValues().attentionNoActivityMode).toBe('none');
  });

  test('given an external native value change, when the native setter + change event fire, then React state picks it up', () => {
    renderWithProvider();
    const select = screen.getByRole('combobox');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    ).set;
    nativeSetter.call(select, 'reviewer-only');
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(select).toHaveValue('reviewer-only');
  });
});
