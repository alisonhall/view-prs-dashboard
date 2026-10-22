import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a function whose identity never changes but which always calls
 * the latest `callback` passed in (the `useEvent` pattern).
 *
 * Use this instead of useCallback for handlers that are held long-term
 * (memoized row props, etc.) inside a component that also captures large,
 * churning data like `payload`. V8 gives every closure created in one
 * render a single shared scope object, so a useCallback whose deps change
 * at a different rate than its siblings' keeps an *older* render's scope
 * alive - and that scope holds the older sibling handlers, whose scopes
 * hold older ones still, each pinning that render's `payload`. That chain
 * grew by one full payload per data change (found as the Chrome/Edge
 * "Error code: 5" renderer crash after the tab sat open through many
 * auto-refreshes). The function returned here closes only over a ref, so
 * no render scope other than the latest one is ever reachable from it.
 *
 * Only call the returned function from event handlers/effects, not
 * during render - the ref is updated in a layout effect.
 */
export function useStableCallback(callback) {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  return useCallback((...args) => callbackRef.current?.(...args), []);
}
