/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsPrDataMeta } = require('./AuthorInsightsPrDataMeta');

describe('AuthorInsightsPrDataMeta', () => {
  afterEach(() => {
    delete window.getAuthorInsightsCreatedPrStatus;
    delete window.getAuthorInsightsStatusBadgeClassName;
    delete window.toCount;
    delete window.parseMarkerState;
    delete window.formatChkDisplay;
    delete window.getOpenConversationCount;
    delete window.getViewedFilesSummary;
    delete window.asArray;
  });

  test('given a PR entry, when rendering, then status/approved/CHK/conversations meta all render', () => {
    window.getAuthorInsightsCreatedPrStatus = () => 'MERGED';
    window.getAuthorInsightsStatusBadgeClassName = () => 'author-insights-badge-status-merged';
    window.getOpenConversationCount = () => 3;
    window.getViewedFilesSummary = () => '2/5 viewed';

    render(<AuthorInsightsPrDataMeta entry={{ data: { approved: 'YES', approvalCount: 2, labels: ['bug', 'urgent'] } }} />);

    expect(screen.getByText('Status: MERGED')).toBeInTheDocument();
    expect(screen.getByText('Approved: YES (2)')).toBeInTheDocument();
    expect(screen.getByText('Conversations: 3')).toBeInTheDocument();
    expect(screen.getByText('2/5 viewed')).toBeInTheDocument();
    expect(screen.getByText('Labels: 2')).toBeInTheDocument();
  });

  test('given no labels, when rendering, then no labels badge is shown', () => {
    render(<AuthorInsightsPrDataMeta entry={{ data: { labels: [] } }} />);
    expect(screen.queryByText(/Labels:/)).not.toBeInTheDocument();
  });

  test('given children, when rendering, then they render after the standard meta items', () => {
    render(
      <AuthorInsightsPrDataMeta entry={{ data: {} }}>
        <span>extra detail</span>
      </AuthorInsightsPrDataMeta>,
    );
    expect(screen.getByText('extra detail')).toBeInTheDocument();
  });
});
