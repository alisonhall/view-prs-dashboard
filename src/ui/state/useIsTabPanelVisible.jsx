import { useEffect, useState } from 'react';

/**
 * Deferred-items follow-up, items 3/5 (see REACT_MIGRATION_PLAN.md):
 * originally added colocated inside ReviewStatsContent.jsx for item 3,
 * promoted here once item 5 needed a second consumer - no Context/React
 * state tracks which management/data tab is active today, since tab
 * switching is pure vanilla DOM (pr-data-tabs.helpers.js's
 * activateDataTab / pr-management-tabs.helpers.js's own tab switcher both
 * set a panel's `hidden` attribute directly), so this watches that DOM
 * attribute via MutationObserver rather than needing a new Context field.
 */
export function useIsTabPanelVisible(panelId) {
  const [isVisible, setIsVisible] = useState(() => {
    const panel = document.getElementById(panelId);
    return !panel || !panel.hidden;
  });
  useEffect(() => {
    const panel = document.getElementById(panelId);
    if (!panel) {
      return undefined;
    }
    setIsVisible(!panel.hidden);
    const observer = new MutationObserver(() => setIsVisible(!panel.hidden));
    observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    return () => observer.disconnect();
  }, [panelId]);
  return isVisible;
}

/**
 * Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md): "has this
 * tab ever been made visible" - true once `useIsTabPanelVisible` reports
 * visible for the first time, and (deliberately, unlike that hook) never
 * flips back to false afterward. Built for code-splitting a not-yet-visited
 * tab's contents out of the initial bundle via `React.lazy()` - gating on
 * plain `isVisible` instead would unmount/remount that tab's components on
 * every switch away and back, and several of them (e.g. ReviewStatsControls,
 * ExportTab) hold local-only UI state (selected sort/filter, checked export
 * fields) that isn't backed by a vanilla bridge the way Author Insights'
 * comment drafts are - remounting would silently reset it. Staying mounted
 * forever after the first visit avoids that while still deferring the
 * chunk's fetch/parse cost until it's actually needed.
 */
export function useHasTabPanelBeenVisible(panelId) {
  const isVisible = useIsTabPanelVisible(panelId);
  const [hasBeenVisible, setHasBeenVisible] = useState(isVisible);
  useEffect(() => {
    if (isVisible) {
      setHasBeenVisible(true);
    }
  }, [isVisible]);
  return hasBeenVisible;
}
