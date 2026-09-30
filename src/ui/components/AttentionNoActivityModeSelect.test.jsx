/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AttentionNoActivityModeSelect } = require('./AttentionNoActivityModeSelect');
const { FilterStateProvider } = require('../state/FilterStateProvider');

const renderWithProvider = (attentionNoActivityMode = 'all') =>
  render(
    <FilterStateProvider initialValues={{ attentionNoActivityMode }}>
      <AttentionNoActivityModeSelect />
    </FilterStateProvider>,
  );

describe('AttentionNoActivityModeSelect', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
  });

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
    expect(window.getFilterStateValues().attentionNoActivityMode).toBe('none');
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
