/** @jest-environment jsdom */

const { render, screen, act, waitFor, within } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorInsightsSelector } = require('./AuthorInsightsSelector');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrDataProbe } = require('../test-fixtures/pr-data-probe');
// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): reads and
// writes PrDataProvider through this probe, not window.* bridges.
const prDataProbe = createPrDataProbe();
const { usePrData } = require('../state/PrDataContext');
const { AuthorInsightsContext, defaultAuthorInsights } = require('../state/AuthorInsightsContext');

// By name, as buildAuthorInsightsEntries sorts them.
const OPTIONS = [
  { login: 'ghost-user', name: 'Casper' },
  { login: 'hubot', name: 'Hubot' },
  { login: 'octocat', name: 'The Octocat' },
];

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// Hubot was active 2 days ago and The Octocat 10; Casper's only PR is a
// year old.
const ROWS = {
  1: { prNumber: '1', data: { number: 1, authorLogin: 'octocat', sourceUpdatedAt: daysAgo(10) } },
  2: { prNumber: '2', data: { number: 2, authorLogin: 'hubot', sourceUpdatedAt: daysAgo(2) } },
  3: { prNumber: '3', data: { number: 3, authorLogin: 'ghost-user', mergedAt: daysAgo(365) } },
};

let latestSelectedAuthorLogin;
function SelectedAuthorLoginProbe() {
  latestSelectedAuthorLogin = usePrData().selectedAuthorLogin;
  return null;
}

const renderSelector = ({ selectedAuthorLogin = '', rows = ROWS, buildAuthorInsightsEntries = () => OPTIONS } = {}) =>
  render(
    <PrDataProvider initialPayload={{ byPrNumber: rows }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <prDataProbe.PrDataProbe />
      <AuthorInsightsContext.Provider value={{ ...defaultAuthorInsights, buildAuthorInsightsEntries }}>
        <SelectedAuthorLoginProbe />
        <AuthorInsightsSelector />
      </AuthorInsightsContext.Provider>
    </PrDataProvider>,
  );

const picker = () => screen.getByRole('combobox', { name: 'Author' });
// Each option's label, without its avatar's initials or its login.
const labels = (options) => options.map((option) => option.querySelector('.ui-combobox-option-label').textContent);
const optionNames = () => labels(screen.getAllByRole('option'));

describe('AuthorInsightsSelector', () => {
  test('a text box named exactly "Author" showing the selected author by display name, the list closed', () => {
    renderSelector({ selectedAuthorLogin: 'octocat' });
    expect(picker()).toHaveValue('The Octocat');
    expect(picker()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('opened, it lists the authors of recently updated PRs first, newest first, then everyone else, each group labelled', async () => {
    const user = userEvent.setup();
    renderSelector({ selectedAuthorLogin: 'octocat' });

    await user.click(picker());

    expect(picker()).toHaveAttribute('aria-expanded', 'true');
    const recent = screen.getByRole('group', { name: 'Recent PRs' });
    const others = screen.getByRole('group', { name: 'Everyone else' });
    expect(labels(within(recent).getAllByRole('option'))).toEqual(['Hubot', 'The Octocat']);
    expect(labels(within(others).getAllByRole('option'))).toEqual(['Casper']);
  });

  test('each option has an avatar, and the login when it is not the name', async () => {
    const user = userEvent.setup();
    renderSelector({
      selectedAuthorLogin: 'octocat',
      buildAuthorInsightsEntries: () => [...OPTIONS, { login: 'mona', name: 'mona' }],
    });

    await user.click(picker());

    const octocat = screen.getByRole('option', { name: 'The Octocat octocat' });
    expect(octocat.querySelector('.ui-avatar')).toHaveTextContent('TO');
    expect(screen.getByRole('option', { name: 'mona' }).querySelector('.ui-combobox-option-detail')).toBeNull();
  });

  test('with no PR updated recently, one list with no group labels', async () => {
    const user = userEvent.setup();
    renderSelector({ selectedAuthorLogin: 'octocat', rows: { 1: { data: { authorLogin: 'octocat', sourceUpdatedAt: '2020-01-01T00:00:00Z' } } } });

    await user.click(picker());

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(optionNames()).toEqual(['Casper', 'Hubot', 'The Octocat']);
  });

  test('typing narrows the list by name or login, ignoring case, and says how many match', async () => {
    const user = userEvent.setup();
    renderSelector({ selectedAuthorLogin: 'octocat' });

    await user.click(picker());
    await user.clear(picker());
    await user.type(picker(), 'HUB');
    expect(optionNames()).toEqual(['Hubot']);
    expect(screen.getByRole('status')).toHaveTextContent('1 match');

    await user.clear(picker());
    await user.type(picker(), 'ghost');
    expect(optionNames()).toEqual(['Casper']);

    await user.type(picker(), 'zzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('listbox')).toHaveTextContent('No authors match');
    expect(screen.getByRole('status')).toHaveTextContent('No authors match');
  });

  test('clicking an option picks it and closes the list', async () => {
    const user = userEvent.setup();
    renderSelector({ selectedAuthorLogin: 'octocat' });

    await user.click(picker());
    await user.click(screen.getByRole('option', { name: 'Hubot hubot' }));

    expect(latestSelectedAuthorLogin).toBe('hubot');
    expect(picker()).toHaveValue('Hubot');
    expect(picker()).toHaveAttribute('aria-expanded', 'false');
    expect(picker()).toHaveFocus();
  });

  test('from the keyboard: Down opens on the selected author, Up and Down move, Enter picks', async () => {
    const user = userEvent.setup();
    renderSelector({ selectedAuthorLogin: 'octocat' });

    picker().focus();
    await user.keyboard('{ArrowDown}');
    const active = () => document.getElementById(picker().getAttribute('aria-activedescendant'));
    expect(active()).toHaveTextContent('The Octocat');
    expect(active()).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(active()).toHaveTextContent('Casper');
    // Past the end, back to the start; and back again.
    await user.keyboard('{ArrowDown}');
    expect(active()).toHaveTextContent('Hubot');
    await user.keyboard('{ArrowUp}');
    expect(active()).toHaveTextContent('Casper');

    await user.keyboard('{Enter}');
    expect(latestSelectedAuthorLogin).toBe('ghost-user');
    expect(picker()).toHaveValue('Casper');
    expect(picker()).not.toHaveAttribute('aria-activedescendant');
  });

  test('typing then Enter picks the first match', async () => {
    const user = userEvent.setup();
    renderSelector({ selectedAuthorLogin: 'octocat' });

    await user.click(picker());
    await user.clear(picker());
    await user.type(picker(), 'cas{Enter}');

    expect(latestSelectedAuthorLogin).toBe('ghost-user');
  });

  test('Escape, Tab or leaving the box closes the list without a change, showing the selected author again', async () => {
    const user = userEvent.setup();
    renderSelector({ selectedAuthorLogin: 'octocat' });

    for (const leave of ['{Escape}', '{Tab}']) {
      await user.click(picker());
      await user.clear(picker());
      await user.type(picker(), 'hub');
      await user.keyboard(leave);
      expect(picker()).toHaveAttribute('aria-expanded', 'false');
      expect(picker()).toHaveValue('The Octocat');
    }

    await user.click(picker());
    await user.type(picker(), 'x');
    act(() => picker().blur());
    expect(picker()).toHaveAttribute('aria-expanded', 'false');
    expect(picker()).toHaveValue('The Octocat');
    expect(latestSelectedAuthorLogin).toBe('octocat');
  });

  test('a change to the selected author elsewhere shows in the box', () => {
    renderSelector({ selectedAuthorLogin: 'octocat' });

    act(() => {
      prDataProbe.setSelectedAuthorLogin('hubot');
    });

    expect(picker()).toHaveValue('Hubot');
  });

  test('when the selected author is not among the options, it picks the author of the most recently updated PR', async () => {
    renderSelector({ selectedAuthorLogin: 'someone-removed' });

    await waitFor(() => expect(latestSelectedAuthorLogin).toBe('hubot'));
    expect(picker()).toHaveValue('Hubot');
  });

  test('with no stored PRs, it says so instead of the picker (even if buildAuthorInsightsEntries would give options)', () => {
    renderSelector({ rows: {} });
    expect(screen.getByText('No local rows available for author insights.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  test('with no authors, it says so instead of the picker, and clears the selection', async () => {
    renderSelector({ selectedAuthorLogin: 'octocat', buildAuthorInsightsEntries: () => [] });

    expect(screen.getByText('No authors found in the current local data scope.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await waitFor(() => expect(latestSelectedAuthorLogin).toBe(''));
  });
});
