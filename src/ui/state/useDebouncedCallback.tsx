import { useEffect, useRef, type DependencyList } from 'react';

/**
 * Calls `callback` `delayMs` after the last time `deps` changed, clearing
 * any pending call if `deps` changes again first. Never fires on the very
 * first render (mount): only a later change to `deps` schedules a call.
 */
export function useDebouncedEffect(callback: () => void, deps: DependencyList, delayMs: number): void {
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
