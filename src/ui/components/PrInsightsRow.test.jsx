/** @jest-environment jsdom */

const { render: baseRender, screen, fireEvent } = require('@testing-library/react');
const { RequestActivityContext } = require('../state/RequestActivityContext');

// NotesSection (rendered for real by this file's rows) reads
// beginRequestActivity from usePrData() now, not window.beginRequestActivity
// (see WINDOW_BRIDGE_ELIMINATION_PLAN.md).
const render = (ui, options) =>
  baseRender(
    <RequestActivityContext.Provider value={{ beginRequestActivity: () => () => {} }}>{ui}</RequestActivityContext.Provider>,
    options,
  );
require('@testing-library/jest-dom');
const { PrInsightsRow } = require('./PrInsightsRow');
const { PrInsightsDisplayContext, defaultPrInsightsDisplay } = require('../state/PrInsightsDisplayContext');

const DISPLAY_OVERRIDES = {
  getBadgeClassForStatus: (status) => `status-${String(status).toLowerCase()}`,
  getBadgeClassForCheck: (state) => `check-${String(state).toLowerCase()}`,
  getBadgeClassForMerge: (state) => `merge-${String(state).toLowerCase()}`,
};

function renderInsightsRow(props, displayOverrides = {}) {
  return render(
    <PrInsightsDisplayContext.Provider value={{ ...defaultPrInsightsDisplay, ...DISPLAY_OVERRIDES, ...displayOverrides }}>
      <PrInsightsRow {...props} />
    </PrInsightsDisplayContext.Provider>,
  );
}

describe('PrInsightsRow', () => {
  test('given a PR, when rendering, then shows the STATUS/CHK/MRG badges', () => {
    const pr = { number: '1', status: 'NO_CHANGE', checkState: 'PASS', mergeState: 'YES' };
    renderInsightsRow({ entry: {}, pr, actorsMap: {}, compositeKey: 'open:1' });
    expect(screen.getByText('STATUS: NO_CHANGE')).toHaveClass('insight-badge', 'status-no_change');
    expect(screen.getByText('CHK: PASS')).toHaveClass('insight-badge', 'check-pass');
    expect(screen.getByText('MRG: YES')).toHaveClass('insight-badge', 'merge-yes');
  });

  test('given a PR, when rendering, then the grid shows source branch and target branch values', () => {
    const pr = { number: '1', sourceBranch: 'feature/x', targetBranch: 'main' };
    renderInsightsRow({ entry: {}, pr, actorsMap: {}, compositeKey: 'open:1' });
    expect(screen.getByText('Source branch')).toHaveClass('insight-key');
    expect(screen.getByText('feature/x')).toHaveClass('insight-value');
    expect(screen.getByText('main')).toBeInTheDocument();
  });

  describe('Activity timeline isOpen derivation', () => {
    // Regression coverage: isOpen used to check only pr.mergedAt, so a PR
    // closed without merging (closedAt set, mergedAt empty) was still
    // treated as "open" - ActivityTimelineSummary's own end-date walk
    // (isOpen ? today : newest-activity-date) then kept generating
    // "No activity" rows all the way to today instead of stopping at the
    // close date. Exercises the real isOpen derivation end-to-end via the
    // real (unmocked) ActivityTimelineSummary child, not just the
    // isolated boolean.
    const activityTimelineRaw = [
      { date: '2026-01-05', actor: 'alice', type: 'comment', count: 1 },
    ];

    test('given a PR closed without merging, when rendering, then the activity timeline does not extend past the last real activity', () => {
      const pr = {
        number: '1',
        closedAt: '2026-01-06T00:00:00Z',
        mergedAt: '',
        activityTimeline: activityTimelineRaw,
      };
      renderInsightsRow({ entry: {}, pr, actorsMap: {}, compositeKey: 'open:1' });

      const table = document.querySelector('table');
      const rows = Array.from(table.querySelectorAll('tr'));
      expect(rows).toHaveLength(1);
      expect(screen.getByText('2026-01-05')).toBeInTheDocument();
      expect(screen.queryByText(/No activity/)).not.toBeInTheDocument();
    });

    test('given a PR that is genuinely still open, when rendering, then the activity timeline still extends to today', () => {
      const pr = {
        number: '1',
        closedAt: '',
        mergedAt: '',
        activityTimeline: activityTimelineRaw,
      };
      renderInsightsRow({ entry: {}, pr, actorsMap: {}, compositeKey: 'open:1' });

      expect(screen.queryByText(/No activity/)).toBeInTheDocument();
    });
  });

  describe('copy branch name button', () => {
    beforeEach(() => {
      Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    });

    test('given a source branch, when rendering, then the copy button is enabled', () => {
      const pr = { number: '1', sourceBranch: 'feature/x' };
      renderInsightsRow({ entry: {}, pr, actorsMap: {}, compositeKey: 'open:1' });
      expect(screen.getByRole('button', { name: 'Copy branch name' })).toBeEnabled();
    });

    test('given no source branch, when rendering, then the copy button is disabled', () => {
      const pr = { number: '1' };
      renderInsightsRow({ entry: {}, pr, actorsMap: {}, compositeKey: 'open:1' });
      expect(screen.getByRole('button', { name: 'Copy branch name' })).toBeDisabled();
    });

    test('given the copy button, when clicked, then copies the source branch name to the clipboard', async () => {
      const pr = { number: '1', sourceBranch: 'feature/x' };
      renderInsightsRow({ entry: {}, pr, actorsMap: {}, compositeKey: 'open:1' });
      fireEvent.click(screen.getByRole('button', { name: 'Copy branch name' }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('feature/x');
      expect(await screen.findByRole('button', { name: 'Copied!' })).toHaveClass('is-copied');
    });

    test('given clipboard is unavailable, when clicking copy, then falls back without throwing', async () => {
      Object.assign(navigator, { clipboard: undefined });
      const pr = { number: '1', sourceBranch: 'feature/x' };
      renderInsightsRow({ entry: {}, pr, actorsMap: {}, compositeKey: 'open:1' });
      fireEvent.click(screen.getByRole('button', { name: 'Copy branch name' }));
      expect(await screen.findByRole('button', { name: 'Copy unavailable' })).toBeInTheDocument();
    });
  });

  test('given viewer-specific open conversations, when rendering, then the label reflects that', () => {
    renderInsightsRow(
      { entry: {}, pr: { number: '1' }, actorsMap: {}, compositeKey: 'open:1' },
      { getOpenConversationCountWithMe: () => ({ count: 2, isViewerSpecific: true }) },
    );
    expect(screen.getByText('Open conversations with me')).toBeInTheDocument();
  });

  test('given the data-pr-number attribute, when rendering, then it matches the PR number', () => {
    renderInsightsRow({ entry: {}, pr: { number: '77' }, actorsMap: {}, compositeKey: 'open:77' });
    expect(document.querySelector('.row-insights-content')).toHaveAttribute('data-pr-number', '77');
  });
});
