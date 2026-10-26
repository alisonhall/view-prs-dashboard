import { createContext, useContext } from 'react';

/**
 * Which tab is active in each of the two tab bars: the views (the app
 * header's Pull requests / Review stats / Authors tabs) and the management
 * tabs (Backfill / Action Log / Actor Names / Export - moving into the
 * Settings drawer, UI redesign phase 9b). Owned by TabStateProvider; the header's tabs and
 * ManagementTabButton switch them,
 * TabPanelVisibilitySync shows the matching panel, and useIsTabPanelVisible
 * lets content know whether it's on screen.
 *
 * Default value (unwrapped) is a safe no-op - a tab rendered without a `<TabStateProvider>` ancestor
 * still renders (defaulting to "pr-data"/"backfill"), it just can't actually
 * switch tabs.
 */
export type DataTabKey = 'pr-data' | 'review-stats' | 'author-insights';

export type ManagementTabKey = 'backfill' | 'action-log' | 'actor-name-cache' | 'export';

export interface TabStateValue {
  activeDataTab: DataTabKey;
  setActiveDataTab: (key: DataTabKey) => void;
  activeManagementTab: ManagementTabKey;
  setActiveManagementTab: (key: ManagementTabKey) => void;
}

export const TabStateContext = createContext<TabStateValue>({
  activeDataTab: 'pr-data',
  setActiveDataTab: () => {},
  activeManagementTab: 'backfill',
  setActiveManagementTab: () => {},
});

export function useTabState(): TabStateValue {
  return useContext(TabStateContext);
}
