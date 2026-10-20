import { useEffect, useState } from 'react';
import { useTabState } from './TabStateContext';

// Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 3): maps each tab panel's DOM id to the Context key that
// controls it (TabStateContext's activeDataTab/activeManagementTab) -
// the full, exhaustive set of panel ids that exist in index.html (see
// pr-data-tabs.helpers.js/pr-management-tabs.helpers.js's own panel lists).
const DATA_TAB_PANEL_IDS = {
  'tab-panel-pr-data': 'pr-data',
  'tab-panel-review-stats': 'review-stats',
  'tab-panel-author-insights': 'author-insights',
};
const MANAGEMENT_TAB_PANEL_IDS = {
  'tab-panel-status': 'status',
  'tab-panel-script': 'script',
  'tab-panel-backfill': 'backfill',
  'tab-panel-action-log': 'action-log',
  'tab-panel-actor-name-cache': 'actor-name-cache',
  'tab-panel-export': 'export',
};

/**
 * Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 3): reads TabStateContext directly instead of watching a panel's
 * `hidden` DOM attribute via MutationObserver - this hook's own prior
 * comment ("no Context/React state tracks which tab is active today") was
 * true when written (Deferred-items follow-up, before Phase A's
 * TabStateProvider existed), but has been stale since Phase A: TabStateContext
 * has tracked `activeDataTab`/`activeManagementTab` as real state ever
 * since, this hook just hadn't been pointed at it yet. A safe, isolated
 * precursor to the rest of cluster 3 (which still owns who *writes* each
 * panel's `hidden` attribute) - this hook's own external contract
 * (panelId in, boolean out) is unchanged, so none of its 7 call sites
 * need to change.
 */
export function useIsTabPanelVisible(panelId) {
  const { activeDataTab, activeManagementTab } = useTabState();
  const dataTabKey = DATA_TAB_PANEL_IDS[panelId];
  if (dataTabKey) {
    return activeDataTab === dataTabKey;
  }
  const managementTabKey = MANAGEMENT_TAB_PANEL_IDS[panelId];
  if (managementTabKey) {
    return activeManagementTab === managementTabKey;
  }
  throw new Error(`useIsTabPanelVisible: unrecognized panelId "${panelId}"`);
}

/**
 * Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md): "has this
 * tab ever been made visible" - true once `useIsTabPanelVisible` reports
 * visible for the first time, and (deliberately, unlike that hook) never
 * flips back to false afterward. Built for code-splitting a not-yet-visited
 * tab's contents out of the initial bundle via `React.lazy()` - gating on
 * plain `isVisible` instead would unmount/remount that tab's components on
 * every switch away and back, and several of them (e.g. ReviewStatsControls,
 * ExportTab) hold local-only UI state (selected sort/filter, checked export
 * fields) that isn't backed by a vanilla bridge the way Author Insights'
 * comment drafts are - remounting would silently reset it. Staying mounted
 * forever after the first visit avoids that while still deferring the
 * chunk's fetch/parse cost until it's actually needed.
 */
export function useHasTabPanelBeenVisible(panelId) {
  const isVisible = useIsTabPanelVisible(panelId);
  const [hasBeenVisible, setHasBeenVisible] = useState(isVisible);
  useEffect(() => {
    if (isVisible) {
      setHasBeenVisible(true);
    }
  }, [isVisible]);
  return hasBeenVisible;
}
