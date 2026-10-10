/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrSelectionCell } = require('./PrSelectionCell');

describe('PrSelectionCell', () => {
  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
  });

  test('given a PR not in the selected set, when rendering, then the checkbox is unchecked', () => {
    window.getFilterStateValues = () => ({ prNumbersInput: '999' });
    render(
      <table>
        <tbody>
          <tr>
            <PrSelectionCell pr={{ number: '101' }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('checkbox')).toHaveAttribute('data-pr-number', '101');
  });

  test('given a PR in the selected set, when rendering, then the checkbox is checked', () => {
    window.getFilterStateValues = () => ({ prNumbersInput: '101' });
    render(
      <table>
        <tbody>
          <tr>
            <PrSelectionCell pr={{ number: '101' }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('given no window.getFilterStateValues at all (provider not mounted yet), when rendering, then the checkbox defaults to unchecked rather than throwing', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrSelectionCell pr={{ number: '101' }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  test('given a checkbox toggle, when checked, then setFilterStateValue is called with the PR number added to the existing selection', () => {
    window.getFilterStateValues = () => ({ prNumbersInput: '55' });
    const setSpy = jest.fn();
    window.setFilterStateValue = setSpy;
    render(
      <table>
        <tbody>
          <tr>
            <PrSelectionCell pr={{ number: '101' }} />
          </tr>
        </tbody>
      </table>,
    );
    screen.getByRole('checkbox').click();
    expect(setSpy).toHaveBeenCalledWith('prNumbersInput', '55,101');
  });

  test('given a checkbox toggle, when unchecked, then setFilterStateValue is called with the PR number removed from the existing selection', () => {
    window.getFilterStateValues = () => ({ prNumbersInput: '101,55' });
    const setSpy = jest.fn();
    window.setFilterStateValue = setSpy;
    render(
      <table>
        <tbody>
          <tr>
            <PrSelectionCell pr={{ number: '101' }} />
          </tr>
        </tbody>
      </table>,
    );
    screen.getByRole('checkbox').click();
    expect(setSpy).toHaveBeenCalledWith('prNumbersInput', '55');
  });
});
