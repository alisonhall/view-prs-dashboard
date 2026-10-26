import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { TabStateContext, type DataTabKey } from '../state/TabStateContext';

/**
 * Owns which view is showing, as plain React state (it
 * genuinely originates here, so no ref-plus-version pattern is needed).
 * Panel visibility follows from it: `TabPanelVisibilitySync.jsx` sets each
 * panel's `hidden` attribute from this Context, and `useIsTabPanelVisible`
 * reads it directly.
 */
export function TabStateProvider({ children }: { children?: ReactNode }) {
  const [activeDataTab, setActiveDataTabState] = useState<DataTabKey>('pr-data');

  const setActiveDataTab = useCallback((key: DataTabKey) => {
    setActiveDataTabState(key);
  }, []);

  const value = useMemo(() => ({ activeDataTab, setActiveDataTab }), [activeDataTab, setActiveDataTab]);

  return <TabStateContext.Provider value={value}>{children}</TabStateContext.Provider>;
}
