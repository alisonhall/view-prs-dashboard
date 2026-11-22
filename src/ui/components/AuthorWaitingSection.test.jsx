/** @jest-environment jsdom */

const { render, screen, within, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorWaitingSection } = require('./AuthorWaitingSection');
const { PrDataProvider } = require('../state/PrDataProvider');
const { StoredPrRepoNamesProvider } = require('../state/RowRepoNamesContext');

const HOUR = 60 * 60 * 1000;
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();
const review = (authorLogin, submittedAt, state = 'COMMENTED') => ({ authorLogin, submittedAt, state });

const renderSection = (selectedAuthorLogin, rows) =>
  render(
    <PrDataProvider initialPayload={{ byPrNumber: rows }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <StoredPrRepoNamesProvider>
        <AuthorWaitingSection />
      </StoredPrRepoNamesProvider>
    </PrDataProvider>,
  );

describe('AuthorWaitingSection', () => {
  const rows = {
    'acme/web#1': { repo: 'acme/web', prNumber: '1', section: 'open', data: { title: 'New page', authorLogin: 'octocat', createdAt: ago(30) } },
    'acme/web#2': {
      repo: 'acme/web',
      prNumber: '2',
      section: 'open',
      data: { title: 'Fix bug', authorLogin: 'octocat', createdAt: ago(100), reviews: [review('hubot', ago(72), 'CHANGES_REQUESTED')] },
    },
    'acme/web#3': { repo: 'acme/web', prNumber: '3', section: 'draft', data: { authorLogin: 'octocat', createdAt: ago(200) } },
    'acme/web#4': { repo: 'acme/web', prNumber: '4', section: 'open', data: { authorLogin: 'hubot', createdAt: ago(5) } },
  };

  test('their open PRs, longest waiting first, each with what it waits on; drafts left out', () => {
    renderSection('octocat', rows);
    const section = screen.getByRole('region', { name: 'Waiting now' });
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('#2 Fix bug');
    expect(items[0]).toHaveTextContent('Changes requested 3 days ago, no commits since');
    expect(items[1]).toHaveTextContent('#1 New page');
    expect(items[1]).toHaveTextContent('Waiting 30h for a first review');
  });

  test('View in table opens the PR in the table', () => {
    const events = [];
    const handler = (event) => events.push(event.detail);
    window.addEventListener('pr-navigate-to-insights', handler);
    renderSection('octocat', rows);
    fireEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('button', { name: 'View in table' }));
    window.removeEventListener('pr-navigate-to-insights', handler);
    expect(events).toEqual([expect.objectContaining({ prNumber: '2', repo: 'acme/web' })]);
  });

  test('says so when none are open for review, and is empty for an author without PRs', () => {
    const { unmount } = renderSection('octocat', { 'acme/web#3': rows['acme/web#3'] });
    expect(screen.getByText('None of their PRs are open for review.')).toBeInTheDocument();
    unmount();
    const { container } = renderSection('mona', rows);
    expect(container).toBeEmptyDOMElement();
  });
});
