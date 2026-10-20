/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { OpenModeSelect } = require('./OpenModeSelect');
const { FilterStateProvider } = require('../state/FilterStateProvider');
const { RowFilterSelectionProvider } = require('../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../state/ChangeFilterActorSelectionProvider');

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// FilterStateProvider's own buildOverrides() now calls
// useRowFilterSelection()/useAuthorThreadResolutionSelection()/
// useChangeFilterActorSelection() directly (all 3 throw without a real
// Provider ancestor), so every render here needs them too.
const renderWithProvider = (openMode = 'none') =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={{ openMode }}>
            <OpenModeSelect />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('OpenModeSelect', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
  });

  test('given the provider seeds "none", when rendering, then the select starts with that value', () => {
    renderWithProvider('none');
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'open-mode');
    expect(select).toHaveAttribute('name', 'openMode');
    expect(select).toHaveValue('none');
  });

  test('given the provider seeds a non-default value, when rendering, then the select starts with that value', () => {
    renderWithProvider('changed');
    expect(screen.getByRole('combobox')).toHaveValue('changed');
  });

  test('given a user selects a different option, when selecting, then the displayed value updates', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const select = screen.getByRole('combobox');

    await user.selectOptions(select, 'all');

    expect(select).toHaveValue('all');
    expect(window.getFilterStateValues().openMode).toBe('all');
  });

  test('given an external native value change (e.g. some other legacy code manipulating this element directly), when the native setter + change event fire, then React state picks it up', () => {
    renderWithProvider();
    const select = screen.getByRole('combobox');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    ).set;
    nativeSetter.call(select, 'changed');
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(select).toHaveValue('changed');
  });
});
