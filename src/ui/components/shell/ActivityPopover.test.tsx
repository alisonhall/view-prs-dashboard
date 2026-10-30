/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobEventsContext, type JobEventsValue } from '../../state/JobEventsContext';
import { BackfillStatusContext, DEFAULT_BACKFILL_BUTTON_STATE, type BackfillStatusValue } from '../../state/BackfillStatusContext';
import { RequestActivityDisplayContext } from '../../state/RequestActivityContext';
import { createPrJobEventsHelpers } from '../../helpers/pr-job-events.helpers.ts';
import { ActivityPopover } from './ActivityPopover';

const { getInitialJobEventsState } = createPrJobEventsHelpers();
const jobEvents = (overrides: Partial<JobEventsValue> = {}): JobEventsValue => ({
  ...getInitialJobEventsState(),
  connection: 'open',
  isStale: false,
  ...overrides,
});
const backfill: BackfillStatusValue = {
  backfillButtonState: DEFAULT_BACKFILL_BUTTON_STATE,
  backfillBadges: { badges: [{ text: 'Backfill: stopped', className: 'scheduler-badge-stopped' }] },
  backfillDetailsText: 'Last run: never',
  backfillLogText: '',
  backfillLogUpdateTick: 0,
  isBackfillRunning: false,
  isBackfillActionPending: false,
  supportsBackfillLogPolling: true,
};

const renderPopover = (events = jobEvents(), extra?: ReactNode) =>
  render(
    <JobEventsContext.Provider value={events}>
      <BackfillStatusContext.Provider value={backfill}>
        <RequestActivityDisplayContext.Provider
          value={{ requestActivityBadges: [{ text: 'No request in progress', className: 'scheduler-badge-idle' }], recentRequestActivity: [] }}
        >
          <ActivityPopover />
          {extra}
        </RequestActivityDisplayContext.Provider>
      </BackfillStatusContext.Provider>
    </JobEventsContext.Provider>,
  );

const button = () => screen.getByRole('button', { name: /^Activity/ });

describe('ActivityPopover', () => {
  test('closed at first; its button names the running jobs when there are any', () => {
    const { rerender } = renderPopover();
    expect(button()).toHaveAccessibleName('Activity');
    expect(button()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const running = jobEvents();
    running.jobs = { ...running.jobs, autoRefresh: { ...running.jobs.autoRefresh, status: 'running' } };
    rerender(
      <JobEventsContext.Provider value={running}>
        <ActivityPopover />
      </JobEventsContext.Provider>,
    );
    expect(button()).toHaveAccessibleName('Activity, 1 running or queued');
    expect(button()).toHaveTextContent('Activity1');
  });

  test('opens as a dialog named Activity, with every section, focused', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(button());

    const dialog = screen.getByRole('dialog', { name: 'Activity' });
    expect(button()).toHaveAttribute('aria-expanded', 'true');
    expect(button()).toHaveAttribute('aria-controls', dialog.id);
    expect(dialog).toHaveTextContent('Scheduled background jobs');
    expect(dialog).toHaveTextContent('Backfill: stopped');
    expect(dialog).toHaveTextContent('Last run: never');
    expect(dialog).toHaveTextContent('No request in progress');
    expect(dialog).toHaveFocus();
  });

  test('Esc closes it and returns focus to the button; so does the close button', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(button());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button()).toHaveFocus();

    await user.click(button());
    await user.click(screen.getByRole('button', { name: 'Close activity' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button()).toHaveFocus();
  });

  test('a click outside closes it; a click inside, or on its button again, acts normally', async () => {
    const user = userEvent.setup();
    renderPopover(jobEvents(), <button type="button">Elsewhere</button>);

    await user.click(button());
    await user.click(screen.getByRole('dialog', { name: 'Activity' }));
    expect(screen.getByRole('dialog', { name: 'Activity' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(button());
    await user.click(button());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('focus moving outside closes it; focus moving inside, or the window losing focus, does not', async () => {
    const user = userEvent.setup();
    renderPopover(jobEvents(), <button type="button">Settings</button>);
    await user.click(button());
    const dialog = screen.getByRole('dialog', { name: 'Activity' });

    // Into its close button, then out of the window: still open.
    act(() => screen.getByRole('button', { name: 'Close activity' }).focus());
    fireEvent.focusOut(screen.getByRole('button', { name: 'Close activity' }), { relatedTarget: null });
    expect(dialog).toBeInTheDocument();

    // Tab on to the next control after it.
    act(() => screen.getByRole('button', { name: 'Settings' }).focus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('the page scrolling closes it; scrolling its own content, or a list elsewhere, does not', async () => {
    const user = userEvent.setup();
    renderPopover(undefined, <div data-testid="list-elsewhere" />);
    await user.click(button());
    const dialog = screen.getByRole('dialog', { name: 'Activity' });

    fireEvent.scroll(dialog.querySelector('.activity-popover-content') as Element);
    fireEvent.scroll(screen.getByTestId('list-elsewhere'));
    expect(dialog).toBeInTheDocument();

    fireEvent.scroll(document);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a container around the button scrolling closes it (the button moves)', async () => {
    const user = userEvent.setup();
    const { container } = renderPopover();
    await user.click(button());

    fireEvent.scroll(container);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('closed, it leaves no listeners behind', async () => {
    const user = userEvent.setup();
    const removeFromWindow = jest.spyOn(window, 'removeEventListener');
    const removeFromDocument = jest.spyOn(document, 'removeEventListener');
    renderPopover();
    await user.click(button());
    await user.keyboard('{Escape}');

    expect(removeFromWindow).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeFromDocument).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeFromDocument).toHaveBeenCalledWith('focusout', expect.any(Function));
    expect(removeFromWindow).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    removeFromWindow.mockRestore();
    removeFromDocument.mockRestore();
  });
});
