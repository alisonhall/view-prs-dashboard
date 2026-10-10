/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');

const { ApplyLabelSelect } = require('./ApplyLabelSelect');
const { RepoLabelsContext } = require('../state/RepoLabelsContext');

// labels comes from useRepoLabels() now (Phase 7, see
// REACT_MIGRATION_PLAN.md) instead of a `labels` prop - these tests wrap
// each render in a RepoLabelsContext.Provider instead.
const renderWithLabels = (labels) =>
  render(
    <RepoLabelsContext.Provider value={{ labels }}>
      <ApplyLabelSelect />
    </RepoLabelsContext.Provider>,
  );

describe('ApplyLabelSelect', () => {
  test('given no labels, when rendered, then it shows only the empty-state placeholder', () => {
    renderWithLabels([]);
    const select = screen.getByRole('combobox');
    expect(select).toHaveDisplayValue('No labels found for this repo');
    expect(select.options).toHaveLength(1);
  });

  test('given labels, when rendered, then it lists each one after a "Choose a label..." placeholder', () => {
    renderWithLabels([{ name: 'bug' }, { name: 'enhancement' }]);
    const select = screen.getByRole('combobox');
    expect(select).toHaveDisplayValue('Choose a label...');
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '',
      'bug',
      'enhancement',
    ]);
  });

  test('given no RepoLabelsProvider ancestor at all, when rendered, then it falls back to the empty-state placeholder', () => {
    render(<ApplyLabelSelect />);
    expect(screen.getByRole('combobox')).toHaveDisplayValue('No labels found for this repo');
  });

  test('given the id required by handleApplyLabelClick, when rendered, then the select carries it', () => {
    renderWithLabels([]);
    expect(document.getElementById('apply-label-select')).toBe(screen.getByRole('combobox'));
  });
});
