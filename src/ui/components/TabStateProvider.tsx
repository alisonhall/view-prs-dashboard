import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { TabStateContext, type DataTabKey, type ManagementTabKey } from '../state/TabStateContext';

/**
 * Owns which tab is active in each tab bar, as plain React state (it
 * genuinely originates here, so no ref-plus-version pattern is needed).
 * Panel visibility follows from it: `TabPanelVisibilitySync.jsx` sets each
 * panel's `hidden` attribute from this Context, and `useIsTabPanelVisible`
 * reads it directly.
 */
export function TabStateProvider({ children }: { children?: ReactNode }) {
  const [activeDataTab, setActiveDataTabState] = useState<DataTabKey>('pr-data');
  const [activeManagementTab, setActiveManagementTabState] = useState<ManagementTabKey>('backfill');

  const setActiveDataTab = useCallback((key: DataTabKey) => {
    setActiveDataTabState(key);
  }, []);

  const setActiveManagementTab = useCallback((key: ManagementTabKey) => {
    setActiveManagementTabState(key);
  }, []);

  const value = useMemo(
    () => ({ activeDataTab, setActiveDataTab, activeManagementTab, setActiveManagementTab }),
    [activeDataTab, setActiveDataTab, activeManagementTab, setActiveManagementTab],
  );

  return <TabStateContext.Provider value={value}>{children}</TabStateContext.Provider>;
}
