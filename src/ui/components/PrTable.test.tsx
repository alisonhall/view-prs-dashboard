/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PrEntry } from '../types/pr-data.ts';
import { PrTable, type PrTableProps } from './PrTable';

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
  headers().map((header) => header.querySelector('[aria-hidden="true"]')?.textContent ?? header.textContent);
const headerNames = () =>
  headers().map((header) => header.querySelector('.ui-visually-hidden')?.textContent ?? header.textContent);

describe('PrTable', () => {
  test('is named by its section and has a header per column', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Open PRs' })).toBeInTheDocument();
    expect(headerShown()).toEqual(['Select', 'Signals', 'Pull request', 'Who', 'Review', 'CHK·MRG', 'Size', 'Activity', 'Actions']);
    expect(document.querySelectorAll('col')).toHaveLength(9);
  });

  test('spells abbreviated headers out for screen readers, with the abbreviation hidden from them', () => {
    renderTable();
    expect(headerNames()).toEqual([
      'Select',
      'Signals: changed, needs attention, flagged, in review',
      'Pull request',
      'Author',
      'Review: approvals, open conversations, viewed files, notes, assigned',
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

  test('drops the Size and Activity columns when asked', () => {
    renderTable({ showSizeAndActivity: false });
    expect(headerShown()).toEqual(['Select', 'Signals', 'Pull request', 'Who', 'Review', 'CHK·MRG', 'Actions']);
    expect(document.querySelectorAll('col')).toHaveLength(7);
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
