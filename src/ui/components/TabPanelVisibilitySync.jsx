import { useEffect } from 'react';
import { useTabState } from '../state/TabStateContext';

// Same panel-id/Context-key maps as state/useIsTabPanelVisible.tsx's own
// (kept as a separate, local copy rather than importing/exporting shared
// constants between the two - each file's own list is small, exhaustive,
// and independently verifiable against index.html's real panel ids).
const DATA_TAB_PANEL_IDS = {
  'tab-panel-pr-data': 'pr-data',
  'tab-panel-review-stats': 'review-stats',
  'tab-panel-author-insights': 'author-insights',
};
const MANAGEMENT_TAB_PANEL_IDS = {
  'tab-panel-backfill': 'backfill',
  'tab-panel-action-log': 'action-log',
  'tab-panel-actor-name-cache': 'actor-name-cache',
  'tab-panel-export': 'export',
};

/**
 * TabPanelVisibilitySync - headless component (renders nothing) that owns
 * all 9 tab panels' `hidden` attribute, reactively, from TabStateContext.
 *
 * Phase H.22 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 3): replaces `pr-data-tabs.helpers.js`'s `activateDataTab` /
 * `pr-management-tabs.helpers.js`'s `activateTab` as the panels' own
 * `hidden`-attribute writer - both those functions' panel-hiding code
 * (and the now fully-dead `initDataTabs`/`initManagementTabs`, and the
 * button `className`/`aria-selected` writes, already fully redundant with
 * the tab buttons' own Context-derived styling - now the app header's
 * view tabs and ManagementTabButton.jsx) are deleted outright, along with the `window.activateDataTab`/
 * `window.activateManagementTab` bridges `TabStateProvider.tsx` used to
 * call as a side effect.
 *
 * A DOM mutation via `getElementById` (same element lookup those vanilla
 * functions did) is the correct scope here: these tab panels are static
 * markup, "resolved once, synchronously, by react-app.jsx's
 * computeStaticContainers()" (several are
 * portal targets for content mounted elsewhere in this same render pass).
 */
export function TabPanelVisibilitySync() {
  const { activeDataTab, activeManagementTab } = useTabState();

  useEffect(() => {
    Object.entries(DATA_TAB_PANEL_IDS).forEach(([panelId, key]) => {
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.hidden = key !== activeDataTab;
      }
    });
  }, [activeDataTab]);

  useEffect(() => {
    Object.entries(MANAGEMENT_TAB_PANEL_IDS).forEach(([panelId, key]) => {
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.hidden = key !== activeManagementTab;
      }
    });
  }, [activeManagementTab]);

  return null;
}
