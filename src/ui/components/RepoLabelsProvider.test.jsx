/** @jest-environment jsdom */

const { render, screen, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { RepoLabelsProvider } = require('./RepoLabelsProvider');
const { ApplyLabelSelect } = require('./ApplyLabelSelect');
const { PrActionsCell } = require('./cells/PrActionsCell');

// Phase 7 (see REACT_MIGRATION_PLAN.md): closes a real coverage gap -
// neither window.updateReactApplyLabelOptions (the old push into AppRoot's
// own local state) nor window.getAvailableRepoLabels (the old
// PrActionsCell.jsx pull) had any test proving a single update actually
// reached both real consumers at once, since they were two entirely
// separate bridges for the same underlying list. Mounts the real Provider
// with both real consumers together, exercising the one new write point
// (window.setAvailableRepoLabels) end-to-end.
describe('RepoLabelsProvider + ApplyLabelSelect/PrActionsCell wiring', () => {
  afterEach(() => {
    delete window.setAvailableRepoLabels;
  });

  test('given both real consumers mounted under one Provider, when window.setAvailableRepoLabels is called, then both see the same labels', () => {
    render(
      <RepoLabelsProvider>
        <ApplyLabelSelect />
        <table>
          <tbody>
            <tr>
              <PrActionsCell pr={{ number: '101' }} repo="owner/repo" isFlagged={false} isInReview={false} />
            </tr>
          </tbody>
        </table>
      </RepoLabelsProvider>,
    );

    expect(screen.getByLabelText('Add label to PR #101').options).toHaveLength(1);
    expect(document.getElementById('apply-label-select')).toHaveDisplayValue('No labels found for this repo');

    act(() => {
      window.setAvailableRepoLabels([{ name: 'bug' }, { name: 'enhancement' }]);
    });

    const runFilterSelect = document.getElementById('apply-label-select');
    expect(Array.from(runFilterSelect.options).map((option) => option.value)).toEqual([
      '',
      'bug',
      'enhancement',
    ]);

    const rowSelect = screen.getByLabelText('Add label to PR #101');
    expect(Array.from(rowSelect.options).map((option) => option.value)).toEqual(['', 'bug', 'enhancement']);
  });

  test('given a PR that already has one of the labels, when rendering its row select, then that label is excluded but the Run tab select still lists it', () => {
    render(
      <RepoLabelsProvider>
        <ApplyLabelSelect />
        <table>
          <tbody>
            <tr>
              <PrActionsCell
                pr={{ number: '101', labels: ['bug'] }}
                repo="owner/repo"
                isFlagged={false}
                isInReview={false}
              />
            </tr>
          </tbody>
        </table>
      </RepoLabelsProvider>,
    );

    act(() => {
      window.setAvailableRepoLabels([{ name: 'bug' }, { name: 'enhancement' }]);
    });

    const rowSelect = screen.getByLabelText('Add label to PR #101');
    expect(Array.from(rowSelect.options).map((option) => option.value)).toEqual(['', 'enhancement']);

    const runFilterSelect = document.getElementById('apply-label-select');
    expect(Array.from(runFilterSelect.options).map((option) => option.value)).toEqual([
      '',
      'bug',
      'enhancement',
    ]);
  });

  test('given window.setAvailableRepoLabels is called with a non-array, when rendering, then it falls back to no labels rather than throwing', () => {
    render(
      <RepoLabelsProvider>
        <ApplyLabelSelect />
      </RepoLabelsProvider>,
    );

    act(() => {
      window.setAvailableRepoLabels(null);
    });

    expect(document.getElementById('apply-label-select')).toHaveDisplayValue('No labels found for this repo');
  });
});
