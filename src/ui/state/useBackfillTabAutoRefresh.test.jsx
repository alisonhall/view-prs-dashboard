/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useBackfillTabAutoRefresh } = require('./useBackfillTabAutoRefresh.jsx');
const { TabStateContext } = require('./TabStateContext.tsx');

function Probe({ triggerBackfillTabLoad }) {
  useBackfillTabAutoRefresh(triggerBackfillTabLoad);
  return null;
}

// Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 3): useIsTabPanelVisible() (what useBackfillTabAutoRefresh calls
// under the hood) now reads TabStateContext's activeManagementTab instead
// of a panel element's `hidden` DOM attribute - seed/change that Context
// value directly instead of creating a #tab-panel-backfill element and
// flipping its `hidden` property.
const renderProbe = (triggerBackfillTabLoad, activeManagementTab) =>
  render(
    <TabStateContext.Provider value={{ activeDataTab: 'pr-data', activeManagementTab }}>
      <Probe triggerBackfillTabLoad={triggerBackfillTabLoad} />
    </TabStateContext.Provider>,
  );

describe('useBackfillTabAutoRefresh', () => {
  test('given the Backfill tab is hidden, when mounted, then it still triggers one eager load', () => {
    const triggerBackfillTabLoad = jest.fn();
    renderProbe(triggerBackfillTabLoad, 'status');

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(1);
  });

  test('given the Backfill tab becomes visible after mount, when its active tab changes, then it triggers another load', async () => {
    const triggerBackfillTabLoad = jest.fn();
    const { rerender } = renderProbe(triggerBackfillTabLoad, 'status');
    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <TabStateContext.Provider value={{ activeDataTab: 'pr-data', activeManagementTab: 'backfill' }}>
          <Probe triggerBackfillTabLoad={triggerBackfillTabLoad} />
        </TabStateContext.Provider>,
      );
      await Promise.resolve();
    });

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(2);
  });

  test('given the Backfill tab becomes hidden again after being visible, when its active tab changes back, then it does not trigger another load', async () => {
    const triggerBackfillTabLoad = jest.fn();
    const { rerender } = renderProbe(triggerBackfillTabLoad, 'status');

    await act(async () => {
      rerender(
        <TabStateContext.Provider value={{ activeDataTab: 'pr-data', activeManagementTab: 'backfill' }}>
          <Probe triggerBackfillTabLoad={triggerBackfillTabLoad} />
        </TabStateContext.Provider>,
      );
      await Promise.resolve();
    });
    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(2);

    await act(async () => {
      rerender(
        <TabStateContext.Provider value={{ activeDataTab: 'pr-data', activeManagementTab: 'status' }}>
          <Probe triggerBackfillTabLoad={triggerBackfillTabLoad} />
        </TabStateContext.Provider>,
      );
      await Promise.resolve();
    });

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(2);
  });

  test('given the Backfill tab is already visible at mount, when mounted, then it triggers exactly one eager load (not two)', () => {
    const triggerBackfillTabLoad = jest.fn();
    renderProbe(triggerBackfillTabLoad, 'backfill');

    expect(triggerBackfillTabLoad).toHaveBeenCalledTimes(1);
  });
});
