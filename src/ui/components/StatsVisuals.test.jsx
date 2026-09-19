/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { StatsVisuals } = require('./StatsVisuals');

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

describe('StatsVisuals', () => {
  afterEach(() => {
    delete window.getNormalizedStatsDateRange;
    delete window.aggregateReviewerCommentsTimeline;
    delete window.aggregateReviewerApprovalsTimeline;
    delete window.updateStatsViewStateAndRerender;
  });

  test('given no reviewer rows, when rendering, then nothing is rendered', () => {
    const { container } = render(<StatsVisuals stats={{ reviewerRows: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given reviewer rows, when rendering, then the metric-total and top-reviewer graph cards render', () => {
    render(<StatsVisuals stats={{ reviewerRows: buildReviewerRows() }} rows={[]} actorsMap={{}} />);

    expect(screen.getByText('Visible metric totals')).toBeInTheDocument();
    expect(screen.getByText('Top reviewers by comments')).toBeInTheDocument();
    expect(screen.getByText('Top reviewers by approvals')).toBeInTheDocument();
    expect(screen.getByText('Top reviewers by useful signals')).toBeInTheDocument();
    expect(document.querySelectorAll('.stats-graph-card')).toHaveLength(4);
  });

  test('given window.aggregateReviewerCommentsTimeline returns series, when rendering, then the activity chart renders', () => {
    window.aggregateReviewerCommentsTimeline = () => ({
      dates: ['2026-07-01'],
      series: [{ login: 'alex', actor: 'Alex', points: [{ label: 'Jul 1', value: 3 }] }],
    });

    render(<StatsVisuals stats={{ reviewerRows: buildReviewerRows() }} rows={[]} actorsMap={{}} />);

    expect(screen.getByText('Comments and reviews over time per author')).toBeInTheDocument();
  });

  test('given a graph card header click, when clicked, then window.updateStatsViewStateAndRerender fires with the matching sortBy', () => {
    const updateStatsViewStateAndRerender = jest.fn();
    window.updateStatsViewStateAndRerender = updateStatsViewStateAndRerender;

    render(<StatsVisuals stats={{ reviewerRows: buildReviewerRows() }} rows={[]} actorsMap={{}} />);

    screen.getByText('Top reviewers by approvals').click();
    expect(updateStatsViewStateAndRerender).toHaveBeenCalledWith({ sortBy: 'approvals' });
  });
});
