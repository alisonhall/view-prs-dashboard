/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useBackfillAutoRefresh } = require('./useBackfillAutoRefresh.ts');
const { SettingsDrawerContext } = require('./SettingsDrawerContext.tsx');

function Probe({ triggerBackfillTabLoad }) {
  useBackfillAutoRefresh(triggerBackfillTabLoad);
  return null;
}

// The Backfill section is on screen while the drawer is open at it.
const tree = (triggerBackfillTabLoad, isOpen, section) => (
  <SettingsDrawerContext.Provider value={{ isOpen, section, open: () => {}, close: () => {}, setSection: () => {} }}>
    <Probe triggerBackfillTabLoad={triggerBackfillTabLoad} />
  </SettingsDrawerContext.Provider>
);

describe('useBackfillAutoRefresh', () => {
  test('given the drawer is closed, when mounted, then it still triggers one eager load', () => {
    const triggerBackfillTabLoad = jest.fn();
    render(tree(triggerBackfillTabLoad, false, 'backfill'));

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(1);
  });

  test('given the drawer opens at Backfill, or switches to it, then it triggers another load each time', async () => {
    const triggerBackfillTabLoad = jest.fn();
    const { rerender } = render(tree(triggerBackfillTabLoad, false, 'backfill'));

    await act(async () => {
      rerender(tree(triggerBackfillTabLoad, true, 'backfill'));
    });
    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(2);

    await act(async () => {
      rerender(tree(triggerBackfillTabLoad, true, 'run'));
    });
    await act(async () => {
      rerender(tree(triggerBackfillTabLoad, true, 'backfill'));
    });
    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(3);
  });

  test('given the section leaves view (closed, or another section), then it does not load', async () => {
    const triggerBackfillTabLoad = jest.fn();
    const { rerender } = render(tree(triggerBackfillTabLoad, true, 'run'));

    await act(async () => {
      rerender(tree(triggerBackfillTabLoad, true, 'attention'));
    });
    await act(async () => {
      rerender(tree(triggerBackfillTabLoad, false, 'attention'));
    });

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(1);
  });

  test('given the drawer is already open at Backfill at mount, when mounted, then it triggers exactly one load (not two)', () => {
    const triggerBackfillTabLoad = jest.fn();
    render(tree(triggerBackfillTabLoad, true, 'backfill'));

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(1);
  });
});
