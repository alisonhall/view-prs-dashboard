/** @jest-environment jsdom */

const React = require('react');
const { render, screen, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AlwaysShowInReviewCheckbox } = require('./AlwaysShowInReviewCheckbox');
const { FilterStateProvider } = require('../state/FilterStateProvider');

const renderWithProvider = (initialValues = { scopeMode: 'all', alwaysShowInReview: false }) =>
  render(
    <FilterStateProvider initialValues={initialValues}>
      <AlwaysShowInReviewCheckbox />
    </FilterStateProvider>,
  );

describe('AlwaysShowInReviewCheckbox', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
  });

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

  test('given a user clicks the checkbox, when clicking, then window.getFilterStateValues() reflects the new value', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);

    expect(window.getFilterStateValues().alwaysShowInReview).toBe(true);
  });

  test('given an external .click() (e.g. some other legacy code restoring a persisted override the old way), when the native click fires, then React state picks it up', async () => {
    const user = userEvent.setup();
    renderWithProvider();
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  test('given window.setFilterStateValue is called directly (the new restore path), when called, then the checkbox reflects the new value', () => {
    renderWithProvider();
    const checkbox = screen.getByRole('checkbox');

    act(() => {
      window.setFilterStateValue('alwaysShowInReview', true);
    });

    expect(checkbox).toBeChecked();
  });
});
