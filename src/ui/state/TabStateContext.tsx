import { createContext, useContext } from 'react';

/**
 * Which tab is active in each of the two tab bars: the data tabs (PR Data /
 * Review Stats / Author Insights) and the management tabs (Activity / Run &
 * Filter / Backfill / Action Log / Actor Names / Export). Owned by
 * TabStateProvider; DataTabButton/ManagementTabButton switch tabs,
 * TabPanelVisibilitySync shows the matching panel, and useIsTabPanelVisible
 * lets content know whether it's on screen.
 *
 * Default value (unwrapped) is a safe no-op - a `<DataTabButton>`/
 * `<ManagementTabButton>` rendered without a `<TabStateProvider>` ancestor
 * still renders (defaulting to "pr-data"/"status"), it just can't actually
 * switch tabs.
 */
export type DataTabKey = 'pr-data' | 'review-stats' | 'author-insights';

// "status" is the tab labelled "Activity".
export type ManagementTabKey = 'status' | 'script' | 'backfill' | 'action-log' | 'actor-name-cache' | 'export';

export interface TabStateValue {
  activeDataTab: DataTabKey;
  setActiveDataTab: (key: DataTabKey) => void;
  activeManagementTab: ManagementTabKey;
  setActiveManagementTab: (key: ManagementTabKey) => void;
}

export const TabStateContext = createContext<TabStateValue>({
  activeDataTab: 'pr-data',
  setActiveDataTab: () => {},
  activeManagementTab: 'status',
  setActiveManagementTab: () => {},
});

export function useTabState(): TabStateValue {
  return useContext(TabStateContext);
}
