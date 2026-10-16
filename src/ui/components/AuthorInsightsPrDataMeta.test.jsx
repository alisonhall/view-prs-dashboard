/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsPrDataMeta } = require('./AuthorInsightsPrDataMeta');
const { AuthorInsightsContext, defaultAuthorInsights } = require('../state/AuthorInsightsContext');

const renderWithOverrides = (ui, overrides = {}) =>
  render(<AuthorInsightsContext.Provider value={{ ...defaultAuthorInsights, ...overrides }}>{ui}</AuthorInsightsContext.Provider>);

// toCount/formatChkDisplay/getViewedFilesSummary are real, directly-built
// functions now (Phase 7, see REACT_MIGRATION_PLAN.md) - these tests build
// real row fixtures that drive their actual logic instead of mocking
// window.toCount/formatChkDisplay/getViewedFilesSummary.
describe('AuthorInsightsPrDataMeta', () => {
  test('given a PR entry, when rendering, then status/approved/conversations/viewed-files/labels meta all render', () => {
    renderWithOverrides(
      <AuthorInsightsPrDataMeta
        entry={{
          data: {
            mergedAt: '2024-01-01T00:00:00Z',
            approved: 'YES',
            approvalCount: 2,
            labels: ['bug', 'urgent'],
            viewedFilesCount: 2,
            changedFilesCount: 5,
          },
        }}
      />,
      { getOpenConversationCount: () => 3 },
    );

    expect(screen.getByText('Status: MERGED')).toBeInTheDocument();
    expect(screen.getByText('Approved: YES (2)')).toBeInTheDocument();
    expect(screen.getByText('Conversations: 3')).toBeInTheDocument();
    expect(screen.getByText('2/5 viewed')).toBeInTheDocument();
    expect(screen.getByText('Labels: 2')).toBeInTheDocument();
  });

  // Regression test for a real, previously-masked bug (see this
  // component's own comment): formatChkDisplay used to be called with an
  // already-parsed marker value instead of the raw titleDisplay string,
  // so CHK always silently rendered "-" in production. Confirmed this
  // fails against the pre-fix code (always "-") and passes against the
  // fix.
  test('given a titleDisplay with a [CHK:PASS] marker, when rendering, then CHK renders the real icon + state, not a dash', () => {
    renderWithOverrides(
      <AuthorInsightsPrDataMeta entry={{ data: { titleDisplay: 'Add feature [CHK:PASS]' } }} />,
    );
    expect(screen.getByText('CHK: ✅ PASS')).toBeInTheDocument();
  });

  test('given no CHK marker in titleDisplay, when rendering, then CHK renders a dash', () => {
    renderWithOverrides(<AuthorInsightsPrDataMeta entry={{ data: { titleDisplay: 'Add feature' } }} />);
    expect(screen.getByText('CHK: -')).toBeInTheDocument();
  });

  test('given no labels, when rendering, then no labels badge is shown', () => {
    renderWithOverrides(<AuthorInsightsPrDataMeta entry={{ data: { labels: [] } }} />);
    expect(screen.queryByText(/Labels:/)).not.toBeInTheDocument();
  });

  test('given children, when rendering, then they render after the standard meta items', () => {
    renderWithOverrides(
      <AuthorInsightsPrDataMeta entry={{ data: {} }}>
        <span>extra detail</span>
      </AuthorInsightsPrDataMeta>,
    );
    expect(screen.getByText('extra detail')).toBeInTheDocument();
  });
});
