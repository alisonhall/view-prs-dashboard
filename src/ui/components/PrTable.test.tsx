/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PrEntry } from '../types/pr-data.ts';
import { PrTable, type PrTableProps } from './PrTable';
import { PrSectionPreferencesContext } from '../state/PrSectionPreferencesProvider';
import { ShowRowRepoContext } from '../state/ShowRowRepoContext';

const entry = (number: string, extra: Partial<PrEntry['data']> = {}): PrEntry => ({
  prNumber: number,
  repo: 'owner/repo',
  section: 'open',
  data: { number, title: `PR ${number}`, ...extra },
});

const renderTable = (props: Partial<PrTableProps> = {}) =>
  render(
    <PrTable
      prs={[entry('2'), entry('1')]}
      repo="owner/repo"
      sectionKey="open"
      label="Open PRs"
      expandedInsights={{}}
      onToggleInsights={jest.fn()}
      {...props}
    />,
  );

const headers = () => within(screen.getAllByRole('rowgroup')[0] as HTMLElement).getAllByRole('columnheader');
// What each header shows (the abbreviation), and its name for screen
// readers (the visually hidden full name, when there is one).
const headerShown = () =>
  headers().map((header) => header.querySelector('span[aria-hidden="true"]')?.textContent ?? header.textContent);
const headerNames = () =>
  headers().map((header) => header.querySelector('.ui-visually-hidden')?.textContent ?? header.textContent);

describe('PrTable', () => {
  test('is named by its section and has a header per column', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Open PRs' })).toBeInTheDocument();
    expect(headerShown()).toEqual(['Select', 'Signals', 'Pull request', 'Author', 'Review', 'CHK·MRG', 'Size', 'Activity', 'Actions']);
    expect(document.querySelectorAll('col')).toHaveLength(9);
  });

  test('spells abbreviated headers out for screen readers, with the abbreviation hidden from them', () => {
    renderTable();
    expect(headerNames()).toEqual([
      'Select',
      'Signals: changed, needs attention, flagged, in review',
      'Pull request',
      'Author',
      'Review: approvals, open conversations, viewed files, notes, assigned, review requested',
      'Checks and mergeability',
      'Size',
      'Activity',
      'Actions',
    ]);
    expect(screen.getByRole('columnheader', { name: 'Checks and mergeability' })).toBeInTheDocument();
    const abbreviation = screen.getByText('CHK·MRG');
    expect(abbreviation).toHaveAttribute('aria-hidden', 'true');
    expect(abbreviation).toHaveAttribute('data-tip', 'Checks and mergeability');
  });

  test('renders a row per PR, in order', () => {
    renderTable();
    expect(Array.from(document.querySelectorAll('tr.pr-row')).map((row) => row.getAttribute('data-pr-number'))).toEqual(['2', '1']);
  });

  test('gives each row its own flags and attention reasons', () => {
    renderTable({
      getPrFlags: (prNumber) => ({ isFlagged: prNumber === '2', isInReview: prNumber === '1', isAcknowledged: false }),
      getAttentionReasons: (pr) => (pr.data?.number === '1' ? ['New commits'] : []),
    });
    const [row2, row1] = Array.from(document.querySelectorAll('tr.pr-row')) as HTMLElement[];
    expect(within(row2 as HTMLElement).getByRole('img', { name: 'Flagged' })).toBeInTheDocument();
    expect(within(row2 as HTMLElement).queryByRole('img', { name: 'Needs attention' })).not.toBeInTheDocument();
    expect(within(row1 as HTMLElement).getByRole('img', { name: 'In review' })).toBeInTheDocument();
    expect(within(row1 as HTMLElement).getByRole('img', { name: 'Needs attention' })).toBeInTheDocument();
  });

  test('gives each row its own summary state, by composite key', () => {
    renderTable({ expandedInsights: { 'open:owner/repo:1': true } });
    expect(screen.getByRole('button', { name: 'Hide summary for PR #1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show summary for PR #2' })).toBeInTheDocument();
  });

  test('marks only the selected PR\'s row as current', () => {
    renderTable({ selectedPrKey: 'owner/repo::1' });
    const [row2, row1] = Array.from(document.querySelectorAll('tr.pr-row'));
    expect(row1).toHaveAttribute('aria-current', 'true');
    expect(row2).not.toHaveAttribute('aria-current');
  });

  describe('keyboard selection', () => {
    const rows = () => Array.from(document.querySelectorAll<HTMLElement>('tr.pr-row'));
    const prLink = (number: string) => screen.getAllByRole('link', { name: `#${number}` })[0] as HTMLElement;

    test('↓ with nothing selected selects the row with focus', () => {
      const onSelectPr = jest.fn(() => true);
      renderTable({ prs: [entry('3'), entry('2'), entry('1')], onSelectPr });
      fireEvent.keyDown(within(rows()[1] as HTMLElement).getByRole('button', { name: 'Ack PR #2' }), { key: 'ArrowDown' });
      expect(onSelectPr).toHaveBeenCalledWith('2', 'owner/repo');
      expect(prLink('2')).toHaveFocus();
    });

    test('↑/↓ from the selected row select the row above/below and move focus there', () => {
      const onSelectPr = jest.fn(() => true);
      renderTable({ prs: [entry('3'), entry('2'), entry('1')], selectedPrKey: 'owner/repo::2', onSelectPr });
      fireEvent.keyDown(prLink('2'), { key: 'ArrowDown' });
      expect(onSelectPr).toHaveBeenLastCalledWith('1', 'owner/repo');
      expect(prLink('1')).toHaveFocus();

      fireEvent.keyDown(prLink('2'), { key: 'ArrowUp' });
      expect(onSelectPr).toHaveBeenLastCalledWith('3', 'owner/repo');
    });

    test('at the last row, ↓ does nothing', () => {
      const onSelectPr = jest.fn(() => true);
      renderTable({ selectedPrKey: 'owner/repo::1', onSelectPr });
      fireEvent.keyDown(prLink('1'), { key: 'ArrowDown' });
      expect(onSelectPr).not.toHaveBeenCalled();
    });

    test('focus stays put when the selection was refused (unsaved notes kept)', () => {
      renderTable({ selectedPrKey: 'owner/repo::2', onSelectPr: () => false });
      const link = prLink('2');
      link.focus();
      fireEvent.keyDown(link, { key: 'ArrowDown' });
      expect(link).toHaveFocus();
    });

    test('keys a control already used (the More button opens its menu on ↓) are left alone', () => {
      const onSelectPr = jest.fn(() => true);
      renderTable({ onSelectPr });
      fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for PR #2' }), { key: 'ArrowDown' });
      expect(onSelectPr).not.toHaveBeenCalled();
    });

    test('Esc clears the selection, and does nothing without one', () => {
      const onClearSelection = jest.fn();
      const { unmount } = renderTable({ onClearSelection });
      fireEvent.keyDown(prLink('2'), { key: 'Escape' });
      expect(onClearSelection).not.toHaveBeenCalled();
      unmount();

      renderTable({ selectedPrKey: 'owner/repo::2', onClearSelection });
      fireEvent.keyDown(prLink('2'), { key: 'Escape' });
      expect(onClearSelection).toHaveBeenCalledTimes(1);
    });
  });

  test('marks only the busy row\'s repo-specific key as active', () => {
    renderTable({ activePrNumbers: ['owner/repo::1'] });
    expect(screen.getByRole('img', { name: 'PR #1 update in progress' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'PR #2 update in progress' })).not.toBeInTheDocument();
  });

  test('threads onViewJson to each row with that row\'s entry', async () => {
    const user = userEvent.setup();
    const onViewJson = jest.fn();
    renderTable({ onViewJson });
    await user.click(screen.getByRole('button', { name: 'More actions for PR #1' }));
    await user.click(screen.getByRole('menuitem', { name: 'View PR JSON details' }));
    expect(onViewJson).toHaveBeenCalledWith({ prNumber: '1', repo: 'owner/repo' }, { number: '1', title: 'PR 1' });
  });
});

describe('PrTable with rows from several repos', () => {
  const fromRepo = (repo: string, number: string): PrEntry => ({ ...entry(number), repo });
  const rows = [fromRepo('acme/web', '3'), fromRepo('acme/api', '1'), fromRepo('acme/web', '4')];
  const preferences = (groupByRepo: boolean) => ({
    preferences: {},
    isReady: true,
    setSectionHidden: jest.fn(),
    setSectionStartsOpen: jest.fn(),
    setSectionSort: jest.fn(),
    resetSections: jest.fn(),
    groupByRepo,
    setGroupByRepo: jest.fn(),
  });
  const renderRows = (groupByRepo: boolean, showRepo: boolean) =>
    render(
      <PrSectionPreferencesContext.Provider value={preferences(groupByRepo)}>
        <ShowRowRepoContext.Provider value={showRepo}>
          <PrTable prs={rows} repo="acme/api" sectionKey="open" label="Open PRs" expandedInsights={{}} onToggleInsights={jest.fn()} />
        </ShowRowRepoContext.Provider>
      </PrSectionPreferencesContext.Provider>,
    );

  test('each row says its repo when rows from more than one are in view', () => {
    renderRows(false, true);
    const firstRow = document.querySelector('tr.pr-row') as HTMLElement;
    expect(within(firstRow).getByText('acme/web')).toHaveAttribute('title', 'In acme/web');
  });

  test("doesn't say the repo with rows from one", () => {
    renderRows(false, false);
    expect(document.querySelector('.pr-title-repo')).toBeNull();
  });

  test("grouped by repo, each repo's rows are a body of their own under its heading, A-Z, and don't each say it", () => {
    renderRows(true, true);
    const groups = Array.from(document.querySelectorAll('tbody.pr-repo-group')) as HTMLElement[];
    expect(groups.map((group) => group.querySelector('th[scope="rowgroup"]')?.textContent)).toEqual(['acme/api1 PR', 'acme/web2 PRs']);
    expect(groups.map((group) => Array.from(group.querySelectorAll('tr.pr-row')).map((row) => (row as HTMLElement).dataset.prNumber))).toEqual([
      ['1'],
      ['3', '4'],
    ]);
    expect(document.querySelector('.pr-title-repo')).toBeNull();
  });

  test('not grouped when the option is off', () => {
    renderRows(false, true);
    expect(document.querySelector('.pr-repo-group-row')).toBeNull();
  });
});

describe('PrTable section sort', () => {
  test("the Actions header holds the section's sort menu, keeping its own name; a section of one PR has none", () => {
    const { unmount } = render(
      <PrTable prs={[entry('2'), entry('1')]} repo="owner/repo" sectionKey="open" label="Open PRs" expandedInsights={{}} onToggleInsights={jest.fn()} />,
    );
    const actions = screen.getByRole('columnheader', { name: 'Actions' });
    expect(within(actions).getByRole('button', { name: 'Sort Open PRs: PR number, highest first' })).toBeInTheDocument();
    unmount();

    render(<PrTable prs={[entry('2')]} repo="owner/repo" sectionKey="open" label="Open PRs" expandedInsights={{}} onToggleInsights={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /^Sort Open PRs/ })).not.toBeInTheDocument();
  });
});
