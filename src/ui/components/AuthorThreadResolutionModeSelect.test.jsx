/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorThreadResolutionModeSelect } = require('./AuthorThreadResolutionModeSelect');
const { FilterStateProvider } = require('../state/FilterStateProvider');

const renderWithProvider = (attentionAuthorThreadResolutionMode = 'allow-all') =>
  render(
    <FilterStateProvider initialValues={{ attentionAuthorThreadResolutionMode }}>
      <AuthorThreadResolutionModeSelect />
    </FilterStateProvider>,
  );

describe('AuthorThreadResolutionModeSelect', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
  });

  test('given the provider seeds "allow-all", when rendering, then the select starts with that value', () => {
    renderWithProvider('allow-all');
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'attention-author-thread-resolution-mode');
    expect(select).toHaveAttribute('name', 'attentionAuthorThreadResolutionMode');
    expect(select).toHaveValue('allow-all');
  });

  test('given the provider seeds a non-default value, when rendering, then the select starts with that value', () => {
    renderWithProvider('deny-only');
    expect(screen.getByRole('combobox')).toHaveValue('deny-only');
  });

  test('given a user selects a different option, when selecting, then the displayed value updates and a real change event fires', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    renderWithProvider();
    const select = screen.getByRole('combobox');
    select.addEventListener('change', handleChange);

    await user.selectOptions(select, 'allow-only');

    expect(select).toHaveValue('allow-only');
    // Vanilla's updateAuthorThreadResolutionRuleVisibility() is wired via a
    // real addEventListener("change", ...) on this element's id - confirm
    // a real native change event still reaches such a listener.
    expect(handleChange).toHaveBeenCalled();
    expect(window.getFilterStateValues().attentionAuthorThreadResolutionMode).toBe('allow-only');
  });

  test('given an external native value change, when the native setter + change event fire, then React state picks it up', () => {
    renderWithProvider();
    const select = screen.getByRole('combobox');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    ).set;
    nativeSetter.call(select, 'deny-only');
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(select).toHaveValue('deny-only');
  });
});
