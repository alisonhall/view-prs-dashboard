/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { PrNumberFilterInput } = require('./PrNumberFilterInput');
const { FilterStateProvider } = require('../state/FilterStateProvider');

const renderWithProvider = (filterPrNumbers = '') =>
  render(
    <FilterStateProvider initialValues={{ filterPrNumbers }}>
      <PrNumberFilterInput />
    </FilterStateProvider>,
  );

describe('PrNumberFilterInput', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
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

  test('given a user types into the input, when typing, then the displayed value updates and window.getFilterStateValues() reflects it', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const input = screen.getByPlaceholderText('912, 921');

    await user.type(input, '55');

    expect(input).toHaveValue('55');
    expect(window.getFilterStateValues().filterPrNumbers).toBe('55');
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
