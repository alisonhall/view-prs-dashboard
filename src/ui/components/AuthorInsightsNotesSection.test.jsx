/** @jest-environment jsdom */

const React = require('react');
const { render, screen, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsNotesSection } = require('./AuthorInsightsNotesSection');
const { PrDataProvider } = require('../state/PrDataProvider');

const buildEntry = (overrides = {}) => ({
  prNumber: '1',
  repo: 'owner/repo',
  data: { number: '1', title: 'Fix the thing', status: 'NO_CHANGE', approved: 'NO', approvalCount: 0, labels: [] },
  notes: { comments: [] },
  ...overrides,
});

const renderSection = (rows, selectedAuthorLogin, actorsMap = {}) => {
  const byPrNumber = {};
  rows.forEach((entry) => {
    byPrNumber[entry.prNumber] = entry;
  });
  return render(
    <PrDataProvider initialPayload={{ byPrNumber, actorsMap }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <AuthorInsightsNotesSection />
    </PrDataProvider>,
  );
};

describe('AuthorInsightsNotesSection', () => {
  afterEach(() => {
    delete window.noteAuthorMatchesSelection;
    delete window.sortAuthorInsightsNoteMatchesDesc;
    delete window.resolveActorDisplayName;
    delete window.getAuthorInsightsNoteDisplayTimestamp;
    delete window.getAuthorInsightsSentimentLabel;
    delete window.getAuthorInsightsSentimentBadgeClassName;
  });

  test('given no matching notes, when rendering, then the empty message is shown', () => {
    renderSection([buildEntry()], 'octocat');
    expect(screen.getByText('No saved custom comments or sentiment for this author.')).toBeInTheDocument();
  });

  test('given a matching note, when rendering, then the PR link, author, sentiment, and body render (real JSX)', () => {
    window.noteAuthorMatchesSelection = (author, selectedAuthor) => author === selectedAuthor.login;

    const entry = buildEntry({
      notes: { comments: [{ id: 'c1', author: 'octocat', tone: 'positive', note: 'Nice work' }] },
    });
    renderSection([entry], 'octocat');

    expect(screen.getByText('#1 Fix the thing')).toBeInTheDocument();
    expect(screen.getByText('Author: octocat')).toBeInTheDocument();
    expect(screen.getByText('Nice work')).toBeInTheDocument();
    expect(screen.getByText(/Sentiment: Neutral|Sentiment: Positive/)).toBeInTheDocument();
  });

  test('given a change to the selected author in Context, when it updates, then the notes shown update (no key remount needed)', () => {
    window.noteAuthorMatchesSelection = (author, selectedAuthor) => author === selectedAuthor.login;

    const entry = buildEntry({
      notes: {
        comments: [
          { id: 'c1', author: 'octocat', note: 'For octocat' },
          { id: 'c2', author: 'other', note: 'For other' },
        ],
      },
    });
    renderSection([entry], 'octocat');
    expect(screen.getByText('For octocat')).toBeInTheDocument();
    expect(screen.queryByText('For other')).not.toBeInTheDocument();

    act(() => {
      window.updateReactSelectedAuthorLogin('other');
    });
    expect(screen.queryByText('For octocat')).not.toBeInTheDocument();
    expect(screen.getByText('For other')).toBeInTheDocument();
  });
});
