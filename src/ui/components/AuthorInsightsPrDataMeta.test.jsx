/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsPrDataMeta } = require('./AuthorInsightsPrDataMeta');
const { AuthorInsightsContext, defaultAuthorInsights } = require('../state/AuthorInsightsContext');

const renderWithOverrides = (ui, overrides = {}) =>
  render(<AuthorInsightsContext.Provider value={{ ...defaultAuthorInsights, ...overrides }}>{ui}</AuthorInsightsContext.Provider>);

describe('AuthorInsightsPrDataMeta', () => {
  afterEach(() => {
    delete window.toCount;
    delete window.parseMarkerState;
    delete window.formatChkDisplay;
    delete window.getViewedFilesSummary;
    delete window.asArray;
  });

  test('given a PR entry, when rendering, then status/approved/CHK/conversations meta all render', () => {
    window.getViewedFilesSummary = () => '2/5 viewed';

    renderWithOverrides(
      <AuthorInsightsPrDataMeta entry={{ data: { mergedAt: '2024-01-01T00:00:00Z', approved: 'YES', approvalCount: 2, labels: ['bug', 'urgent'] } }} />,
      { getOpenConversationCount: () => 3 },
    );

    expect(screen.getByText('Status: MERGED')).toBeInTheDocument();
    expect(screen.getByText('Approved: YES (2)')).toBeInTheDocument();
    expect(screen.getByText('Conversations: 3')).toBeInTheDocument();
    expect(screen.getByText('2/5 viewed')).toBeInTheDocument();
    expect(screen.getByText('Labels: 2')).toBeInTheDocument();
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
