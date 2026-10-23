import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StatusTextContext } from '../state/StatusTextContext';

/**
 * Owns the `#status` panel's text.
 *
 * Mounted wrapping `<AppRoot />` from `mountAppRoot()`, outside AppRoot's
 * own returned JSX - same reasoning as `PrActivityQueueProvider`:
 * `useRunScript`/`useBackfillActions`/`useAckLabelActions`/
 * `useSinglePrUpdate` are called from AppRoot's own body or from a
 * descendant of it, so a Provider nested *inside* AppRoot's returned tree
 * could never be reached by a caller sitting in AppRoot's own body (a
 * component can't be a descendant of something it renders). Wrapping from
 * the root-mount call instead makes every one of those a genuine Context
 * descendant.
 *
 * Writes `#status`'s `textContent` directly in an effect rather than
 * `createPortal`-ing `statusText` into it - deliberately, not an oversight.
 * In production there's only ever one of these mounted, so either approach
 * would work, but `index.html.test.js`'s own test harness (which never
 * mounts the real `<AppRoot/>`) mounts *several* independent instances of
 * this Provider, one per hand-rolled tree that needs it
 * (`BackfillControlsTestHarness`/`RunScriptActionButtonsTestHarness`/the
 * main persistent tree) - a `createPortal` from each would each insert its
 * own text node into the same shared `#status` element without
 * reconciling against the others' (unrelated React trees/portals don't
 * know about each other's children), concatenating every instance's text
 * instead of the last writer winning. A plain DOM write has no such
 * problem - whichever instance's `statusText` changes most recently
 * simply overwrites the shared node, matching the "later install wins"
 * precedent `index.html.test.js`'s own `wireTextBridge` helper already
 * documents for this same container.
 */
export function StatusTextProvider({ children }: { children?: ReactNode }) {
  const [statusText, setStatusText] = useState('Not run');

  useEffect(() => {
    const container = document.getElementById('status');
    if (container) {
      container.textContent = statusText;
    }
  }, [statusText]);

  const value = useMemo(() => ({ statusText, setStatusText }), [statusText]);

  return <StatusTextContext.Provider value={value}>{children}</StatusTextContext.Provider>;
}
