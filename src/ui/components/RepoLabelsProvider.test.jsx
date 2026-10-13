/** @jest-environment jsdom */

const { render, screen, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { RepoLabelsProvider } = require('./RepoLabelsProvider');
const { ApplyLabelSelect } = require('./ApplyLabelSelect');
const { PrActionsCell } = require('./cells/PrActionsCell');
const { PrDataProvider } = require('../state/PrDataProvider');

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
      <PrDataProvider>
        <RepoLabelsProvider>
          <ApplyLabelSelect />
          <table>
            <tbody>
              <tr>
                <PrActionsCell pr={{ number: '101' }} repo="owner/repo" isFlagged={false} isInReview={false} />
              </tr>
            </tbody>
          </table>
        </RepoLabelsProvider>
      </PrDataProvider>,
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
      <PrDataProvider>
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
        </RepoLabelsProvider>
      </PrDataProvider>,
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
      <PrDataProvider>
        <RepoLabelsProvider>
          <ApplyLabelSelect />
        </RepoLabelsProvider>
      </PrDataProvider>,
    );

    act(() => {
      window.setAvailableRepoLabels(null);
    });

    expect(document.getElementById('apply-label-select')).toHaveDisplayValue('No labels found for this repo');
  });
});

// Phase G.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// RepoLabelsProvider now also owns the "refetch labels when the selected
// repo changes" trigger (previously index.page.js's own applyResolvedRepo,
// comparing against its own labelsFetchedForRepo module variable) - these
// tests exercise that directly, mounted the same way react-app.jsx's real
// AppRoot does (RepoLabelsProvider as a descendant of PrDataProvider, so
// it can read selectedRepo via usePrData()).
describe('RepoLabelsProvider repo-change trigger', () => {
  afterEach(() => {
    delete window.setAvailableRepoLabels;
    delete window.refreshAvailableRepoLabels;
    delete window.updateReactPrTable;
    delete window.getReactPrTablePayload;
    delete window.getReactPrTableSelectedRepo;
  });

  test('given an initial selectedRepo, when mounting, then refreshAvailableRepoLabels is called once with it', () => {
    window.refreshAvailableRepoLabels = jest.fn();

    render(
      <PrDataProvider initialSelectedRepo="owner/repo">
        <RepoLabelsProvider>
          <div />
        </RepoLabelsProvider>
      </PrDataProvider>,
    );

    expect(window.refreshAvailableRepoLabels).toHaveBeenCalledTimes(1);
    expect(window.refreshAvailableRepoLabels).toHaveBeenCalledWith('owner/repo');
  });

  test('given no selectedRepo yet, when mounting, then refreshAvailableRepoLabels is not called', () => {
    window.refreshAvailableRepoLabels = jest.fn();

    render(
      <PrDataProvider>
        <RepoLabelsProvider>
          <div />
        </RepoLabelsProvider>
      </PrDataProvider>,
    );

    expect(window.refreshAvailableRepoLabels).not.toHaveBeenCalled();
  });

  test('given an unrelated re-render with the same selectedRepo, when it happens, then refreshAvailableRepoLabels is not called again', () => {
    window.refreshAvailableRepoLabels = jest.fn();

    render(
      <PrDataProvider initialSelectedRepo="owner/repo">
        <RepoLabelsProvider>
          <div />
        </RepoLabelsProvider>
      </PrDataProvider>,
    );
    expect(window.refreshAvailableRepoLabels).toHaveBeenCalledTimes(1);

    act(() => {
      window.updateReactPrTable({ byPrNumber: {} }, 'owner/repo');
    });

    expect(window.refreshAvailableRepoLabels).toHaveBeenCalledTimes(1);
  });

  test('given selectedRepo changes to a different repo, when it happens, then refreshAvailableRepoLabels is called again with the new repo', () => {
    window.refreshAvailableRepoLabels = jest.fn();

    render(
      <PrDataProvider initialSelectedRepo="owner/repo-a">
        <RepoLabelsProvider>
          <div />
        </RepoLabelsProvider>
      </PrDataProvider>,
    );
    expect(window.refreshAvailableRepoLabels).toHaveBeenCalledTimes(1);

    act(() => {
      window.updateReactPrTable(undefined, 'owner/repo-b');
    });

    expect(window.refreshAvailableRepoLabels).toHaveBeenCalledTimes(2);
    expect(window.refreshAvailableRepoLabels).toHaveBeenLastCalledWith('owner/repo-b');
  });
});
