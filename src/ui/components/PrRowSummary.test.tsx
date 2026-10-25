/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NowContext } from '../state/NowContext';
import type { PrData } from '../types/pr-data.ts';
import { PrRowSummary, type PrRowSummaryProps } from './PrRowSummary';

const NOW = Date.parse('2026-10-24T12:00:00Z');

const renderSummary = (pr: PrData, props: Partial<PrRowSummaryProps> = {}) => {
  const onShowDetails = props.onShowDetails ?? jest.fn();
  render(
    <NowContext.Provider value={NOW}>
      <PrRowSummary pr={pr} attentionReasons={[]} idPrefix="summary-101" {...props} onShowDetails={onShowDetails} />
    </NowContext.Provider>,
  );
  return { onShowDetails };
};

const column = (name: string) => screen.getByRole('group', { name });

describe('PrRowSummary', () => {
  test('lists the attention reasons, and the status line', () => {
    renderSummary(
      { number: '101', checkState: 'FAIL', mergeState: 'NO', approvalCount: '1' },
      { attentionReasons: ['New commits since your last ack', 'Unanswered thread'] },
    );

    const why = column("Why it's here");
    expect(within(why).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'New commits since your last ack',
      'Unanswered thread',
    ]);
    expect(why).toHaveTextContent('Checks failing · Has conflicts · 1 approval');
  });

  test('says so when nothing needs attention', () => {
    renderSummary({ number: '101' });
    expect(column("Why it's here")).toHaveTextContent('Nothing needs your attention');
  });

  test('lists Flagged and In review, which explain the groups the row is in, after any reasons', () => {
    renderSummary({ number: '101' }, { attentionReasons: ['New commits'], isFlagged: true, isInReview: true });

    const why = column("Why it's here");
    expect(within(why).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['New commits', 'Flagged', 'In review']);
    expect(why).not.toHaveTextContent('Nothing needs your attention');
  });

  test('a row only in review says so rather than "Nothing needs your attention"', () => {
    renderSummary({ number: '101' }, { isInReview: true });
    expect(within(column("Why it's here")).getByRole('listitem')).toHaveTextContent('In review');
    expect(column("Why it's here")).not.toHaveTextContent('Nothing needs your attention');
  });

  test('its columns are groups, not landmarks', () => {
    renderSummary({ number: '101' });
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    expect(screen.getAllByRole('group')).toHaveLength(3);
  });

  test("a snippet's hover tooltip is on the snippet alone, not on the name before it", () => {
    renderSummary({
      number: '101',
      activityEvents: [{ sourceId: 'e1', occurredAt: '2026-10-24T11:55:00Z', actor: 'alice', type: 'comment', channel: 'top-level', body: 'Hi there' }],
      reviewThreads: [{ id: 't', isResolved: false, comments: [{ createdAt: '2026-10-24T00:00:00Z', authorLogin: 'bob', body: 'Why?' }] }],
    });

    const eventSnippet = within(column('Latest activity')).getByText(/Hi there/);
    expect(eventSnippet).toHaveAttribute('data-tip', 'Hi there');
    expect(eventSnippet.closest('[data-tip]')).toBe(eventSnippet);
    expect(within(column('Latest activity')).getByText('alice').closest('[data-tip]')).toBeNull();
    expect(within(column('Open conversations')).getByText('bob').closest('[data-tip]')).toBeNull();
    expect(within(column('Open conversations')).getByText(/Why\?/)).toHaveAttribute('data-tip', 'Why?');
  });

  test('shows the newest three events, with who, what, a snippet and the age', () => {
    renderSummary({
      number: '101',
      activityEvents: [
        { sourceId: 'e1', occurredAt: '2026-10-24T11:55:00Z', actor: 'alice', type: 'comment', channel: 'top-level', body: 'Looks **good**' },
        { sourceId: 'e2', occurredAt: '2026-10-24T09:00:00Z', actor: 'bob', type: 'commit', channel: 'commit', messageHeadline: 'Fix the tests' },
        { sourceId: 'e3', occurredAt: '2026-10-22T12:00:00Z', actor: 'carol', type: 'approval', channel: 'review' },
        { sourceId: 'e4', occurredAt: '2026-10-01T12:00:00Z', actor: 'dave', type: 'comment', channel: 'top-level', body: 'Oldest' },
      ],
    });

    const items = within(column('Latest activity')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/alice commented: Looks good/);
    expect(items[0]).toHaveTextContent('5m');
    expect(items[1]).toHaveTextContent(/bob pushed a commit: Fix the tests/);
    expect(items[1]).toHaveTextContent('3h');
    expect(items[2]).toHaveTextContent(/carol approved/);
    expect(items[2]).toHaveTextContent('2d');
    // The full time is in the element for screen readers and the tooltip.
    const time = items[0]?.querySelector('time');
    expect(time).toHaveAttribute('dateTime', '2026-10-24T11:55:00Z');
    expect(time?.getAttribute('data-tip')).toBeTruthy();
  });

  test('says so when there is no activity', () => {
    renderSummary({ number: '101' });
    expect(column('Latest activity')).toHaveTextContent('No activity recorded');
  });

  test('shows two open conversations with file, line and the latest comment, and how many more there are', () => {
    const openThread = (id: string, createdAt: string, body: string, path = '') => ({
      id,
      isResolved: false,
      comments: [{ createdAt, authorLogin: 'alice', body, path, line: 7, url: `https://github.com/o/r/pull/101#${id}` }],
    });
    renderSummary({
      number: '101',
      reviewThreads: [
        openThread('t1', '2026-10-20T00:00:00Z', 'Oldest open', 'src/old.ts'),
        openThread('t2', '2026-10-23T00:00:00Z', 'Please rename this', 'src/ui/components/PrRow.tsx'),
        { id: 't3', isResolved: true, comments: [{ createdAt: '2026-10-24T00:00:00Z', body: 'Resolved one' }] },
        openThread('t4', '2026-10-22T00:00:00Z', 'Why not reuse it?'),
      ],
    });

    const threads = column('Open conversations');
    const items = within(threads).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const fileLink = within(items[0] as HTMLElement).getByRole('link', { name: 'PrRow.tsx L7' });
    expect(fileLink).toHaveAttribute('href', 'https://github.com/o/r/pull/101#t2');
    expect(fileLink).toHaveAttribute('data-tip', 'src/ui/components/PrRow.tsx');
    expect(items[0]).toHaveTextContent('alice: Please rename this');
    // A thread with no file is named as a conversation.
    expect(within(items[1] as HTMLElement).getByRole('link', { name: 'Conversation' })).toBeInTheDocument();
    expect(threads).toHaveTextContent('+1 more open');
  });

  test('says so when no conversation is open', () => {
    renderSummary({ number: '101', reviewThreads: [{ id: 't', isResolved: true, comments: [] }] });
    expect(column('Open conversations')).toHaveTextContent('None open');
  });

  test('"Show details" reports its clicks (it opens the PR in the detail pane)', async () => {
    const user = userEvent.setup();
    const { onShowDetails } = renderSummary({ number: '101' });

    const button = screen.getByRole('button', { name: 'Show details for PR #101' });
    expect(button).toHaveTextContent('Show details');
    await user.click(button);
    expect(onShowDetails).toHaveBeenCalledTimes(1);
  });
});
