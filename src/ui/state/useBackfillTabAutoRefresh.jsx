import { useEffect, useRef } from 'react';
import { useIsTabPanelVisible } from './useIsTabPanelVisible';

/**
 * Phase H.11 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces backfill-tab.orchestrator.js (deleted outright) - that
 * orchestrator's `initialize()` fired an eager status/log load once,
 * unconditionally, at page-init time (regardless of which management tab
 * was active), and its `onTabActivated()` fired the same load again every
 * time `pr-management-tabs.helpers.js`'s `activateTab` switched to the
 * Backfill tab. Reproduces both exactly: `useIsTabPanelVisible` watches
 * `#tab-panel-backfill`'s `hidden` attribute (the same vanilla DOM
 * mutation `activateTab` still performs - unchanged, tab-switching chrome
 * itself isn't this phase's concern), and this effect fires once
 * unconditionally on mount (matching `initialize()`), then again only on
 * each later transition *to* visible (matching `onTabActivated()` - never
 * on leaving the tab, which the orchestrator never fired on either).
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
export function useBackfillTabAutoRefresh(triggerBackfillTabLoad) {
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
