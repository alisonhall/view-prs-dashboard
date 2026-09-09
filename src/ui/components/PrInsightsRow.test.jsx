/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrInsightsRow } = require('./PrInsightsRow');

function installDefaultHelpers() {
  window.parseMarkerState = () => '-';
  window.formatIsoDatetime = (v) => String(v || '-');
  window.buildRowActorsMap = (_row, actorsMap) => actorsMap || {};
  window.formatApproversDisplay = () => '-';
  window.formatRequestedReviewersDisplay = () => '-';
  window.formatAssignedUsersDisplay = () => '-';
  window.normalizeRowMetrics = () => ({});
  window.getOpenConversationCountWithMe = () => ({ count: 0, isViewerSpecific: false });
  window.toCount = (v) => Number(v) || 0;
  window.getViewedFilesSummary = () => '0/0 viewed';
  window.getBadgeClassForStatus = (status) => `status-${String(status).toLowerCase()}`;
  window.getBadgeClassForCheck = (state) => `check-${String(state).toLowerCase()}`;
  window.getBadgeClassForMerge = (state) => `merge-${String(state).toLowerCase()}`;
  window.formatReviewFootprint = () => '-';
  window.formatConversationStatus = () => '-';
  window.formatApprovalRisk = () => '-';
  window.formatCommentUsefulness = () => '-';
  window.asArray = (v) => (Array.isArray(v) ? v : []);
  window.buildFallbackActivityEvents = () => [];
  window.buildPrPeopleOptions = () => [];
  window.normalizeNotesListForUi = (v) => (Array.isArray(v) && v.length ? v : ['']);
}

function clearHelpers() {
  Object.keys(window)
    .filter((key) => /^(parseMarkerState|formatIsoDatetime|buildRowActorsMap|format(Approvers|RequestedReviewers|AssignedUsers)Display|normalizeRowMetrics|getOpenConversationCountWithMe|toCount|getViewedFilesSummary|getBadgeClassFor|formatReviewFootprint|formatConversationStatus|formatApprovalRisk|formatCommentUsefulness|asArray|buildFallbackActivityEvents|buildPrPeopleOptions|normalizeNotesListForUi)/.test(key))
    .forEach((key) => delete window[key]);
}

describe('PrInsightsRow', () => {
  beforeEach(installDefaultHelpers);
  afterEach(clearHelpers);

  test('given a PR, when rendering, then shows the STATUS/CHK/MRG badges', () => {
    const pr = { number: '1', status: 'NO_CHANGE', checkState: 'PASS', mergeState: 'YES' };
    render(<PrInsightsRow entry={{}} pr={pr} actorsMap={{}} compositeKey="open:1" />);
    expect(screen.getByText('STATUS: NO_CHANGE')).toHaveClass('insight-badge', 'status-no_change');
    expect(screen.getByText('CHK: PASS')).toHaveClass('insight-badge', 'check-pass');
    expect(screen.getByText('MRG: YES')).toHaveClass('insight-badge', 'merge-yes');
  });

  test('given a PR, when rendering, then the grid shows source branch and target branch values', () => {
    const pr = { number: '1', sourceBranch: 'feature/x', targetBranch: 'main' };
    render(<PrInsightsRow entry={{}} pr={pr} actorsMap={{}} compositeKey="open:1" />);
    expect(screen.getByText('Source branch')).toHaveClass('insight-key');
    expect(screen.getByText('feature/x')).toHaveClass('insight-value');
    expect(screen.getByText('main')).toBeInTheDocument();
  });

  test('given viewer-specific open conversations, when rendering, then the label reflects that', () => {
    window.getOpenConversationCountWithMe = () => ({ count: 2, isViewerSpecific: true });
    render(<PrInsightsRow entry={{}} pr={{ number: '1' }} actorsMap={{}} compositeKey="open:1" />);
    expect(screen.getByText('Open conversations with me')).toBeInTheDocument();
  });

  test('given the data-pr-number attribute, when rendering, then it matches the PR number', () => {
    render(<PrInsightsRow entry={{}} pr={{ number: '77' }} actorsMap={{}} compositeKey="open:77" />);
    expect(document.querySelector('.row-insights-content')).toHaveAttribute('data-pr-number', '77');
  });
});
