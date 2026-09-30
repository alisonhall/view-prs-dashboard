/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { FilterOptionSelect } = require('./FilterOptionSelect');
const { FilterStateProvider } = require('../state/FilterStateProvider');

const OPTIONS = [
  { value: '', label: 'Any (with or without)' },
  { value: 'with', label: 'With custom comments' },
  { value: 'without', label: 'Without custom comments' },
];

const renderWithProvider = (initialValues, props) =>
  render(
    <FilterStateProvider initialValues={initialValues}>
      <FilterOptionSelect {...props} />
    </FilterStateProvider>,
  );

describe('FilterOptionSelect', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
  });

  test('given id/name/options props, when rendering, then all render correctly', () => {
    renderWithProvider(
      { filterCustomComments: '' },
      { id: 'filter-custom-comments', name: 'filterCustomComments', options: OPTIONS, filterStateKey: 'filterCustomComments' },
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'filter-custom-comments');
    expect(select).toHaveAttribute('name', 'filterCustomComments');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  test('given no seeded value, when rendering, then defaults to the empty-value option', () => {
    renderWithProvider({ x: '' }, { id: 'x', name: 'x', options: OPTIONS, filterStateKey: 'x' });
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  test('given a seeded value, when rendering, then the select starts with that value', () => {
    renderWithProvider({ x: 'with' }, { id: 'x', name: 'x', options: OPTIONS, filterStateKey: 'x' });
    expect(screen.getByRole('combobox')).toHaveValue('with');
  });

  test('given a user selects a different option, when selecting, then the displayed value updates', async () => {
    const user = userEvent.setup();
    renderWithProvider({ x: '' }, { id: 'x', name: 'x', options: OPTIONS, filterStateKey: 'x' });
    const select = screen.getByRole('combobox');

    await user.selectOptions(select, 'without');

    expect(select).toHaveValue('without');
    expect(window.getFilterStateValues().x).toBe('without');
  });

  test('given an external native value change (e.g. some other legacy code manipulating this element directly), when the native setter + change event fire, then React state picks it up', () => {
    renderWithProvider({ x: '' }, { id: 'x', name: 'x', options: OPTIONS, filterStateKey: 'x' });
    const select = screen.getByRole('combobox');

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    ).set;
    nativeSetter.call(select, 'with');
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(select).toHaveValue('with');
  });
});
