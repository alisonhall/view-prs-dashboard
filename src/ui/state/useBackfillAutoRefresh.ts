import { useEffect, useRef } from 'react';
import { useIsSettingsSectionVisible } from './SettingsDrawerContext';

/**
 * Loads the backfill status/log once on mount, whatever is showing, then
 * again each time the Settings drawer's Backfill section comes into view
 * (opened at it, or switched to it) - not when it leaves.
 *
 * Takes `triggerBackfillTabLoad` rather than calling `useBackfillActions()`
 * itself, so BackfillSection drives it from the same instance its buttons
 * use.
 */
export function useBackfillAutoRefresh(triggerBackfillTabLoad: () => void): void {
  const isBackfillVisible = useIsSettingsSectionVisible('backfill');
  const hasTriggeredOnceRef = useRef(false);

  useEffect(() => {
    if (!hasTriggeredOnceRef.current) {
      hasTriggeredOnceRef.current = true;
      triggerBackfillTabLoad();
      return;
    }
    if (isBackfillVisible) {
      triggerBackfillTabLoad();
    }
  }, [isBackfillVisible, triggerBackfillTabLoad]);
}
