/** @jest-environment jsdom */

const { act, render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const mockActions = {
  handleBackfillAction: jest.fn(),
  refreshBackfillStatus: jest.fn(),
  refreshBackfillLogTail: jest.fn(),
  triggerBackfillTabLoad: jest.fn(),
};
jest.mock('../../state/useBackfillActions', () => ({ useBackfillActions: () => mockActions }));

const { BackfillSection } = require('./BackfillSection');
const { BackfillStatusContext, DEFAULT_BACKFILL_BUTTON_STATE } = require('../../state/BackfillStatusContext');
const { SettingsDrawerContext } = require('../../state/SettingsDrawerContext');

const status = (overrides = {}) => ({
  backfillButtonState: DEFAULT_BACKFILL_BUTTON_STATE,
  backfillBadges: { badges: [{ text: 'Backfill: stopped', className: 'scheduler-badge-stopped' }] },
  backfillDetailsText: 'Last run: never',
  backfillLogText: 'log line',
  backfillLogUpdateTick: 0,
  isBackfillRunning: false,
  isBackfillActionPending: false,
  supportsBackfillLogPolling: true,
  ...overrides,
});
const drawer = (isOpen, section) => ({ isOpen, section, open: () => {}, close: () => {}, setSection: () => {} });
const tree = ({ statusValue = status(), drawerValue = drawer(false, 'run') } = {}) => (
  <SettingsDrawerContext.Provider value={drawerValue}>
    <BackfillStatusContext.Provider value={statusValue}>
      <BackfillSection />
    </BackfillStatusContext.Provider>
  </SettingsDrawerContext.Provider>
);

beforeEach(() => {
  Object.values(mockActions).forEach((fn) => fn.mockClear());
});

describe('BackfillSection', () => {
  test('it shows the status badges, details and log from BackfillStatusContext', () => {
    render(tree());

    expect(screen.getByRole('group', { name: 'Backfill status badges' })).toHaveTextContent('Backfill: stopped');
    expect(screen.getByRole('region', { name: 'Backfill status details' })).toHaveTextContent('Last run: never');
    expect(screen.getByRole('region', { name: 'Backfill log', hidden: true })).toHaveTextContent('log line');
  });

  test('its buttons call the backfill actions, and follow the button state', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree());

    await user.click(screen.getByRole('button', { name: 'Start backfill' }));
    await user.click(screen.getByRole('button', { name: 'Stop backfill' }));
    await user.click(screen.getByRole('button', { name: 'Refresh status' }));
    expect(mockActions.handleBackfillAction.mock.calls).toEqual([['start'], ['stop']]);
    expect(mockActions.refreshBackfillStatus).toHaveBeenCalledTimes(1);

    rerender(tree({ statusValue: status({ backfillButtonState: { ...DEFAULT_BACKFILL_BUTTON_STATE, startDisabled: true, refreshDisabled: true } }) }));
    expect(screen.getByRole('button', { name: 'Start backfill' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop backfill' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled();
  });

  test('it loads at mount, while the drawer is closed, and again when the section is opened', async () => {
    const { rerender } = render(tree());
    expect(mockActions.triggerBackfillTabLoad).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(tree({ drawerValue: drawer(true, 'backfill') }));
    });
    expect(mockActions.triggerBackfillTabLoad).toHaveBeenCalledTimes(2);
  });
});
