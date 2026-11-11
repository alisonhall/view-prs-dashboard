import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { TabStateContext, type DataTabKey, type ReturnTarget } from '../state/TabStateContext';

/**
 * Owns which view is showing, as plain React state (it
 * genuinely originates here, so no ref-plus-version pattern is needed).
 * Panel visibility follows from it: AppShell hides the other views'
 * panels, through `useIsTabPanelVisible`.
 *
 * It also keeps where "View in table" was clicked from
 * (useNavigateToPrInTable), for ReturnToViewBanner's Back button. The
 * views stay mounted while hidden, so going back finds the same author,
 * dates and open rows; this restores the page's scroll and puts the focus
 * on the button clicked (or the view's tab, if it's gone), after the view
 * has been shown.
 */
export function TabStateProvider({ children }: { children?: ReactNode }) {
  const [activeDataTab, setActiveDataTabState] = useState<DataTabKey>('pr-data');
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  // For returnToPreviousView, so it needn't change with each target.
  const returnTargetRef = useRef<ReturnTarget | null>(null);
  const keepReturnTarget = useCallback((target: ReturnTarget | null) => {
    returnTargetRef.current = target;
    setReturnTarget(target);
  }, []);

  // Showing the table keeps it: "View in table" remembers it first.
  const setActiveDataTab = useCallback(
    (key: DataTabKey) => {
      setActiveDataTabState(key);
      if (key !== 'pr-data') keepReturnTarget(null);
    },
    [keepReturnTarget],
  );

  const rememberReturnTarget = useCallback((target: ReturnTarget) => keepReturnTarget(target), [keepReturnTarget]);
  const forgetReturnTarget = useCallback(() => keepReturnTarget(null), [keepReturnTarget]);

  const returnToPreviousView = useCallback(() => {
    const target = returnTargetRef.current;
    if (!target) return;
    keepReturnTarget(null);
    setActiveDataTabState(target.tab);
    requestAnimationFrame(() => {
      const focusTarget = target.focusTarget?.isConnected
        ? target.focusTarget
        : document.getElementById(`tab-${target.tab}`);
      focusTarget?.focus({ preventScroll: true });
      window.scrollTo({ top: target.scrollY, behavior: 'instant' });
    });
  }, [keepReturnTarget]);

  const value = useMemo(
    () => ({ activeDataTab, setActiveDataTab, returnTarget, rememberReturnTarget, forgetReturnTarget, returnToPreviousView }),
    [activeDataTab, setActiveDataTab, returnTarget, rememberReturnTarget, forgetReturnTarget, returnToPreviousView],
  );

  return <TabStateContext.Provider value={value}>{children}</TabStateContext.Provider>;
}
