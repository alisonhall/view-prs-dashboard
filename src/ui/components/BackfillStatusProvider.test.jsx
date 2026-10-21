/** @jest-environment jsdom */

const React = require('react');
const { render, act } = require('@testing-library/react');
const { BackfillStatusProvider } = require('./BackfillStatusProvider');
const {
  useBackfillStatus,
  useBackfillStatusActions,
  DEFAULT_BACKFILL_BUTTON_STATE,
  DEFAULT_BACKFILL_BADGES,
  DEFAULT_BACKFILL_DETAILS_TEXT,
  DEFAULT_BACKFILL_LOG_TEXT,
} = require('../state/BackfillStatusContext');
const { PrDataProvider } = require('../state/PrDataProvider');
const { usePrData } = require('../state/PrDataContext');
const { createPrBackfillHelpers } = require('../helpers/pr-backfill.helpers.js');

const { getBackfillStatusViewModel } = createPrBackfillHelpers();

// Reads both Contexts (state + stable actions) as one object.
function Probe({ onValue }) {
  onValue({ ...useBackfillStatus(), actions: useBackfillStatusActions() });
  return null;
}

const mountProvider = () => {
  let latest;
  const view = render(
    <BackfillStatusProvider>
      <Probe onValue={(value) => (latest = value)} />
    </BackfillStatusProvider>,
  );
  return { view, read: () => latest };
};

const BRIDGES = [
  'getBackfillTrackingState',
  'setSupportsBackfillLogPolling',
  'setIsBackfillActionPending',
  'updateBackfillStatusFromPayload',
  'setBackfillLogMessage',
  'updateReactBackfillLogText',
  'renderBackfillStatus',
  'updateReactBackfillButtonState',
];

// Window-bridge elimination Phases 3d and 4 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the Backfill tab's button state, badges, details text and log text are
// owned by this Provider, instead of being pushed into AppRoot's local state
// through window.updateReactBackfill* bridges.
describe('BackfillStatusProvider', () => {
  afterEach(() => {
    delete window.renderRequestActivity;
    BRIDGES.forEach((name) => delete window[name]);
  });

  describe('owned state', () => {
    test('given the provider mounts, when read, then every piece of state starts at its default', () => {
      const { read } = mountProvider();

      expect(read().backfillButtonState).toEqual(DEFAULT_BACKFILL_BUTTON_STATE);
      expect(Object.values(read().backfillButtonState).every((disabled) => disabled === false)).toBe(true);
      expect(read().backfillBadges).toEqual(DEFAULT_BACKFILL_BADGES);
      expect(read().backfillDetailsText).toBe(DEFAULT_BACKFILL_DETAILS_TEXT);
      expect(read().backfillLogText).toBe(DEFAULT_BACKFILL_LOG_TEXT);
      expect(read().backfillLogUpdateTick).toBe(0);
      expect(read().isBackfillRunning).toBe(false);
    });

    test('given a status render for a running backfill, when read, then badges, details text and button state are exactly what the view model computes', () => {
      const { read } = mountProvider();
      const backfill = { running: true };
      const expected = getBackfillStatusViewModel({ backfillRaw: backfill, isBackfillActionPending: false });
      // Guard against a vacuous test: the running view model must differ from the defaults.
      expect(expected.buttonState).not.toEqual(DEFAULT_BACKFILL_BUTTON_STATE);
      expect(expected.detailsText).not.toBe(DEFAULT_BACKFILL_DETAILS_TEXT);

      act(() => {
        read().actions.renderBackfillStatus(backfill);
      });

      expect(read().backfillButtonState).toEqual(expected.buttonState);
      expect(read().backfillBadges).toEqual({ badges: expected.badges });
      expect(read().backfillDetailsText).toBe(expected.detailsText);
      expect(read().isBackfillRunning).toBe(true);
    });

    test('given setBackfillButtonState, when called, then the state updates and a falsy value resets to the default', () => {
      const { read } = mountProvider();
      const custom = { startDisabled: true, stopDisabled: false, refreshDisabled: true, refreshLogDisabled: false };

      act(() => read().actions.setBackfillButtonState(custom));
      expect(read().backfillButtonState).toEqual(custom);

      act(() => read().actions.setBackfillButtonState(null));
      expect(read().backfillButtonState).toEqual(DEFAULT_BACKFILL_BUTTON_STATE);
    });

    test('given setBackfillLogMessage is called with identical text twice, when read, then the text is set and the update tick still bumps both times', () => {
      const { read } = mountProvider();

      let returned;
      act(() => {
        returned = read().actions.setBackfillLogMessage('log line');
      });
      expect(returned).toBe(true);
      expect(read().backfillLogText).toBe('log line');
      expect(read().backfillLogUpdateTick).toBe(1);

      // BackfillLogControls' scroll-sync effect keys on the tick, so identical
      // text (polling an unchanged log) must still change it.
      act(() => {
        read().actions.setBackfillLogMessage('log line');
      });
      expect(read().backfillLogText).toBe('log line');
      expect(read().backfillLogUpdateTick).toBe(2);
    });

    test('given updateBackfillStatusFromPayload with announce, when the state key changes, then it renders the status and announces the summary once', () => {
      window.renderRequestActivity = jest.fn();
      let statusMessages = [];
      const { StatusTextContext } = require('../state/StatusTextContext');
      let latest;
      render(
        <StatusTextContext.Provider
          value={{ statusText: '', setStatusText: (message) => statusMessages.push(message) }}
        >
          <BackfillStatusProvider>
            <Probe onValue={(value) => (latest = value)} />
          </BackfillStatusProvider>
        </StatusTextContext.Provider>,
      );

      act(() => {
        latest.actions.updateBackfillStatusFromPayload(
          { backfill: { running: true, summary: 'Backfill running' } },
          { announce: true },
        );
      });
      act(() => {
        // Same state key again: nothing new to announce.
        latest.actions.updateBackfillStatusFromPayload(
          { backfill: { running: true, summary: 'Backfill running' } },
          { announce: true },
        );
      });

      expect(statusMessages).toEqual(['Backfill running']);
      expect(window.renderRequestActivity).toHaveBeenCalledTimes(1);
      expect(latest.isBackfillRunning).toBe(true);
    });
  });

  describe('tracking state', () => {
    test('given setters are called, when getBackfillTrackingState is read through a stale reference, then it still sees the writes immediately', () => {
      const { read } = mountProvider();
      const staleGetter = read().actions.getBackfillTrackingState;

      act(() => {
        read().actions.setSupportsBackfillLogPolling(false);
        read().actions.setIsBackfillActionPending(true);
      });

      // Reads refs, so a function captured before the writes (and before any
      // re-render) is still current - the synchronous semantics the old
      // module lets had.
      expect(staleGetter()).toEqual({
        supportsBackfillLogPolling: false,
        isBackfillRunning: false,
        isBackfillActionPending: true,
      });
    });
  });

  describe('stable actions', () => {
    test('given the provider re-renders many times, when the actions are read, then the object and every function keep one identity', () => {
      const seenActions = new Set();
      const seenFunctions = new Set();
      let latest;
      render(
        <BackfillStatusProvider>
          <Probe
            onValue={(value) => {
              latest = value;
              seenActions.add(value.actions);
              Object.values(value.actions).forEach((fn) => seenFunctions.add(fn));
            }}
          />
        </BackfillStatusProvider>,
      );

      act(() => latest.actions.renderBackfillStatus({ running: true }));
      act(() => latest.actions.setBackfillLogMessage('a'));
      act(() => latest.actions.setBackfillLogMessage('b'));
      act(() => latest.actions.setBackfillButtonState({ ...DEFAULT_BACKFILL_BUTTON_STATE, startDisabled: true }));

      expect(seenActions.size).toBe(1);
      expect(seenFunctions.size).toBe(Object.keys(latest.actions).length);
    });

    test('given no provider at all, when the hooks are used, then the defaults are inert and nothing throws', () => {
      let latest;
      function Capture() {
        latest = { ...useBackfillStatus(), actions: useBackfillStatusActions() };
        return null;
      }
      render(<Capture />);

      expect(latest.backfillLogText).toBe(DEFAULT_BACKFILL_LOG_TEXT);
      expect(() => {
        latest.actions.renderBackfillStatus({ running: true });
        latest.actions.updateBackfillStatusFromPayload({});
        latest.actions.setBackfillLogMessage('x');
        latest.actions.setBackfillButtonState({});
      }).not.toThrow();
      expect(latest.actions.getBackfillTrackingState().isBackfillRunning).toBe(false);
    });
  });

  // Regression: PrDataProvider wraps the whole table tree and reads
  // getBackfillTrackingState for its poll. Had it subscribed to the changing
  // status/log state, every backfill log refresh would re-render every
  // usePrData() consumer (the same trap as the auto-render-blocking state).
  describe('under a real PrDataProvider', () => {
    test('given status renders and log writes, when a usePrData() consumer is mounted, then it does not re-render', () => {
      let renders = 0;
      const Consumer = React.memo(function Consumer() {
        usePrData();
        renders += 1;
        return null;
      });
      let latest;
      render(
        <BackfillStatusProvider>
          <PrDataProvider initialPayload={{}} initialSelectedRepo="">
            <Consumer />
          </PrDataProvider>
          <Probe onValue={(value) => (latest = value)} />
        </BackfillStatusProvider>,
      );
      const baseline = renders;

      act(() => latest.actions.renderBackfillStatus({ running: true }));
      for (let i = 0; i < 10; i += 1) {
        act(() => latest.actions.setBackfillLogMessage(`log ${i}`));
      }

      expect(renders).toBe(baseline);
    });
  });

  // The two real Providers wired together in mountAppRoot()'s order. The
  // other tests here (and PrDataProvider.test.jsx) feed pollBackfillStatus a
  // mocked tracking value; this proves the real chain end to end.
  describe('real BackfillStatusProvider + PrDataProvider wiring', () => {
    test('given a status render reports a running backfill, when PrDataProvider polls, then it reloads status; once it stops, it does not', async () => {
      const loadBackfillStatus = jest.fn().mockResolvedValue({});
      window.loadBackfillStatus = loadBackfillStatus;
      let actions;
      let pollBackfillStatus;
      function Capture() {
        actions = useBackfillStatusActions();
        pollBackfillStatus = usePrData().pollBackfillStatus;
        return null;
      }
      render(
        <BackfillStatusProvider>
          <PrDataProvider initialPayload={{}} initialSelectedRepo="">
            <Capture />
          </PrDataProvider>
        </BackfillStatusProvider>,
      );

      await act(async () => {
        await pollBackfillStatus();
      });
      expect(loadBackfillStatus).not.toHaveBeenCalled();

      act(() => actions.renderBackfillStatus({ running: true }));
      await act(async () => {
        await pollBackfillStatus();
      });
      expect(loadBackfillStatus).toHaveBeenCalledTimes(1);
      expect(loadBackfillStatus).toHaveBeenCalledWith({ announce: true, includeLog: true });

      // A pending backfill action suppresses the poll, read live through the
      // function the first render captured.
      act(() => actions.setIsBackfillActionPending(true));
      await act(async () => {
        await pollBackfillStatus();
      });
      expect(loadBackfillStatus).toHaveBeenCalledTimes(1);

      act(() => actions.setIsBackfillActionPending(false));
      act(() => actions.renderBackfillStatus({ running: false }));
      await act(async () => {
        await pollBackfillStatus();
      });
      expect(loadBackfillStatus).toHaveBeenCalledTimes(1);

      delete window.loadBackfillStatus;
    });
  });

  describe('vanilla bridges (index.page.js has no Context access)', () => {
    test('given the provider mounts, when read, then the bridges exist and the two deleted ones do not', () => {
      mountProvider();

      BRIDGES.forEach((name) => expect(typeof window[name]).toBe('function'));
      // No other caller: AppRoot reads this state from Context now.
      expect(window.updateReactBackfillBadges).toBeUndefined();
      expect(window.updateReactBackfillDetailsText).toBeUndefined();
    });

    test('given index.page.js writes through its bridges, when called, then Context readers see the same state', () => {
      const { read } = mountProvider();
      const custom = { startDisabled: false, stopDisabled: true, refreshDisabled: false, refreshLogDisabled: true };

      act(() => {
        window.updateReactBackfillButtonState(custom);
        window.updateReactBackfillLogText('replayed log');
        window.renderBackfillStatus({ running: true });
      });

      expect(read().backfillLogText).toBe('replayed log');
      expect(read().isBackfillRunning).toBe(true);
      expect(window.getBackfillTrackingState().isBackfillRunning).toBe(true);
    });

    test('given the provider unmounts, when unmounted, then every bridge is removed', () => {
      const { view } = mountProvider();

      BRIDGES.forEach((name) => expect(typeof window[name]).toBe('function'));
      view.unmount();
      BRIDGES.forEach((name) => expect(window[name]).toBeUndefined());
    });
  });
});
