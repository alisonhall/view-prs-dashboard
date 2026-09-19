/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsNotesSection } = require('./AuthorInsightsNotesSection');

const buildEntry = (overrides = {}) => ({
  prNumber: '1',
  repo: 'owner/repo',
  data: { number: '1', title: 'Fix the thing', status: 'NO_CHANGE', approved: 'NO', approvalCount: 0, labels: [] },
  notes: { comments: [] },
  ...overrides,
});

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
    render(<AuthorInsightsNotesSection rows={[buildEntry()]} selectedAuthor={{ login: 'octocat', name: 'The Octocat' }} actorsMap={{}} />);
    expect(screen.getByText('No saved custom comments or sentiment for this author.')).toBeInTheDocument();
  });

  test('given a matching note, when rendering, then the PR link, author, sentiment, and body render (real JSX)', () => {
    window.noteAuthorMatchesSelection = (author, selectedAuthor) => author === selectedAuthor.login;

    const entry = buildEntry({
      notes: { comments: [{ id: 'c1', author: 'octocat', tone: 'positive', note: 'Nice work' }] },
    });
    render(<AuthorInsightsNotesSection rows={[entry]} selectedAuthor={{ login: 'octocat', name: 'The Octocat' }} actorsMap={{}} />);

    expect(screen.getByText('#1 Fix the thing')).toBeInTheDocument();
    expect(screen.getByText('Author: octocat')).toBeInTheDocument();
    expect(screen.getByText('Nice work')).toBeInTheDocument();
    expect(screen.getByText(/Sentiment: Neutral|Sentiment: Positive/)).toBeInTheDocument();
  });

  test('given a re-render with a different selectedAuthor, when re-rendering, then the notes shown update (no key remount needed)', () => {
    window.noteAuthorMatchesSelection = (author, selectedAuthor) => author === selectedAuthor.login;

    const entry = buildEntry({
      notes: {
        comments: [
          { id: 'c1', author: 'octocat', note: 'For octocat' },
          { id: 'c2', author: 'other', note: 'For other' },
        ],
      },
    });
    const { rerender } = render(<AuthorInsightsNotesSection rows={[entry]} selectedAuthor={{ login: 'octocat' }} actorsMap={{}} />);
    expect(screen.getByText('For octocat')).toBeInTheDocument();
    expect(screen.queryByText('For other')).not.toBeInTheDocument();

    rerender(<AuthorInsightsNotesSection rows={[entry]} selectedAuthor={{ login: 'other' }} actorsMap={{}} />);
    expect(screen.queryByText('For octocat')).not.toBeInTheDocument();
    expect(screen.getByText('For other')).toBeInTheDocument();
  });
});
