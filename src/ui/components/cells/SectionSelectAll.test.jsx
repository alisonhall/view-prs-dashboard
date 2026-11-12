/** @jest-environment jsdom */

const { render, screen, act, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { SectionSelectAll } = require('./SectionSelectAll');
const { PrSelectionCell } = require('./PrSelectionCell');
const { FilterStateProvider } = require('../../state/FilterStateProvider');
const { useFilterState } = require('../../state/FilterStateContext');
const { RowFilterSelectionProvider } = require('../../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../../state/ChangeFilterActorSelectionProvider');

// The real FilterStateProvider (and the selection Providers it needs), as
// for PrSelectionCell: both read and write its "PR number(s)" field.
let filterState;
function StateProbe() {
  filterState = useFilterState();
  return null;
}

const entry = (number) => ({ prNumber: number, repo: 'o/r', section: 'open', data: { number } });

const renderSection = (prNumbersInput, numbers = ['101', '102', '103']) =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={{ prNumbersInput }}>
            <StateProbe />
            <table>
              <thead>
                <tr>
                  <th>
                    <SectionSelectAll prs={numbers.map(entry)} sectionLabel="Open PRs" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((number) => (
                  <tr key={number}>
                    <PrSelectionCell pr={{ number }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

const selectAll = () => screen.getByRole('checkbox', { name: 'Select all PRs in Open PRs' });
const rowBox = (number) => screen.getByRole('checkbox', { name: `Select PR #${number}` });
const field = () => filterState.values.prNumbersInput;

describe('SectionSelectAll', () => {
  test('given none of the section selected, then it is unticked; a click ticks every row, keeping PRs selected elsewhere', () => {
    renderSection('999');
    expect(selectAll()).not.toBeChecked();
    expect(selectAll()).not.toBePartiallyChecked();

    fireEvent.click(selectAll());

    expect(field()).toBe('999,101,102,103');
    expect(selectAll()).toBeChecked();
    ['101', '102', '103'].forEach((number) => expect(rowBox(number)).toBeChecked());
  });

  test('given some selected, then it shows a dash; a click selects the rest', () => {
    renderSection('102');
    expect(selectAll()).toBePartiallyChecked();
    expect(selectAll().indeterminate).toBe(true);

    fireEvent.click(selectAll());

    expect(field()).toBe('102,101,103');
    expect(selectAll()).toBeChecked();
    expect(selectAll().indeterminate).toBe(false);
  });

  test('given all selected, then a click clears the section, and only it', () => {
    renderSection('999,101,102,103');
    expect(selectAll()).toBeChecked();
    expect(selectAll()).toHaveAttribute('title', 'Deselect all PRs in Open PRs');

    fireEvent.click(selectAll());

    expect(field()).toBe('999');
    expect(selectAll()).not.toBeChecked();
    expect(rowBox('101')).not.toBeChecked();
  });

  test('given rows ticked one by one, or numbers typed in the field, then it follows', () => {
    renderSection('');
    fireEvent.click(rowBox('101'));
    expect(selectAll()).toBePartiallyChecked();
    fireEvent.click(rowBox('102'));
    fireEvent.click(rowBox('103'));
    expect(selectAll()).toBeChecked();

    act(() => filterState.setValue('prNumbersInput', '103'));
    expect(selectAll()).toBePartiallyChecked();
  });
});
