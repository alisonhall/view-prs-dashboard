/** @jest-environment jsdom */

const { render, screen, within, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorStatsSection } = require('./AuthorStatsSection');
const { PrDataProvider } = require('../state/PrDataProvider');
const { StoredPrRepoNamesProvider } = require('../state/RowRepoNamesContext');
const { OPEN_AUTHOR_EVENT } = require('../state/useOpenAuthor');
const { AUTHOR_STATS_RANGE_STORAGE_KEY } = require('./AuthorStatsSection');

const review = (authorLogin, submittedAt, state = 'COMMENTED') => ({ authorLogin, submittedAt, state });
const ROWS = {
  'acme/web#1': {
    repo: 'acme/web',
    prNumber: '1',
    data: {
      title: 'Add login',
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
    prNumber: '1',
    data: { authorLogin: 'octocat', createdAt: '2026-07-05T00:00:00Z', reviews: [review('hubot', '2026-07-05T03:00:00Z')] },
  },
  'acme/web#2': { repo: 'acme/web', data: { authorLogin: 'hubot', reviews: [] } },
};

const renderSection = (selectedAuthorLogin, rows = ROWS) =>
  render(
    <PrDataProvider initialPayload={{ actorsMap: { hubot: 'Hubot', mona: 'Mona Lisa' }, byPrNumber: rows }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <StoredPrRepoNamesProvider>
        <AuthorStatsSection />
      </StoredPrRepoNamesProvider>
    </PrDataProvider>,
  );

const card = (name) => screen.getByRole('group', { name });

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();

describe('AuthorStatsSection', () => {
  // The fixture's PRs are from July 2026: all time unless a test picks.
  beforeEach(() => window.localStorage.setItem(AUTHOR_STATS_RANGE_STORAGE_KEY, 'all'));
  afterEach(() => window.localStorage.clear());

  test("the selected author's medians, changes requested and top reviewers, from their PRs alone", () => {
    renderSection('octocat');

    expect(screen.getByRole('heading', { name: 'Across their 2 PRs stored' })).toBeInTheDocument();
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
    expect(opened).toEqual([expect.objectContaining({ login: 'hubot', fallbackName: 'Hubot' })]);
  });

  test('says what is missing rather than showing 0', () => {
    renderSection('hubot');
    expect(card('First review')).toHaveTextContent('-No reviewed PRs yet');
    expect(card('Time to merge')).toHaveTextContent('-No merged PRs yet');
    expect(card('Size')).toHaveTextContent('-No sizes known yet');
    expect(card('Reviewed most by')).toHaveTextContent('No reviews yet');
  });

  test('nothing for someone with neither PRs nor reviews stored', () => {
    const { container } = renderSection('nobody');
    expect(container).toBeEmptyDOMElement();
  });

  test("each card shows the team's figure, over every author's PRs", () => {
    const rows = {
      ...ROWS,
      'acme/web#3': {
        repo: 'acme/web',
        data: {
          authorLogin: 'mona',
          createdAt: '2026-07-10T00:00:00Z',
          mergedAt: '2026-07-10T06:00:00Z',
          additions: '100',
          deletions: '0',
          reviews: [review('octocat', '2026-07-10T01:00:00Z')],
        },
      },
    };
    renderSection('octocat', rows);
    // First reviews 5h, 3h and 1h; merges 60h and 6h; sizes 40 and 100.
    expect(card('First review')).toHaveTextContent('Team: 3h');
    expect(card('Time to merge')).toHaveTextContent('Team: 33h');
    expect(card('Size')).toHaveTextContent('Team: 70 lines');
    expect(card('Changes requested')).toHaveTextContent('Team: 33%');
  });

  test('Show PRs lists the PRs behind a number, longest wait first', () => {
    renderSection('octocat');
    const firstReview = card('First review');
    expect(within(firstReview).getByText('Show PRs (2)')).toBeInTheDocument();
    const items = within(firstReview).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('link').textContent)).toEqual(['web#1 Add login', 'api#1']);
    expect(items[0]).toHaveTextContent('5h');
    expect(within(items[0]).getByRole('link')).toHaveAttribute('href', 'https://github.com/acme/web/pull/1');
    expect(within(items[0]).getByRole('button', { name: 'View in table' })).toBeInTheDocument();
    expect(within(card('Changes requested')).getByText('Show PRs (1)')).toBeInTheDocument();
  });

  test('defaults to the last 90 days, and All time is kept in this browser', () => {
    window.localStorage.clear();
    const rows = {
      ...ROWS,
      'acme/web#4': { repo: 'acme/web', data: { authorLogin: 'octocat', createdAt: daysAgo(10), reviews: [] } },
    };
    renderSection('octocat', rows);
    expect(screen.getByRole('heading', { name: 'Across their 1 PR opened in the last 90 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Last 90 days' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(screen.getByRole('heading', { name: 'Across their 3 PRs stored' })).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTHOR_STATS_RANGE_STORAGE_KEY)).toBe('all');
  });

  test('with no PRs in the range, says so beside the range switch', () => {
    window.localStorage.clear();
    renderSection('octocat');
    expect(screen.getByRole('heading', { name: 'No PRs opened in the last 90 days' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'First review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All time' })).toBeInTheDocument();
  });

  test("their reviews of others: how many, how soon, how they ended, and whose", () => {
    renderSection('hubot');
    expect(screen.getByRole('heading', { name: 'Their reviews of others' })).toBeInTheDocument();
    expect(card('PRs reviewed')).toHaveTextContent('2approved 0, asked for changes on 1');
    // First responses after 5h and 3h.
    expect(card('First response')).toHaveTextContent('4hmedian, over 2 PRs');
    expect(within(card('First response')).getByText('Show PRs (2)')).toBeInTheDocument();
    expect(within(card('Reviews most for')).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['OCoctocat2 PRs']);
  });

  test('Over time says so when none of their PRs has an opening date', () => {
    renderSection('hubot');
    expect(card('Over time')).toHaveTextContent('No opening dates known');
    expect(within(card('Over time')).queryByRole('table')).not.toBeInTheDocument();
  });

  test('someone who only reviews still gets their reviews of others', () => {
    renderSection('mona');
    expect(screen.getByRole('heading', { name: 'No PRs stored' })).toBeInTheDocument();
    expect(card('PRs reviewed')).toHaveTextContent('1approved 1');
  });

  test('Over time and By size tables, with a bar per wait', () => {
    renderSection('octocat');
    const months = within(card('Over time')).getAllByRole('row').map((row) => row.textContent);
    expect(months[0]).toBe('MonthPRsFirst reviewTime to merge');
    expect(months.slice(1)).toEqual([expect.stringMatching(/^Jul 2026\s*24h2\.5 days$/)]);
    const sizes = within(card('By size')).getAllByRole('row').map((row) => row.textContent);
    expect(sizes.slice(1)).toEqual(['Under 100 lines15h2.5 days', '100 to 499 lines0--', '500+ lines0--']);
  });

  test('the slowest 1 in 10 shows under a median once there are 5 PRs', () => {
    const rows = {};
    [1, 2, 3, 4, 20].forEach((hours, index) => {
      rows[`acme/web#${index + 1}`] = {
        repo: 'acme/web',
        prNumber: String(index + 1),
        data: { authorLogin: 'octocat', createdAt: '2026-07-01T00:00:00Z', reviews: [review('hubot', `2026-07-01T${String(hours).padStart(2, '0')}:00:00Z`)] },
      };
    });
    renderSection('octocat', rows);
    expect(card('First review')).toHaveTextContent('1 in 10 over 20h');
    expect(card('Time to merge')).not.toHaveTextContent('1 in 10');
  });
});
