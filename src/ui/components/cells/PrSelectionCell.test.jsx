/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrSelectionCell } = require('./PrSelectionCell');

describe('PrSelectionCell', () => {
  afterEach(() => {
    delete window.getSelectedPrNumbers;
    delete window.updateSelectedPrNumbers;
  });

  test('given a PR not in the selected set, when rendering, then the checkbox is unchecked', () => {
    window.getSelectedPrNumbers = () => ['999'];
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
    window.getSelectedPrNumbers = () => ['101'];
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

  test('given a checkbox toggle, when changed, then updateSelectedPrNumbers is called with the PR number and new state', () => {
    window.getSelectedPrNumbers = () => [];
    const updateSpy = jest.fn();
    window.updateSelectedPrNumbers = updateSpy;
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
    expect(updateSpy).toHaveBeenCalledWith('101', true);
  });
});
