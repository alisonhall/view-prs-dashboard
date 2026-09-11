/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { FilterOptionSelect } = require('./FilterOptionSelect');

const OPTIONS = [
  { value: '', label: 'Any (with or without)' },
  { value: 'with', label: 'With custom comments' },
  { value: 'without', label: 'Without custom comments' },
];

describe('FilterOptionSelect', () => {
  test('given id/name/options props, when rendering, then all render correctly', () => {
    render(
      <FilterOptionSelect id="filter-custom-comments" name="filterCustomComments" options={OPTIONS} />,
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'filter-custom-comments');
    expect(select).toHaveAttribute('name', 'filterCustomComments');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  test('given no initialValue, when rendering, then defaults to the empty-value option', () => {
    render(<FilterOptionSelect id="x" name="x" options={OPTIONS} />);
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  test('given an initialValue, when rendering, then the select starts with that value', () => {
    render(<FilterOptionSelect id="x" name="x" options={OPTIONS} initialValue="with" />);
    expect(screen.getByRole('combobox')).toHaveValue('with');
  });

  test('given a user selects a different option, when selecting, then the displayed value updates', async () => {
    const user = userEvent.setup();
    render(<FilterOptionSelect id="x" name="x" options={OPTIONS} />);
    const select = screen.getByRole('combobox');

    await user.selectOptions(select, 'without');

    expect(select).toHaveValue('without');
  });

  test('given an external native value change (e.g. restoring a persisted override), when the native setter + change event fire, then React state picks it up', () => {
    render(<FilterOptionSelect id="x" name="x" options={OPTIONS} />);
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
