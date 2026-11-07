import { createContext, useContext } from 'react';

/**
 * Which view is showing: the app header's Pull requests / Review stats /
 * Authors tabs. Owned by TabStateProvider; the header's tabs switch it,
 * AppShell shows the matching panel, and useIsTabPanelVisible lets content
 * know whether it's on screen. (The management tabs became
 * Settings drawer sections - UI redesign phase 9b.) It also keeps where
 * "View in table" was used from, for the table's Back button
 * (ReturnToViewBanner).
 *
 * Default value (unwrapped) is a safe no-op - a tab rendered without a
 * `<TabStateProvider>` ancestor still renders (defaulting to "pr-data"),
 * it just can't actually switch tabs.
 */
export type DataTabKey = 'pr-data' | 'review-stats' | 'author-insights';

// The view's name, as its tab says it.
export const DATA_TAB_LABELS: Record<DataTabKey, string> = {
  'pr-data': 'Pull requests',
  'review-stats': 'Review stats',
  'author-insights': 'Authors',
};

// Where "View in table" was clicked from, for the table's Back button: the
// view, how far the page was scrolled, and the button to focus again.
export interface ReturnTarget {
  tab: DataTabKey;
  scrollY: number;
  focusTarget: HTMLElement | null;
  prNumber: string;
}

export interface TabStateValue {
  activeDataTab: DataTabKey;
  // Showing a view other than the table forgets the return target.
  setActiveDataTab: (key: DataTabKey) => void;
  returnTarget: ReturnTarget | null;
  rememberReturnTarget: (target: ReturnTarget) => void;
  forgetReturnTarget: () => void;
  // Back to the return target's view, scrolled and focused as it was.
  returnToPreviousView: () => void;
}

export const TabStateContext = createContext<TabStateValue>({
  activeDataTab: 'pr-data',
  setActiveDataTab: () => {},
  returnTarget: null,
  rememberReturnTarget: () => {},
  forgetReturnTarget: () => {},
  returnToPreviousView: () => {},
});

export function useTabState(): TabStateValue {
  return useContext(TabStateContext);
}
