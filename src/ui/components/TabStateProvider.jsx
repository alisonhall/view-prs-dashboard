import { useCallback, useEffect, useMemo, useState } from 'react';
import { TabStateContext } from '../state/TabStateContext';

/**
 * Phase A, slice 1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * owns which data-tab is active as real React state, while still
 * performing the exact same DOM mutation `pr-data-tabs.helpers.js`'s
 * `activateDataTab` already does (button className/aria-selected, panel
 * `hidden`, the `onTabActivated` catch-up-render hook) - that function
 * stays completely unchanged, this Provider just becomes a second caller
 * of it, same "React decides, but still performs the real DOM write"
 * pattern `AlwaysShowInReviewCheckbox.jsx` already established.
 *
 * Deliberately NOT the mutable-ref-plus-version-tick pattern
 * `AuthorInsightsDraftsProvider.jsx` uses - this state genuinely
 * originates inside this component now (same reasoning
 * `NotesDirtyProvider.jsx`'s own comment gives for why it doesn't need a
 * ref either).
 *
 * `window.activateDataTab` (published by index.page.js, right next to
 * where the real `activateDataTab` instance is created) is a vanilla
 * primitive exposed *for* this Provider to call - not a new entanglement,
 * same category as `window.applyFreshPrPayload`/`window.beginRequestActivity`.
 * `window.setActiveDataTab` (published below) is the reverse direction -
 * lets vanilla-only callers that still need to trigger a tab switch
 * (`navigateToPrInTable`/`navigateToAuthorInsights`, the two
 * `navigateToPrInTableFrom*` bridges) go *through* this Provider instead
 * of calling the vanilla function directly, so the React-rendered buttons'
 * active-state styling never desyncs from the real active tab -
 * `useIsTabPanelVisible`'s MutationObserver (and `pr-render-apply.
 * helpers.js`'s own vanilla `isTabPanelVisible`) are untouched either way,
 * since `window.activateDataTab` still physically sets `panel.hidden`.
 */
export function TabStateProvider({ children }) {
  const [activeDataTab, setActiveDataTabState] = useState('pr-data');

  const setActiveDataTab = useCallback((key) => {
    setActiveDataTabState(key);
    window.activateDataTab?.(key);
  }, []);

  useEffect(() => {
    window.setActiveDataTab = (key) => setActiveDataTab(key);
    return () => {
      delete window.setActiveDataTab;
    };
  }, [setActiveDataTab]);

  const value = useMemo(
    () => ({ activeDataTab, setActiveDataTab }),
    [activeDataTab, setActiveDataTab],
  );

  return <TabStateContext.Provider value={value}>{children}</TabStateContext.Provider>;
}
