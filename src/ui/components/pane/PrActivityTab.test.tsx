/** @jest-environment jsdom */

import { useState } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NowContext } from '../../state/NowContext';
import type { PrActivityEvent, PrData } from '../../types/pr-data.ts';
import { DEFAULT_ACTIVITY_FILTERS, PrActivityTab, type ActivityFilters } from './PrActivityTab';

const NOW = Date.parse('2026-10-24T18:00:00Z');

// index.html loads marked and DOMPurify from <script>s; without them the
// markdown renderer fails closed to escaped text.
beforeAll(() => {
  const globals = window as unknown as { DOMPurify: unknown; marked: unknown };
  globals.DOMPurify = jest.requireActual('dompurify');
  globals.marked = jest.requireActual('../../vendor/marked.umd.js');
});

const event = (id: string, occurredAt: string, extra: Partial<PrActivityEvent> = {}): PrActivityEvent => ({
  sourceId: id,
  occurredAt,
  actor: 'alice',
  type: 'comment',
  channel: 'top-level',
  ...extra,
});

const basePr = (activityEvents: PrActivityEvent[], extra: Partial<PrData> = {}): PrData => ({
  number: '7',
  url: 'https://github.com/o/r/pull/7',
  activityEvents,
  ...extra,
});

// The tab with real filter state, as the pane holds it.
function Harness({ pr, lastLookedAt = '', initial = DEFAULT_ACTIVITY_FILTERS }: { pr: PrData; lastLookedAt?: string; initial?: ActivityFilters }) {
  const [filters, setFilters] = useState(initial);
  return (
    <NowContext.Provider value={NOW}>
      <PrActivityTab pr={pr} lastLookedAt={lastLookedAt} filters={filters} onFiltersChange={setFilters} timeZone="UTC" />
    </NowContext.Provider>
  );
}

const dayGroups = () => screen.queryAllByRole('group').filter((group) => group.classList.contains('pr-activity-day'));
const dayHeadings = () => dayGroups().map((group) => within(group).getByRole('heading').textContent);
const items = () => Array.from(document.querySelectorAll('.pr-activity-list > li'));

const events = [
  event('c3', '2026-10-24T15:00:00Z', { body: 'Newest comment' }),
  event('a2', '2026-10-23T09:00:00Z', { type: 'approval', channel: 'review', actor: 'bob' }),
  event('c1', '2026-10-20T12:00:00Z', { body: 'Oldest comment' }),
];

describe('PrActivityTab', () => {
  test('groups events by day, newest first, with who did what', () => {
    render(<Harness pr={basePr(events)} />);
    expect(dayHeadings()).toEqual(['Today', 'Yesterday', 'Tue · Oct 20']);
    expect(items()[0]).toHaveTextContent(/alice commented/);
    expect(items()[0]).toHaveTextContent('Newest comment');
    expect(items()[1]).toHaveTextContent(/bob approved/);
  });

  test('"Since I last looked" (the default) shows only newer events, and offers the earlier ones', async () => {
    const user = userEvent.setup();
    render(<Harness pr={basePr(events)} lastLookedAt="2026-10-22T00:00:00Z" />);
    const scope = screen.getByRole('group', { name: 'Scope' });
    expect(within(scope).getByRole('button', { name: /Since I last looked/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(scope).getByRole('button', { name: /Since I last looked/ })).toHaveTextContent('2');
    expect(within(scope).getByRole('button', { name: /^All/ })).toHaveTextContent('3');
    expect(items()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Show 1 earlier event' }));
    expect(within(scope).getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    // All of them, with a divider where the ones already seen begin.
    expect(items()).toHaveLength(4);
    expect(document.querySelector('.pr-activity-marker')).toHaveTextContent(/You last looked/);
  });

  test('without a last-looked time there is no scope choice: everything shows', () => {
    render(<Harness pr={basePr(events)} />);
    expect(screen.queryByRole('group', { name: 'Scope' })).not.toBeInTheDocument();
    expect(items()).toHaveLength(3);
  });

  test('says so when nothing is new since you last looked', () => {
    render(<Harness pr={basePr(events)} lastLookedAt="2026-10-24T16:00:00Z" />);
    expect(screen.getByText('Nothing new since you last looked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 3 earlier events' })).toBeInTheDocument();
  });

  test('the type chips filter the events and show each kind\'s count', async () => {
    const user = userEvent.setup();
    render(<Harness pr={basePr(events)} />);
    const types = screen.getByRole('group', { name: 'Event types' });
    expect(within(types).getByRole('button', { name: /Comments/ })).toHaveTextContent('2');
    expect(within(types).getByRole('button', { name: /Reviews/ })).toHaveTextContent('1');

    await user.click(within(types).getByRole('button', { name: /Comments/ }));
    expect(within(types).getByRole('button', { name: /Comments/ })).toHaveAttribute('aria-pressed', 'false');
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent(/bob approved/);

    await user.click(within(types).getByRole('button', { name: /Reviews/ }));
    expect(screen.getByText('No events match these filters')).toBeInTheDocument();
  });

  test('says so when there is no activity at all', () => {
    render(<Harness pr={basePr([])} />);
    expect(screen.getByText('No activity recorded')).toBeInTheDocument();
  });

  test('one person\'s run of commits is one line that expands to list them', async () => {
    const user = userEvent.setup();
    const commit = (sha: string, at: string, headline: string) =>
      event(sha, at, { type: 'commit', channel: 'commit', messageHeadline: headline });
    render(
      <Harness
        pr={basePr([
          commit('aaaaaaa111', '2026-10-24T15:00:00Z', 'Add tests'),
          commit('bbbbbbb222', '2026-10-24T14:00:00Z', 'Wire up store'),
          commit('ccccccc333', '2026-10-24T13:00:00Z', 'Initial page'),
        ])}
      />,
    );
    const run = screen.getByRole('button', { name: /alice pushed 3 commits/ });
    expect(run).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Wire up store')).not.toBeInTheDocument();

    await user.click(run);
    expect(run).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('bbbbbbb', { exact: false }).closest('li')).toHaveTextContent('bbbbbbb Wire up store');
  });

  test('a comment shows in full, rendered as markdown; a long one folds until "Show more"', async () => {
    const user = userEvent.setup();
    const long = `**Bold** start\n\n${'word '.repeat(120)}`;
    render(<Harness pr={basePr([event('c', '2026-10-24T15:00:00Z', { body: long })])} />);
    expect(document.querySelector('.pr-activity-text strong')).toHaveTextContent('Bold');
    const text = document.querySelector('.pr-activity-text') as HTMLElement;
    expect(text).toHaveAttribute('data-folded', 'true');
    // Folded, not cut short: the whole text is there.
    expect(text.textContent).toContain('word '.repeat(120).trim());

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(text).not.toHaveAttribute('data-folded');
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  });

  describe('folding by the laid-out height (16px text: the fold is 144px)', () => {
    let textHeight = 0;
    let resize: (() => void) | undefined;
    let style: HTMLStyleElement;

    beforeEach(() => {
      jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => textHeight);
      // A real rule, so getComputedStyle (which role queries use too) has it.
      style = document.createElement('style');
      style.textContent = '.pr-activity-text { font-size: 16px; }';
      document.head.appendChild(style);
      // jsdom has no ResizeObserver; this one lets a test resize the text.
      (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      };
    });

    afterEach(() => {
      jest.restoreAllMocks();
      style.remove();
      delete (window as unknown as { ResizeObserver?: unknown }).ResizeObserver;
      resize = undefined;
    });

    test('a long comment that fits within the fold (a wide pane) gets no "Show more"', () => {
      textHeight = 100;
      render(<Harness pr={basePr([event('c', '2026-10-24T15:00:00Z', { body: 'word '.repeat(100) })])} />);
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
      expect(document.querySelector('.pr-activity-text')).not.toHaveAttribute('data-folded');
    });

    test('it folds once the pane gets narrower and the text taller, and unfolds when it gets wider again', () => {
      textHeight = 100;
      render(<Harness pr={basePr([event('c', '2026-10-24T15:00:00Z', { body: 'word '.repeat(100) })])} />);
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();

      textHeight = 300;
      act(() => resize?.());
      expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
      expect(document.querySelector('.pr-activity-text')).toHaveAttribute('data-folded', 'true');

      textHeight = 120;
      act(() => resize?.());
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    });
  });

  test('a commit message is plain text, its line breaks kept - not markdown', () => {
    render(
      <Harness
        pr={basePr([
          event('aaaaaaa1', '2026-10-24T15:00:00Z', {
            type: 'commit',
            channel: 'commit',
            messageHeadline: 'Merge main',
            messageBody: '# Conflicts:\n*   src/__init__.py',
          }),
        ])}
      />,
    );
    const text = document.querySelector('.pr-activity-text') as HTMLElement;
    expect(text).toHaveClass('pr-activity-plain');
    expect(text.querySelector('h1, ul, strong')).toBeNull();
    expect(text.textContent).toBe('# Conflicts:\n*   src/__init__.py');
  });

  test('what\'s expanded stays with its event when a filter changes the events around it', async () => {
    const user = userEvent.setup();
    const commit = (sha: string, at: string) => event(sha, at, { type: 'commit', channel: 'commit', messageHeadline: `Commit ${sha}` });
    render(
      <Harness
        pr={basePr([
          event('c', '2026-10-24T16:00:00Z', { body: 'A comment' }),
          commit('k2', '2026-10-24T15:00:00Z'),
          commit('k1', '2026-10-24T14:00:00Z'),
          event('c0', '2026-10-24T13:00:00Z', { body: 'Another comment' }),
        ])}
      />,
    );
    await user.click(screen.getByRole('button', { name: /pushed 2 commits/ }));
    expect(screen.getByText('Commit k2', { exact: false })).toBeInTheDocument();

    // Hiding comments moves the run to the top of the day.
    await user.click(within(screen.getByRole('group', { name: 'Event types' })).getByRole('button', { name: /Comments/ }));
    expect(screen.getByRole('button', { name: /pushed 2 commits/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('an expanded run stays open when a newer commit joins it (it is keyed by its oldest)', async () => {
    const user = userEvent.setup();
    const commit = (sha: string, at: string) => event(sha, at, { type: 'commit', channel: 'commit', messageHeadline: `Commit ${sha}` });
    const older = [commit('k2', '2026-10-24T15:00:00Z'), commit('k1', '2026-10-24T14:00:00Z')];
    const { rerender } = render(<Harness pr={basePr(older)} />);
    await user.click(screen.getByRole('button', { name: /pushed 2 commits/ }));

    // The pane's data updates with a new commit at the top of the run.
    rerender(<Harness pr={basePr([commit('k3', '2026-10-24T16:00:00Z'), ...older])} />);
    expect(screen.getByRole('button', { name: /pushed 3 commits/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('a short comment does not fold', () => {
    render(<Harness pr={basePr([event('c', '2026-10-24T15:00:00Z', { body: 'Short' })])} />);
    expect(document.querySelector('.pr-activity-text')).not.toHaveAttribute('data-folded');
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  test('links each event to GitHub, except a review whose only link is the PR itself', () => {
    render(
      <Harness
        pr={basePr([
          event('c', '2026-10-24T15:00:00Z', { url: 'https://github.com/o/r/pull/7#issuecomment-1' }),
          event('r', '2026-10-24T14:00:00Z', { type: 'review', channel: 'review', url: 'https://github.com/o/r/pull/7' }),
        ])}
      />,
    );
    const [comment, review] = items();
    expect(within(comment as HTMLElement).getByRole('link', { name: 'View on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/o/r/pull/7#issuecomment-1',
    );
    expect(within(review as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
  });

  test('shows each event\'s time, with the full date and time for screen readers', () => {
    render(<Harness pr={basePr([event('c', '2026-10-24T15:05:00Z')])} />);
    const time = document.querySelector('time') as HTMLElement;
    expect(time).toHaveAttribute('dateTime', '2026-10-24T15:05:00Z');
    expect(time).toHaveTextContent('3:05 PM');
    expect(time.getAttribute('data-tip')).toBeTruthy();
  });

  test('keeps the daily summary in a collapsed group below', () => {
    render(<Harness pr={basePr(events, { activityTimeline: [{ date: '2026-10-20', actor: 'alice', type: 'comment', count: 1 }] as never })} />);
    const summary = screen.getByText('Daily summary').closest('details') as HTMLDetailsElement;
    expect(summary.open).toBe(false);
    expect(within(summary).getByRole('table')).toBeInTheDocument();
  });
});
