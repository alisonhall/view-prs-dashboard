import { createContext, useContext } from 'react';

/**
 * Which view is showing: the app header's Pull requests / Review stats /
 * Authors tabs. Owned by TabStateProvider; the header's tabs switch it,
 * TabPanelVisibilitySync shows the matching panel, and useIsTabPanelVisible
 * lets content know whether it's on screen. (The management tabs became
 * Settings drawer sections - UI redesign phase 9b.)
 *
 * Default value (unwrapped) is a safe no-op - a tab rendered without a
 * `<TabStateProvider>` ancestor still renders (defaulting to "pr-data"),
 * it just can't actually switch tabs.
 */
export type DataTabKey = 'pr-data' | 'review-stats' | 'author-insights';

export interface TabStateValue {
  activeDataTab: DataTabKey;
  setActiveDataTab: (key: DataTabKey) => void;
}

export const TabStateContext = createContext<TabStateValue>({
  activeDataTab: 'pr-data',
  setActiveDataTab: () => {},
});

export function useTabState(): TabStateValue {
  return useContext(TabStateContext);
}
