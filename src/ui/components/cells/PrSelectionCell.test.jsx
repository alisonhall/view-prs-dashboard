/** @jest-environment jsdom */

const React = require('react');
const { render, screen, act, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrSelectionCell } = require('./PrSelectionCell');
const { FilterStateProvider } = require('../../state/FilterStateProvider');
const { useFilterState } = require('../../state/FilterStateContext');
const { RowFilterSelectionProvider } = require('../../state/RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('../../state/AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('../../state/ChangeFilterActorSelectionProvider');

// Window-bridge elimination Phase 5 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the cell reads/writes `prNumbersInput` through FilterStateProvider's per-key
// store (useFilterFieldValue/useFilterFieldActions), not
// window.getFilterStateValues/setFilterStateValue - so these tests mount the
// real Provider (which needs the 3 selection Providers above it).
let filterState;
function StateProbe() {
  filterState = useFilterState();
  return null;
}

const cellRow = (number) => (
  <tr key={number}>
    <PrSelectionCell pr={{ number }} />
  </tr>
);

const renderCells = (prNumbersInput, numbers = ['101']) =>
  render(
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <FilterStateProvider initialValues={{ prNumbersInput }}>
            <StateProbe />
            <table>
              <tbody>{numbers.map(cellRow)}</tbody>
            </table>
          </FilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>,
  );

const checkboxFor = (number) => document.querySelector(`input[data-pr-number="${number}"]`);

describe('PrSelectionCell', () => {
  test('given a PR not in the selected set, when rendering, then the checkbox is unchecked and labelled with its PR number', () => {
    renderCells('999');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('checkbox')).toHaveAttribute('data-pr-number', '101');
    expect(screen.getByRole('checkbox')).toHaveAttribute('title', 'Select PR #101');
  });

  test('given a PR in the selected set, when rendering, then the checkbox is checked', () => {
    renderCells('101');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('given no FilterStateProvider at all, when rendering and clicking, then it renders unchecked and does not throw', () => {
    render(
      <table>
        <tbody>{cellRow('101')}</tbody>
      </table>,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(() => fireEvent.click(screen.getByRole('checkbox'))).not.toThrow();
  });

  test('given a checkbox is checked, when toggled, then the PR number is added to the existing selection in the shared field', () => {
    renderCells('55');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(filterState.values.prNumbersInput).toBe('55,101');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('given a checked checkbox, when unchecked, then the PR number is removed from the shared field', () => {
    renderCells('101,55');
    expect(screen.getByRole('checkbox')).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(filterState.values.prNumbersInput).toBe('55');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  test('given several rows, when each is checked in turn, then every write sees the previous one (no lost update)', () => {
    renderCells('', ['1', '2', '3']);
    fireEvent.click(checkboxFor('1'));
    fireEvent.click(checkboxFor('2'));
    fireEvent.click(checkboxFor('3'));
    fireEvent.click(checkboxFor('2'));
    expect(filterState.values.prNumbersInput).toBe('1,3');
    expect(checkboxFor('1')).toBeChecked();
    expect(checkboxFor('2')).not.toBeChecked();
    expect(checkboxFor('3')).toBeChecked();
  });

  // The gap the old defaultChecked/non-reactive read left open: nothing told a
  // row about edits made to the field itself.
  test('given the PR-numbers field is edited elsewhere (e.g. typed into the Run tab), when it changes, then the row checkboxes follow', () => {
    renderCells('', ['101', '202']);
    expect(checkboxFor('101')).not.toBeChecked();

    act(() => filterState.setValue('prNumbersInput', '101, 303'));
    expect(checkboxFor('101')).toBeChecked();
    expect(checkboxFor('202')).not.toBeChecked();

    act(() => filterState.setValue('prNumbersInput', '202'));
    expect(checkboxFor('101')).not.toBeChecked();
    expect(checkboxFor('202')).toBeChecked();
  });

  // The reason the cell used a window bridge at all: it mounts once per row, so
  // subscribing must not re-render every row on every filter keystroke.
  describe('re-render cost (it mounts once per table row)', () => {
    const NUMBERS = Array.from({ length: 25 }, (_, index) => String(index + 1));

    const renderCountedRows = (prNumbersInput) => {
      const renders = {};
      const rows = NUMBERS.map((number) => (
        <React.Profiler
          key={number}
          id={number}
          onRender={() => {
            renders[number] = (renders[number] || 0) + 1;
          }}
        >
          <PrSelectionCell pr={{ number }} />
        </React.Profiler>
      ));
      render(
        <RowFilterSelectionProvider>
          <AuthorThreadResolutionSelectionProvider>
            <ChangeFilterActorSelectionProvider>
              <FilterStateProvider initialValues={{ prNumbersInput, scopeMode: 'all', filterCustomComments: '' }}>
                <StateProbe />
                <table>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={NUMBERS[index]}>{row}</tr>
                    ))}
                  </tbody>
                </table>
              </FilterStateProvider>
            </ChangeFilterActorSelectionProvider>
          </AuthorThreadResolutionSelectionProvider>
        </RowFilterSelectionProvider>,
      );
      const total = () => Object.values(renders).reduce((sum, count) => sum + count, 0);
      return { renders, total };
    };

    test('given typing into 20 other filter fields, when each keystroke changes a different key, then no row re-renders', () => {
      const { total } = renderCountedRows('');
      const baseline = total();

      for (let i = 0; i < 20; i += 1) {
        act(() => filterState.setValue(i % 2 ? 'filterCustomComments' : 'scopeMode', `typed-${i}`));
      }

      expect(total()).toBe(baseline);
    });

    test('given one more PR is selected, when the field changes, then only that PR\'s row re-renders, not the other 24', () => {
      const { renders, total } = renderCountedRows('1,2,3');
      const baseline = total();

      act(() => filterState.setValue('prNumbersInput', '1,2,3,10'));

      expect(total() - baseline).toBe(1);
      expect(renders['10']).toBeGreaterThan(1);
    });

    test('given the field is edited without changing anyone\'s membership, when typing a half-finished entry, then no row re-renders', () => {
      const { total } = renderCountedRows('1,2');
      const baseline = total();

      // "1,2" -> "1,2," -> "1,2,x" -> "1,2": the same PRs selected throughout.
      act(() => filterState.setValue('prNumbersInput', '1,2,'));
      act(() => filterState.setValue('prNumbersInput', '1,2,x'));
      act(() => filterState.setValue('prNumbersInput', '1,2'));

      expect(total()).toBe(baseline);
    });
  });
});
