/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { BackfillStatusProvider } = require('./BackfillStatusProvider');
const { useBackfillStatus, DEFAULT_BACKFILL_BUTTON_STATE } = require('../state/BackfillStatusContext');
const { createPrBackfillHelpers } = require('../helpers/pr-backfill.helpers.js');

const { getBackfillStatusViewModel } = createPrBackfillHelpers();

function Probe({ onValue }) {
  onValue(useBackfillStatus());
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

// Window-bridge elimination Phase 3d (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the Backfill tab's button-disabled state is owned by this Provider, instead
// of being pushed into AppRoot's local state via
// window.updateReactBackfillButtonState.
describe('BackfillStatusProvider backfillButtonState', () => {
  afterEach(() => {
    delete window.updateReactBackfillBadges;
    delete window.updateReactBackfillDetailsText;
  });

  test('given the provider mounts, when read, then the buttons start in the all-enabled default', () => {
    const { read } = mountProvider();

    expect(read().backfillButtonState).toEqual(DEFAULT_BACKFILL_BUTTON_STATE);
    expect(Object.values(read().backfillButtonState).every((disabled) => disabled === false)).toBe(true);
  });

  test('given a status render for a running backfill, when read, then the Context button state is exactly what the view model computes', () => {
    const { read } = mountProvider();
    const backfill = { running: true };
    const expected = getBackfillStatusViewModel({ backfillRaw: backfill, isBackfillActionPending: false }).buttonState;
    // Guard against a vacuous test: the running view model must differ from the default.
    expect(expected).not.toEqual(DEFAULT_BACKFILL_BUTTON_STATE);

    act(() => {
      window.renderBackfillStatus(backfill);
    });

    expect(read().backfillButtonState).toEqual(expected);
    expect(read().isBackfillRunning).toBe(true);
  });

  test('given a descendant calls setBackfillButtonState, when read, then the state updates and a falsy value resets to the default', () => {
    const { read } = mountProvider();
    const custom = { startDisabled: true, stopDisabled: false, refreshDisabled: true, refreshLogDisabled: false };

    act(() => read().setBackfillButtonState(custom));
    expect(read().backfillButtonState).toEqual(custom);

    act(() => read().setBackfillButtonState(null));
    expect(read().backfillButtonState).toEqual(DEFAULT_BACKFILL_BUTTON_STATE);
  });

  test('given index.page.js (vanilla) writes through window.updateReactBackfillButtonState, when called, then Context readers see it', () => {
    const { read } = mountProvider();
    const custom = { startDisabled: false, stopDisabled: true, refreshDisabled: false, refreshLogDisabled: true };

    act(() => {
      window.updateReactBackfillButtonState(custom);
    });

    expect(read().backfillButtonState).toEqual(custom);
  });

  test('given the setter, when the provider re-renders, then it keeps one identity (safe in hook deps)', () => {
    const seen = new Set();
    let latest;
    render(
      <BackfillStatusProvider>
        <Probe
          onValue={(value) => {
            latest = value;
            seen.add(value.setBackfillButtonState);
          }}
        />
      </BackfillStatusProvider>,
    );

    act(() => latest.setBackfillButtonState({ ...DEFAULT_BACKFILL_BUTTON_STATE, startDisabled: true }));
    act(() => latest.setBackfillButtonState({ ...DEFAULT_BACKFILL_BUTTON_STATE, stopDisabled: true }));

    expect(seen.size).toBe(1);
  });

  test('given the provider unmounts, when unmounted, then the button-state bridge is removed', () => {
    const { view } = mountProvider();

    expect(typeof window.updateReactBackfillButtonState).toBe('function');
    view.unmount();
    expect(window.updateReactBackfillButtonState).toBeUndefined();
  });
});
