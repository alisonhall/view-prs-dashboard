/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { PrNumberFilterInput } = require('./PrNumberFilterInput');
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
const renderWithProvider = (filterPrNumbers = '') =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={{ filterPrNumbers }}>
            <filterStateProbe.FilterStateProbe />
            <PrNumberFilterInput />
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

describe('PrNumberFilterInput', () => {

  // Window-bridge elimination Phase 7.5: index.page.js used to add these by
  // DOM id after React rendered the input.
  test('given the input renders, when read, then it carries the non-credential-field hints', () => {
    renderWithProvider('');
    const input = screen.getByPlaceholderText('912, 921');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('data-lpignore', 'true');
    expect(input).toHaveAttribute('data-1p-ignore', 'true');
    expect(input).toHaveAttribute('data-bwignore', 'true');
    expect(input).toHaveAttribute('data-form-type', 'other');
  });

  test('given the provider seeds an empty value, when rendering, then renders an empty input with the expected id/name', () => {
    renderWithProvider('');
    const input = screen.getByPlaceholderText('912, 921');
    expect(input).toHaveAttribute('id', 'filter-pr-numbers');
    expect(input).toHaveAttribute('name', 'filterPrNumbers');
    expect(input).toHaveValue('');
  });

  test('given the provider seeds a value, when rendering, then the input starts with that value', () => {
    renderWithProvider('912,921');
    expect(screen.getByPlaceholderText('912, 921')).toHaveValue('912,921');
  });

  test('given a user types into the input, when typing, then the displayed value updates and filterStateProbe.readValues() reflects it', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const input = screen.getByPlaceholderText('912, 921');

    await user.type(input, '55');

    expect(input).toHaveValue('55');
    expect(filterStateProbe.readValues().filterPrNumbers).toBe('55');
  });

  test('given an external native value change (e.g. some other legacy code manipulating this element directly), when the native setter + input event fire, then React state picks it up', () => {
    renderWithProvider();
    const input = screen.getByPlaceholderText('912, 921');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    nativeSetter.call(input, '3');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(input).toHaveValue('3');
  });
});
