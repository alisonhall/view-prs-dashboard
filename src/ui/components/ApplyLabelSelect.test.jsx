/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');

const { ApplyLabelSelect } = require('./ApplyLabelSelect');

describe('ApplyLabelSelect', () => {
  test('given no labels, when rendered, then it shows only the empty-state placeholder', () => {
    render(<ApplyLabelSelect labels={[]} />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveDisplayValue('No labels found for this repo');
    expect(select.options).toHaveLength(1);
  });

  test('given labels, when rendered, then it lists each one after a "Choose a label..." placeholder', () => {
    render(<ApplyLabelSelect labels={[{ name: 'bug' }, { name: 'enhancement' }]} />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveDisplayValue('Choose a label...');
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '',
      'bug',
      'enhancement',
    ]);
  });

  test('given the id required by handleApplyLabelClick, when rendered, then the select carries it', () => {
    render(<ApplyLabelSelect labels={[]} />);
    expect(document.getElementById('apply-label-select')).toBe(screen.getByRole('combobox'));
  });
});
