import { createContext, useContext } from 'react';

/**
 * Phase A, slice 1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * which data-tab (PR Data / Review Stats / Author Insights) is currently
 * active. Previously pure vanilla DOM state (`pr-data-tabs.helpers.js`'s
 * `activateDataTab` directly mutating `className`/`aria-selected`/`hidden`)
 * with no React-visible source of truth at all - any React-rendered tab
 * button had no way to know which tab was really active except by reading
 * the DOM back out.
 *
 * Phase A, slice 2: extended with `activeManagementTab`/`setActiveManagementTab`
 * for the other tab bar (Activity/Run & Filter/Backfill/Action Log/Actor
 * Names/Export) - one shared Context for both bars, matching the original
 * roadmap entry's own `{ activeManagementTab, activeDataTab }` shape,
 * rather than a second near-duplicate Provider.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this migration - a `<DataTabButton>`/`<ManagementTabButton>` rendered
 * without a `<TabStateProvider>` ancestor still renders (defaulting to
 * "pr-data"/"status"), it just can't actually switch tabs.
 */
export const TabStateContext = createContext({
  activeDataTab: 'pr-data',
  setActiveDataTab: () => {},
  activeManagementTab: 'status',
  setActiveManagementTab: () => {},
});

export function useTabState() {
  return useContext(TabStateContext);
}
