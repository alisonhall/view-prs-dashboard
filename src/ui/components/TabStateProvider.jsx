import { useCallback, useEffect, useMemo, useState } from 'react';
import { TabStateContext } from '../state/TabStateContext';

/**
 * Phase A, slice 1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * owns which data-tab is active as real React state.
 *
 * Deliberately NOT the mutable-ref-plus-version-tick pattern
 * `AuthorInsightsDraftsProvider.jsx` uses - this state genuinely
 * originates inside this component now (same reasoning
 * `NotesDirtyProvider.jsx`'s own comment gives for why it doesn't need a
 * ref either).
 *
 * `window.setActiveDataTab`/`window.setActiveManagementTab` (published
 * below) let vanilla-only callers that still need to trigger a tab switch
 * (`navigateToPrInTable`/`navigateToAuthorInsights`, the two
 * `navigateToPrInTableFrom*` bridges) go *through* this Provider instead
 * of writing to the DOM directly, so the React-rendered buttons'
 * active-state styling never desyncs from the real active tab.
 *
 * Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 3): `useIsTabPanelVisible` (state/) reads this Context's
 * `activeDataTab`/`activeManagementTab` directly instead of watching a
 * panel's `hidden` attribute via `MutationObserver`.
 *
 * Phase H.22 (same cluster): `setActiveDataTab`/`setActiveManagementTab`
 * no longer call `window.activateDataTab`/`window.activateManagementTab`
 * as a side effect - this Provider's own state change is now the only
 * thing anything needs to react to. `components/TabPanelVisibilitySync.jsx`
 * (mounted alongside this Provider in `react-app.jsx`'s `mountAppRoot()`)
 * is the new, sole owner of each panel's `hidden` attribute, reading this
 * same Context reactively instead of being called imperatively.
 * `pr-data-tabs.helpers.js`/`pr-management-tabs.helpers.js` (the 2
 * functions this Provider used to call) are deleted outright - their
 * button `className`/`aria-selected` writes were already fully redundant
 * with `DataTabButton.jsx`/`ManagementTabButton.jsx`'s own Context-derived
 * styling, and their panel-hiding code is what `TabPanelVisibilitySync`
 * now owns instead.
 *
 * Phase A, slice 2: the exact same shape, extended to the other tab bar -
 * one Provider for both bars, not a second near-duplicate one, matching
 * the original roadmap entry's own `{ activeManagementTab, activeDataTab }`
 * shape.
 */
export function TabStateProvider({ children }) {
  const [activeDataTab, setActiveDataTabState] = useState('pr-data');
  const [activeManagementTab, setActiveManagementTabState] = useState('status');

  const setActiveDataTab = useCallback((key) => {
    setActiveDataTabState(key);
  }, []);

  const setActiveManagementTab = useCallback((key) => {
    setActiveManagementTabState(key);
  }, []);

  useEffect(() => {
    window.setActiveDataTab = (key) => setActiveDataTab(key);
    window.setActiveManagementTab = (key) => setActiveManagementTab(key);
    return () => {
      delete window.setActiveDataTab;
      delete window.setActiveManagementTab;
    };
  }, [setActiveDataTab, setActiveManagementTab]);

  const value = useMemo(
    () => ({ activeDataTab, setActiveDataTab, activeManagementTab, setActiveManagementTab }),
    [activeDataTab, setActiveDataTab, activeManagementTab, setActiveManagementTab],
  );

  return <TabStateContext.Provider value={value}>{children}</TabStateContext.Provider>;
}
