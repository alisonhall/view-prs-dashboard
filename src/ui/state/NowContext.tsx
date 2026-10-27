import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * "Now", ticking once a minute, for relative times that should keep
 * moving while nothing else re-renders: the PR table's Activity ages
 * ("5m") and stale-check marks. One timer for the whole table; only the
 * cells that read it re-render on each tick (context reaches them through
 * the memoized rows).
 *
 * Unwrapped there's no ticking, and useNow() returns the current time at
 * each render.
 */
export const NOW_TICK_MS = 60_000;

export const NowContext = createContext<number | null>(null);

export function useNow(): number {
  const now = useContext(NowContext);
  return now ?? Date.now();
}

export function NowProvider({ children, tickMs = NOW_TICK_MS }: { children?: ReactNode; tickMs?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}
