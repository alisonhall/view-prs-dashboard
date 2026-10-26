/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { useIsTabPanelVisible, useHasTabPanelBeenVisible } = require('./useIsTabPanelVisible');
const { TabStateContext } = require('./TabStateContext');

function Probe({ panelId, onValue }) {
  const isVisible = useIsTabPanelVisible(panelId);
  onValue(isVisible);
  return null;
}

function StickyProbe({ panelId, onValue }) {
  const hasBeenVisible = useHasTabPanelBeenVisible(panelId);
  onValue(hasBeenVisible);
  return null;
}

// Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 3): both hooks read TabStateContext's activeDataTab instead of
// watching a panel element's `hidden` attribute - seed/change that
// Context value directly, with the hook's real panel ids.
const renderProbe = (Component, props, { activeDataTab = 'pr-data' } = {}) =>
  render(
    <TabStateContext.Provider value={{ activeDataTab }}>
      <Component {...props} />
    </TabStateContext.Provider>,
  );

describe('useIsTabPanelVisible', () => {
  test('given an unrecognized panel id (the old management panels too), when rendering, then it throws', () => {
    const onValue = jest.fn();
    expect(() => renderProbe(Probe, { panelId: 'does-not-exist', onValue })).toThrow(
      /unrecognized panelId/,
    );
    expect(() => renderProbe(Probe, { panelId: 'tab-panel-backfill', onValue })).toThrow(/unrecognized panelId/);
  });

  test('given a data-tab panel matching the active data tab, when rendering, then it reports visible', () => {
    const onValue = jest.fn();
    renderProbe(Probe, { panelId: 'tab-panel-review-stats', onValue }, { activeDataTab: 'review-stats' });

    expect(onValue).toHaveBeenLastCalledWith(true);
  });

  test('given a data-tab panel not matching the active data tab, when rendering, then it reports not visible', () => {
    const onValue = jest.fn();
    renderProbe(Probe, { panelId: 'tab-panel-review-stats', onValue }, { activeDataTab: 'pr-data' });

    expect(onValue).toHaveBeenLastCalledWith(false);
  });

  test('given the active data tab changes after mount, then it reports the updated visibility', async () => {
    const onValue = jest.fn();
    const { rerender } = renderProbe(Probe, { panelId: 'tab-panel-review-stats', onValue }, { activeDataTab: 'pr-data' });
    expect(onValue).toHaveBeenLastCalledWith(false);

    await act(async () => {
      rerender(
        <TabStateContext.Provider value={{ activeDataTab: 'review-stats' }}>
          <Probe panelId="tab-panel-review-stats" onValue={onValue} />
        </TabStateContext.Provider>,
      );
      await Promise.resolve();
    });

    expect(onValue).toHaveBeenLastCalledWith(true);

    await act(async () => {
      rerender(
        <TabStateContext.Provider value={{ activeDataTab: 'pr-data' }}>
          <Probe panelId="tab-panel-review-stats" onValue={onValue} />
        </TabStateContext.Provider>,
      );
      await Promise.resolve();
    });

    expect(onValue).toHaveBeenLastCalledWith(false);
  });
});

describe('useHasTabPanelBeenVisible', () => {
  test('given a panel that starts visible, when rendering, then it reports true immediately', () => {
    const onValue = jest.fn();
    renderProbe(StickyProbe, { panelId: 'tab-panel-author-insights', onValue }, { activeDataTab: 'author-insights' });

    expect(onValue).toHaveBeenLastCalledWith(true);
  });

  test('given a panel that starts hidden, when it is never shown, then it keeps reporting false', () => {
    const onValue = jest.fn();
    renderProbe(StickyProbe, { panelId: 'tab-panel-author-insights', onValue });

    expect(onValue).toHaveBeenLastCalledWith(false);
  });

  test('given a panel that starts hidden, when it becomes visible and then hidden again, then it stays true (sticky, unlike useIsTabPanelVisible)', async () => {
    const onValue = jest.fn();
    const { rerender } = renderProbe(
      StickyProbe,
      { panelId: 'tab-panel-author-insights', onValue },
    );
    expect(onValue).toHaveBeenLastCalledWith(false);

    await act(async () => {
      rerender(
        <TabStateContext.Provider value={{ activeDataTab: 'author-insights' }}>
          <StickyProbe panelId="tab-panel-author-insights" onValue={onValue} />
        </TabStateContext.Provider>,
      );
      await Promise.resolve();
    });
    expect(onValue).toHaveBeenLastCalledWith(true);

    await act(async () => {
      rerender(
        <TabStateContext.Provider value={{ activeDataTab: 'pr-data' }}>
          <StickyProbe panelId="tab-panel-author-insights" onValue={onValue} />
        </TabStateContext.Provider>,
      );
      await Promise.resolve();
    });
    expect(onValue).toHaveBeenLastCalledWith(true); // still true - never flips back
  });
});
