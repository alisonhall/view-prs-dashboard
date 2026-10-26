import { useEffect, useState } from 'react';
import { useTabState, type DataTabKey, type ManagementTabKey } from './TabStateContext';

// Maps each tab panel's DOM id to the TabStateContext key that controls it -
// every tab panel in index.html.
const DATA_TAB_PANEL_IDS = {
  'tab-panel-pr-data': 'pr-data',
  'tab-panel-review-stats': 'review-stats',
  'tab-panel-author-insights': 'author-insights',
} as const satisfies Record<string, DataTabKey>;
const MANAGEMENT_TAB_PANEL_IDS = {
  'tab-panel-backfill': 'backfill',
  'tab-panel-action-log': 'action-log',
  'tab-panel-actor-name-cache': 'actor-name-cache',
  'tab-panel-export': 'export',
} as const satisfies Record<string, ManagementTabKey>;

export type TabPanelId = keyof typeof DATA_TAB_PANEL_IDS | keyof typeof MANAGEMENT_TAB_PANEL_IDS;

/**
 * Whether the tab panel with this DOM id is the active one in its tab bar,
 * read from TabStateContext. Throws for an id that isn't a tab panel.
 */
export function useIsTabPanelVisible(panelId: TabPanelId): boolean {
  const { activeDataTab, activeManagementTab } = useTabState();
  const dataTabKey = (DATA_TAB_PANEL_IDS as Record<string, DataTabKey | undefined>)[panelId];
  if (dataTabKey) {
    return activeDataTab === dataTabKey;
  }
  const managementTabKey = (MANAGEMENT_TAB_PANEL_IDS as Record<string, ManagementTabKey | undefined>)[panelId];
  if (managementTabKey) {
    return activeManagementTab === managementTabKey;
  }
  throw new Error(`useIsTabPanelVisible: unrecognized panelId "${panelId}"`);
}

/**
 * "Has this tab ever been made visible" - true once `useIsTabPanelVisible`
 * reports visible for the first time, and (deliberately, unlike that hook)
 * never flips back to false afterward. Built for code-splitting a
 * not-yet-visited tab's contents out of the initial bundle via
 * `React.lazy()` - gating on plain `isVisible` instead would unmount/remount
 * that tab's components on every switch away and back, and several of them
 * (e.g. ReviewStatsControls, ExportTab) hold local-only UI state (selected
 * sort/filter, checked export fields) that remounting would silently reset.
 * Staying mounted forever after the first visit avoids that while still
 * deferring the chunk's fetch/parse cost until it's actually needed.
 */
export function useHasTabPanelBeenVisible(panelId: TabPanelId): boolean {
  const isVisible = useIsTabPanelVisible(panelId);
  const [hasBeenVisible, setHasBeenVisible] = useState(isVisible);
  useEffect(() => {
    if (isVisible) {
      setHasBeenVisible(true);
    }
  }, [isVisible]);
  return hasBeenVisible;
}
