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
 * active-state styling never desyncs from the real active tab.
 *
 * Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 3): `useIsTabPanelVisible` (state/) now reads this Context's
 * `activeDataTab`/`activeManagementTab` directly instead of watching a
 * panel's `hidden` attribute via `MutationObserver` - this comment used to
 * say it was untouched "since `window.activateDataTab` still physically
 * sets `panel.hidden`," which is still true of `activateDataTab` itself
 * (unchanged this phase, still the only thing physically writing that
 * attribute), just no longer the mechanism this hook depends on. The
 * `pr-render-apply.helpers.js` reference in that old wording was already
 * stale before this phase - that file's own `isTabPanelVisible` was
 * deleted outright in H.17.
 *
 * Phase A, slice 2: the exact same shape, extended to the other tab bar
 * (`pr-management-tabs.helpers.js`'s `activateTab`/`window.activateManagementTab`/
 * `window.setActiveManagementTab`) - one Provider for both bars, not a
 * second near-duplicate one, matching the original roadmap entry's own
 * `{ activeManagementTab, activeDataTab }` shape. `activateTab` has no
 * external vanilla callers today (unlike `activateDataTab`'s 4), so
 * `window.setActiveManagementTab` is published for symmetry/future-proofing
 * only - nothing calls it yet.
 */
export function TabStateProvider({ children }) {
  const [activeDataTab, setActiveDataTabState] = useState('pr-data');
  const [activeManagementTab, setActiveManagementTabState] = useState('status');

  const setActiveDataTab = useCallback((key) => {
    setActiveDataTabState(key);
    window.activateDataTab?.(key);
  }, []);

  const setActiveManagementTab = useCallback((key) => {
    setActiveManagementTabState(key);
    window.activateManagementTab?.(key);
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
