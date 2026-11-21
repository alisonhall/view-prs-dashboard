/** @jest-environment jsdom */

const { render, screen, within, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorStatsSection } = require('./AuthorStatsSection');
const { PrDataProvider } = require('../state/PrDataProvider');
const { OPEN_AUTHOR_EVENT } = require('../state/useOpenAuthor');

const review = (authorLogin, submittedAt, state = 'COMMENTED') => ({ authorLogin, submittedAt, state });
const ROWS = {
  'acme/web#1': {
    repo: 'acme/web',
    data: {
      authorLogin: 'octocat',
      createdAt: '2026-07-01T00:00:00Z',
      mergedAt: '2026-07-03T12:00:00Z',
      additions: '30',
      deletions: '10',
      reviews: [review('hubot', '2026-07-01T05:00:00Z', 'CHANGES_REQUESTED'), review('mona', '2026-07-02T00:00:00Z', 'APPROVED')],
    },
  },
  'acme/api#1': {
    repo: 'acme/api',
    data: { authorLogin: 'octocat', createdAt: '2026-07-05T00:00:00Z', reviews: [review('hubot', '2026-07-05T03:00:00Z')] },
  },
  'acme/web#2': { repo: 'acme/web', data: { authorLogin: 'hubot', reviews: [] } },
};

const renderSection = (selectedAuthorLogin, rows = ROWS) =>
  render(
    <PrDataProvider initialPayload={{ actorsMap: { hubot: 'Hubot', mona: 'Mona Lisa' }, byPrNumber: rows }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <AuthorStatsSection />
    </PrDataProvider>,
  );

const card = (name) => screen.getByRole('group', { name });

describe('AuthorStatsSection', () => {
  test("the selected author's medians, changes requested and top reviewers, from their PRs alone", () => {
    renderSection('octocat');

    expect(screen.getByRole('heading', { name: 'Across their 2 stored PRs' })).toBeInTheDocument();
    // First reviews after 5h and 3h.
    expect(card('First review')).toHaveTextContent('4hmedian, over 2 PRs');
    expect(card('Time to merge')).toHaveTextContent('2.5 daysmedian, over 1 merged PR');
    expect(card('Size')).toHaveTextContent('40 linesmedian, over 1 PR');
    expect(card('Changes requested')).toHaveTextContent('50%1 of 2 reviewed PRs');
    const reviewers = within(card('Reviewed most by')).getAllByRole('listitem').map((item) => item.textContent);
    expect(reviewers).toEqual(['HUHubot2 PRs', 'MLMona Lisa1 PR']);
  });

  test('a top reviewer opens on Authors', () => {
    const opened = [];
    const handler = (event) => opened.push(event.detail);
    window.addEventListener(OPEN_AUTHOR_EVENT, handler);
    renderSection('octocat');
    fireEvent.click(within(card('Reviewed most by')).getByRole('button', { name: /Hubot/ }));
    window.removeEventListener(OPEN_AUTHOR_EVENT, handler);
    expect(opened).toEqual([{ login: 'hubot', fallbackName: 'Hubot' }]);
  });

  test('says what is missing rather than showing 0', () => {
    renderSection('hubot');
    expect(card('First review')).toHaveTextContent('-No reviewed PRs yet');
    expect(card('Time to merge')).toHaveTextContent('-No merged PRs yet');
    expect(card('Size')).toHaveTextContent('-No sizes known yet');
    expect(card('Reviewed most by')).toHaveTextContent('No reviews yet');
  });

  test('nothing for an author without stored PRs', () => {
    const { container } = renderSection('mona');
    expect(container).toBeEmptyDOMElement();
  });
});
