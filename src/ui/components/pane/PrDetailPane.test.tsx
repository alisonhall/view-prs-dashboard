/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestActivityContext } from '../../state/RequestActivityContext';
import { NotesDirtyContext } from '../../state/NotesDirtyContext';
import { RepoLabelsContext } from '../../state/RepoLabelsContext';
import type { PrEntry } from '../../types/pr-data.ts';
import { PrDetailPane, type PrDetailPaneProps } from './PrDetailPane';

const baseEntry: PrEntry = {
  prNumber: '7',
  repo: 'owner/repo',
  section: 'open',
  data: {
    number: '7',
    title: 'Fix the parser',
    url: 'https://github.com/owner/repo/pull/7',
    authorLogin: 'octocat',
    author: 'The Octocat',
    sourceBranch: 'fix/parser',
    targetBranch: 'main',
  },
};

const Providers = ({ children, dirty = [] as string[] }: { children: ReactNode; dirty?: string[] }) => (
  <RequestActivityContext.Provider value={{ beginRequestActivity: () => () => {} } as never}>
    <RepoLabelsContext.Provider value={{ labels: [{ name: 'bug' }, { name: 'docs' }], refresh: () => {} }}>
      <NotesDirtyContext.Provider value={{ dirtyPrNumbers: dirty, setNotesDirty: () => {} }}>{children}</NotesDirtyContext.Provider>
    </RepoLabelsContext.Provider>
  </RequestActivityContext.Provider>
);

const paneProps = (props: Partial<PrDetailPaneProps> = {}): PrDetailPaneProps => ({
  entry: baseEntry,
  repo: 'owner/repo',
  mode: 'docked',
  actorsMap: {},
  isFlagged: false,
  isInReview: false,
  isAcknowledged: false,
  tab: 'overview',
  onClose: jest.fn(),
  onTabChange: jest.fn(),
  ...props,
});

const renderPane = (props: Partial<PrDetailPaneProps> = {}, { dirty = [] as string[] } = {}) => {
  const handlers = {
    onClose: jest.fn(),
    onTabChange: jest.fn(),
    onCheckboxChange: jest.fn(),
    onAckAction: jest.fn(),
    onApplyLabel: jest.fn(),
    onUpdatePr: jest.fn(),
    onViewJson: jest.fn(),
  };
  const view = render(
    <Providers dirty={dirty}>
      <PrDetailPane
        entry={baseEntry}
        repo="owner/repo"
        mode="docked"
        actorsMap={{}}
        isFlagged={false}
        isInReview={false}
        isAcknowledged={false}
        tab="overview"
        {...handlers}
        {...props}
      />
    </Providers>,
  );
  return { ...handlers, ...props, view };
};

describe('PrDetailPane', () => {
  describe('docked', () => {
    test('with no PR, shows how to pick one', () => {
      renderPane({ entry: null });
      const pane = screen.getByRole('complementary', { name: 'PR details' });
      expect(pane).toHaveTextContent('No PR selected');
      expect(pane).toHaveTextContent('Click a PR in the table, or use ↑/↓ there');
    });

    test('names itself by the PR alone (not the heading\'s link text), with its GitHub link, author and branch', () => {
      renderPane();
      const pane = screen.getByRole('complementary', { name: 'PR #7: Fix the parser' });
      expect(within(pane).getByRole('heading', { level: 2 })).toHaveTextContent('Fix the parser');
      expect(within(pane).getByRole('link', { name: /#7/ })).toHaveAttribute('href', 'https://github.com/owner/repo/pull/7');
      expect(pane).toHaveTextContent('by The Octocat');
      expect(pane).toHaveTextContent('fix/parser → main');
      expect(within(pane).getByRole('button', { name: 'Copy branch name' })).toBeEnabled();
    });

    test('previous/next are disabled without a neighbour and call back with one', async () => {
      const user = userEvent.setup();
      const onNext = jest.fn();
      renderPane({ onNext });
      expect(screen.getByRole('button', { name: 'Previous PR' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Next PR' }));
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    test('Esc and the close button close it, but not Esc while typing', async () => {
      const user = userEvent.setup();
      const { onClose } = renderPane({ tab: 'notes' });
      await user.click(screen.getByRole('button', { name: /^(Edit|Add) other notes$/ }));
      fireEvent.keyDown(screen.getByPlaceholderText('Other notes...'), { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.keyDown(screen.getByRole('tabpanel'), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'Close details' }));
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    describe('copy branch name button', () => {
      // defineProperty: user-event installs navigator.clipboard as a getter.
      const setClipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
      beforeEach(() => {
        setClipboard({ writeText: jest.fn().mockResolvedValue(undefined) });
      });

      test('copies the source branch', async () => {
        renderPane();
        fireEvent.click(screen.getByRole('button', { name: 'Copy branch name' }));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('fix/parser');
        expect(await screen.findByRole('button', { name: 'Copied!' })).toHaveClass('is-copied');
      });

      test('says so when the clipboard is unavailable', async () => {
        setClipboard(undefined);
        renderPane();
        fireEvent.click(screen.getByRole('button', { name: 'Copy branch name' }));
        expect(await screen.findByRole('button', { name: 'Copy unavailable' })).toBeInTheDocument();
      });

      test('is left out when the PR has no source branch', () => {
        renderPane({ entry: { ...baseEntry, data: { ...baseEntry.data, sourceBranch: '' } } });
        expect(screen.queryByRole('button', { name: 'Copy branch name' })).not.toBeInTheDocument();
      });
    });
  });

  describe('actions', () => {
    test('call the row handlers for this PR, with toggles showing their state', async () => {
      const user = userEvent.setup();
      const handlers = renderPane({ isInReview: true, isAcknowledged: true });
      const ref = { prNumber: '7', repo: 'owner/repo' };

      await user.click(screen.getByRole('button', { name: 'Update' }));
      expect(handlers.onUpdatePr).toHaveBeenCalledWith('7', ref, baseEntry.data);

      const ack = screen.getByRole('button', { name: "Ack'd" });
      expect(ack).toHaveAttribute('aria-pressed', 'true');
      await user.click(ack);
      expect(handlers.onAckAction).toHaveBeenCalledWith('7', true, 'owner/repo');

      await user.click(screen.getByRole('button', { name: 'In review' }));
      expect(handlers.onCheckboxChange).toHaveBeenCalledWith('7', 'inReview', false, 'owner/repo');
      await user.click(screen.getByRole('button', { name: 'Flagged' }));
      expect(handlers.onCheckboxChange).toHaveBeenCalledWith('7', 'flagged', true, 'owner/repo');

      await user.click(screen.getByRole('button', { name: 'View PR JSON details' }));
      expect(handlers.onViewJson).toHaveBeenCalledWith(ref, baseEntry.data);

      await user.click(screen.getByRole('button', { name: 'Add label' }));
      await user.click(screen.getByRole('menuitem', { name: 'docs' }));
      expect(handlers.onApplyLabel).toHaveBeenCalledWith('7', 'docs', 'owner/repo');
    });
  });

  describe('switching PRs', () => {
    const entryWithNotes = (number: string, otherNotes: string): PrEntry => ({
      ...baseEntry,
      prNumber: number,
      data: { ...baseEntry.data, number, title: `PR ${number}` },
      notes: { otherNotes },
    });

    test('the Notes tab shows the new PR\'s notes, not the previous PR\'s edits', () => {
      const { rerender } = render(
        <Providers>
          <PrDetailPane {...paneProps({ tab: 'notes', entry: entryWithNotes('7', 'Notes for 7') })} />
        </Providers>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit other notes' }));
      fireEvent.change(screen.getByPlaceholderText('Other notes...'), { target: { value: 'An unsaved edit on 7' } });

      rerender(
        <Providers>
          <PrDetailPane {...paneProps({ tab: 'notes', entry: entryWithNotes('8', 'Notes for 8') })} />
        </Providers>,
      );
      const notes = screen.getByRole('group', { name: 'Notes for PR #8' });
      expect(within(notes).getByRole('group', { name: 'Other notes' })).toHaveTextContent('Notes for 8');
      expect(within(notes).queryByRole('textbox')).not.toBeInTheDocument();
    });

    test('an unsaved Notes edit survives switching to another tab and back', () => {
      const { rerender } = render(
        <Providers>
          <PrDetailPane {...paneProps({ tab: 'notes', entry: entryWithNotes('7', 'Notes for 7') })} />
        </Providers>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit other notes' }));
      fireEvent.change(screen.getByPlaceholderText('Other notes...'), { target: { value: 'An unsaved edit' } });
      for (const tab of ['overview', 'notes'] as const) {
        rerender(
          <Providers>
            <PrDetailPane {...paneProps({ tab, entry: entryWithNotes('7', 'Notes for 7') })} />
          </Providers>,
        );
      }
      expect(screen.getByRole('textbox', { name: 'Other notes' })).toHaveValue('An unsaved edit');
    });

    test('the Conversations tab starts from the new PR\'s own filter, not the previous PR\'s', async () => {
      const user = userEvent.setup();
      const withThread = (number: string): PrEntry => ({
        ...baseEntry,
        prNumber: number,
        data: {
          ...baseEntry.data,
          number,
          url: `https://github.com/owner/repo/pull/${number}`,
          reviewThreads: [{ id: `t${number}`, isResolved: false, comments: [{ createdAt: '2026-01-01T00:00:00Z', body: 'Hm?' }] }],
        },
      });
      const { rerender } = render(
        <Providers>
          <PrDetailPane {...paneProps({ tab: 'conversations', entry: withThread('7') })} />
        </Providers>,
      );
      await user.click(screen.getByRole('button', { name: /^All/ }));
      expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');

      rerender(
        <Providers>
          <PrDetailPane {...paneProps({ tab: 'conversations', entry: withThread('8') })} />
        </Providers>,
      );
      // The default (Unresolved), as for any PR looked at for the first time.
      expect(screen.getByRole('button', { name: /^Unresolved/ })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Activity tab', () => {
    const withEvents = (number: string, baseline = ''): PrEntry => ({
      ...baseEntry,
      prNumber: number,
      data: {
        ...baseEntry.data,
        number,
        baseline,
        activityEvents: [
          { sourceId: 'n', occurredAt: '2026-01-05T00:00:00Z', actor: 'bob', type: 'comment', channel: 'top-level' },
          { sourceId: 'o', occurredAt: '2026-01-02T00:00:00Z', actor: 'bob', type: 'comment', channel: 'top-level' },
        ],
      },
    });

    test('"Since I last looked" goes from the later of your last activity and your last Ack', () => {
      const { view } = renderPane({ tab: 'activity', entry: withEvents('7', '2026-01-01T00:00:00Z'), ackedAt: '2026-01-03T00:00:00Z' });
      const scope = within(view.container).getByRole('group', { name: 'Scope' });
      // Only the event after the Ack (Jan 3), not both after the last activity (Jan 1).
      expect(within(scope).getByRole('button', { name: /Since I last looked/ })).toHaveTextContent('1');
    });

    test('its filters stay as picked for the next PR', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <Providers>
          <PrDetailPane {...paneProps({ tab: 'activity', entry: withEvents('7') })} />
        </Providers>,
      );
      await user.click(screen.getByRole('button', { name: /Comments/ }));
      expect(screen.getByRole('button', { name: /Comments/ })).toHaveAttribute('aria-pressed', 'false');

      rerender(
        <Providers>
          <PrDetailPane {...paneProps({ tab: 'activity', entry: withEvents('8') })} />
        </Providers>,
      );
      expect(screen.getByRole('tablist', { name: 'PR #8 details' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Comments/ })).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('tabs', () => {
    test('Activity counts every event, not just the feed\'s first 60', () => {
      const activityEvents = Array.from({ length: 75 }, (_, index) => ({
        sourceId: `e${index}`,
        occurredAt: new Date(Date.UTC(2026, 0, 1, 10, index)).toISOString(),
        actor: 'alice',
        type: 'commit',
        channel: 'commit',
      }));
      renderPane({ entry: { ...baseEntry, data: { ...baseEntry.data, activityEvents } } });
      expect(screen.getByRole('tab', { name: /^Activity/ })).toHaveTextContent('Activity75');
    });

    test('Conversations says "with you" when the count is the viewer\'s', () => {
      renderPane({
        entry: {
          ...baseEntry,
          data: {
            ...baseEntry.data,
            viewerLogin: 'me',
            reviewThreads: [
              { id: 'a', isResolved: false, participants: ['me'], comments: [{ authorLogin: 'me', createdAt: '2026-01-01T00:00:00Z' }] },
              { id: 'b', isResolved: false, participants: ['other'], comments: [{ authorLogin: 'other', createdAt: '2026-01-01T00:00:00Z' }] },
            ],
          },
        },
      });
      expect(screen.getByRole('tab', { name: /^Conversations/ })).toHaveTextContent(/^Conversations\d+ with you$/);
    });

    test('show the open conversation count and an unsaved marker on Notes', () => {
      renderPane(
        {
          entry: {
            ...baseEntry,
            // The same count as the row's Review cell.
            data: { ...baseEntry.data, openConversationCount: '2' },
          },
        },
        { dirty: ['7'] },
      );
      const tabs = screen.getByRole('tablist', { name: 'PR #7 details' });
      expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Overview',
        'Activity',
        'Conversations2 open',
        'Notesunsaved',
      ]);
    });

    test('picking a tab reports it, and the selected tab shows its content', async () => {
      const user = userEvent.setup();
      const { onTabChange } = renderPane({ tab: 'notes' });
      expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('group', { name: 'Notes for PR #7' })).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Overview' }));
      expect(onTabChange).toHaveBeenCalledWith('overview');
    });

    test('a remembered tab this PR does not have (Custom insights) falls back to Overview', () => {
      renderPane({ tab: 'custom' });
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('group', { name: 'Review' })).toBeInTheDocument();
    });

    test('Conversations says so when there are none', () => {
      renderPane({ tab: 'conversations' });
      expect(screen.getByRole('tabpanel')).toHaveTextContent('No conversations');
    });

    describe('Activity: the timeline stops at a closed PR\'s close date', () => {
      // Regression coverage carried over from PrInsightsRow: isOpen used to
      // check only mergedAt, so a PR closed without merging kept generating
      // "No activity" rows up to today.
      const activityTimeline = [{ date: '2026-01-05', actor: 'alice', type: 'comment', count: 1 }] as never;

      test('given a PR closed without merging, then the timeline ends at its last activity', () => {
        renderPane({
          tab: 'activity',
          entry: { ...baseEntry, data: { ...baseEntry.data, closedAt: '2026-01-06T00:00:00Z', mergedAt: '', activityTimeline } },
        });
        const table = screen.getByRole('tabpanel').querySelector('table') as HTMLTableElement;
        expect(table.querySelectorAll('tr')).toHaveLength(1);
        expect(screen.queryByText(/No activity/)).not.toBeInTheDocument();
      });

      test('given a PR still open, then the timeline runs to today', () => {
        renderPane({ tab: 'activity', entry: { ...baseEntry, data: { ...baseEntry.data, activityTimeline } } });
        const table = screen.getByRole('tabpanel').querySelector('table') as HTMLTableElement;
        expect(table.querySelectorAll('tr').length).toBeGreaterThan(1);
        expect(within(table).getAllByText(/No activity/).length).toBeGreaterThan(0);
      });
    });
  });

  describe('drawer', () => {
    test('is a modal dialog with a backdrop; the backdrop and Esc close it', async () => {
      const user = userEvent.setup();
      const { onClose } = renderPane({ mode: 'drawer' });
      const dialog = screen.getByRole('dialog', { name: /Fix the parser/ });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      // Focus moves to the dialog itself (no button tooltip to take the Esc).
      expect(document.activeElement).toBe(dialog);

      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      await user.click(document.querySelector('.pr-pane-backdrop') as HTMLElement);
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    test('keeps Tab inside it', async () => {
      const user = userEvent.setup();
      renderPane({ mode: 'drawer' });
      const dialog = screen.getByRole('dialog');
      for (let index = 0; index < 30; index += 1) {
        await user.tab();
        expect(dialog.contains(document.activeElement)).toBe(true);
      }
    });

    test('renders nothing with no PR selected', () => {
      renderPane({ mode: 'drawer', entry: null });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });
  });
});
