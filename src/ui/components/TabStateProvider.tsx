import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { TabStateContext, type DataTabKey, type ReturnTarget } from '../state/TabStateContext';

/**
 * Owns which view is showing, as plain React state (it
 * genuinely originates here, so no ref-plus-version pattern is needed).
 * Panel visibility follows from it: AppShell hides the other views'
 * panels, through `useIsTabPanelVisible`.
 *
 * It also keeps where "View in table" was clicked from
 * (useNavigateToPrInTable), or a person opened on Authors from
 * (OpenAuthorListener), for ReturnToViewBanner's Back button - a stack,
 * so going Back from a view reached from another view's Back bar offers
 * that one's Back again. The
 * views stay mounted while hidden, so going back finds the same author,
 * dates and open rows; this restores the page's scroll and puts the focus
 * on the button clicked (or the view's tab, if it's gone), after the view
 * has been shown.
 */
// How many views back the Back bar remembers.
export const RETURN_TARGET_STACK_LIMIT = 10;

export function TabStateProvider({ children }: { children?: ReactNode }) {
  const [activeDataTab, setActiveDataTabState] = useState<DataTabKey>('pr-data');
  // The views to go back to, the latest last; the Back bar shows the latest.
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  // Read by the callbacks below, so they needn't change with each target.
  const stackRef = useRef<ReturnTarget[]>([]);
  const keepStack = useCallback((stack: ReturnTarget[]) => {
    stackRef.current = stack;
    setReturnTarget(stack[stack.length - 1] ?? null);
  }, []);
  const top = () => stackRef.current[stackRef.current.length - 1];

  // Showing the view the latest Back bar is on keeps them all ("View in
  // table", or opening a person on Authors, remembers one first); any
  // other view forgets them.
  const setActiveDataTab = useCallback(
    (key: DataTabKey) => {
      setActiveDataTabState(key);
      if (key !== (top()?.shownIn ?? 'pr-data')) keepStack([]);
    },
    [keepStack],
  );

  const rememberReturnTarget = useCallback(
    (target: ReturnTarget) => keepStack([...stackRef.current, target].slice(-RETURN_TARGET_STACK_LIMIT)),
    [keepStack],
  );
  const forgetReturnTarget = useCallback(() => keepStack([]), [keepStack]);

  // Back to the latest; the one before it (if any) then shows its own bar.
  const returnToPreviousView = useCallback(() => {
    const target = top();
    if (!target) return;
    keepStack(stackRef.current.slice(0, -1));
    setActiveDataTabState(target.tab);
    requestAnimationFrame(() => {
      const focusTarget = target.focusTarget?.isConnected
        ? target.focusTarget
        : document.getElementById(`tab-${target.tab}`);
      focusTarget?.focus({ preventScroll: true });
      window.scrollTo({ top: target.scrollY, behavior: 'instant' });
    });
  }, [keepStack]);

  const value = useMemo(
    () => ({ activeDataTab, setActiveDataTab, returnTarget, rememberReturnTarget, forgetReturnTarget, returnToPreviousView }),
    [activeDataTab, setActiveDataTab, returnTarget, rememberReturnTarget, forgetReturnTarget, returnToPreviousView],
  );

  return <TabStateContext.Provider value={value}>{children}</TabStateContext.Provider>;
}
