import { useEffect, useRef } from 'react';
import { useIsTabPanelVisible } from './useIsTabPanelVisible';

/**
 * Loads the backfill status/log once on mount, whatever tab is showing,
 * then again each time the Backfill tab becomes visible (not when leaving
 * it).
 *
 * Takes `triggerBackfillTabLoad` as a parameter rather than calling
 * `useBackfillActions()` itself, so `react-app.jsx`'s `AppRoot` (which
 * already calls that hook once for the Start/Stop/Refresh buttons) and
 * `index.html.test.js`'s own `BackfillControlsTestHarness` (which needs
 * the exact same trigger, since that suite never mounts the real
 * `<AppRoot/>`) both drive this effect from their own single
 * `useBackfillActions()` instance instead of each creating a second,
 * independent one.
 */
export function useBackfillTabAutoRefresh(triggerBackfillTabLoad: () => void): void {
  const isBackfillTabVisible = useIsTabPanelVisible('tab-panel-backfill');
  const hasTriggeredOnceRef = useRef(false);

  useEffect(() => {
    if (!hasTriggeredOnceRef.current) {
      hasTriggeredOnceRef.current = true;
      triggerBackfillTabLoad();
      return;
    }
    if (isBackfillTabVisible) {
      triggerBackfillTabLoad();
    }
  }, [isBackfillTabVisible, triggerBackfillTabLoad]);
}
