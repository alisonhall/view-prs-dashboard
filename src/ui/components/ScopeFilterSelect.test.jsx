/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ScopeFilterSelect } = require('./ScopeFilterSelect');
const { FilterStateProvider } = require('../state/FilterStateProvider');

const renderWithProvider = (initialValues = { scopeMode: 'all', alwaysShowInReview: false }) =>
  render(
    <FilterStateProvider initialValues={initialValues}>
      <ScopeFilterSelect />
    </FilterStateProvider>,
  );

describe('ScopeFilterSelect', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
  });

  test('given the provider seeds "all", when rendering, then the select starts with that value', () => {
    renderWithProvider({ scopeMode: 'all', alwaysShowInReview: false });
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'scope-mode');
    expect(select).toHaveAttribute('name', 'scopeMode');
    expect(select).toHaveValue('all');
  });

  test('given the provider seeds a non-default value, when rendering, then the select starts with that value', () => {
    renderWithProvider({ scopeMode: 'needs-attention', alwaysShowInReview: false });
    expect(screen.getByRole('combobox')).toHaveValue('needs-attention');
  });

  test('given a user selects a different option, when selecting, then the displayed value updates', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const select = screen.getByRole('combobox');

    await user.selectOptions(select, 'last-run');

    expect(select).toHaveValue('last-run');
  });

  test('given a user selects a different option, when selecting, then window.getFilterStateValues() reflects the new value', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const select = screen.getByRole('combobox');

    await user.selectOptions(select, 'last-run');

    expect(window.getFilterStateValues().scopeMode).toBe('last-run');
  });

  test('given an external native value change (e.g. some other legacy code manipulating this element directly), when the native setter + change event fire, then React state picks it up', () => {
    renderWithProvider();
    const select = screen.getByRole('combobox');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    ).set;
    nativeSetter.call(select, 'needs-attention-or-interacted');
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(select).toHaveValue('needs-attention-or-interacted');
  });
});
