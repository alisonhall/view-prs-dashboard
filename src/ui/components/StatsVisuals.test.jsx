/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { StatsVisuals } = require('./StatsVisuals');
const { ReviewStatsContext, defaultReviewStats } = require('../state/ReviewStatsContext');

const buildReviewerRows = () => [
  {
    name: 'Alex',
    login: 'alex',
    comments: 2,
    threadComments: 1,
    reviews: 3,
    approvals: 2,
    riskyApprovals: 1,
    highRiskApprovals: 0,
    usefulnessSignals: 1,
    resolvedThreadComments: 1,
    commentsFollowedByAuthorCommit: 1,
    prCount: 2,
  },
];

const renderVisuals = (props, reviewStatsOverrides = {}) =>
  render(
    <ReviewStatsContext.Provider value={{ ...defaultReviewStats, ...reviewStatsOverrides }}>
      <StatsVisuals {...props} />
    </ReviewStatsContext.Provider>,
  );

describe('StatsVisuals', () => {
  test('given no reviewer rows, when rendering, then nothing is rendered', () => {
    const { container } = renderVisuals({ stats: { reviewerRows: [] } });
    expect(container).toBeEmptyDOMElement();
  });

  test('given reviewer rows, when rendering, then the metric-total and top-reviewer graph cards render', () => {
    renderVisuals({ stats: { reviewerRows: buildReviewerRows() }, rows: [], actorsMap: {} });

    expect(screen.getByText('Visible metric totals')).toBeInTheDocument();
    expect(screen.getByText('Top reviewers by comments')).toBeInTheDocument();
    expect(screen.getByText('Top reviewers by approvals')).toBeInTheDocument();
    expect(screen.getByText('Top reviewers by useful signals')).toBeInTheDocument();
    expect(document.querySelectorAll('.stats-graph-card')).toHaveLength(4);
  });

  test('given aggregateReviewerCommentsTimeline returns series, when rendering, then the activity chart renders', () => {
    renderVisuals(
      { stats: { reviewerRows: buildReviewerRows() }, rows: [], actorsMap: {} },
      {
        aggregateReviewerCommentsTimeline: () => ({
          dates: ['2026-07-01'],
          series: [{ login: 'alex', actor: 'Alex', points: [{ label: 'Jul 1', value: 3 }] }],
        }),
      },
    );

    expect(screen.getByText('Comments and reviews over time per author')).toBeInTheDocument();
  });

  test('given a graph card header click, when clicked, then setStatsViewState fires with the matching sortBy', () => {
    const setStatsViewState = jest.fn();

    renderVisuals(
      { stats: { reviewerRows: buildReviewerRows() }, rows: [], actorsMap: {} },
      { setStatsViewState },
    );

    screen.getByText('Top reviewers by approvals').click();
    expect(setStatsViewState).toHaveBeenCalledWith({ sortBy: 'approvals' });
  });
});
