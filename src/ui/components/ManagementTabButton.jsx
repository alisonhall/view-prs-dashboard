/**
 * ManagementTabButton - generic React-owned management-tab button,
 * Context-backed.
 *
 * Phase A, slice 2 (see REACT_MIGRATION_PLAN.md, "Full migration
 * roadmap"): one generic component for all 6 management-tab buttons
 * (Activity/Run & Filter/Backfill/Action Log/Actor Names/Export),
 * the same shape the view tabs' DataTabButton had (those are ui/Tabs in
 * the app header since UI redesign phase 9a).
 *
 * @module components/ManagementTabButton
 */

import { useTabState } from '../state/TabStateContext';

export function ManagementTabButton({ tabKey, label, panelId }) {
  const { activeManagementTab, setActiveManagementTab } = useTabState();
  const isActive = activeManagementTab === tabKey;

  return (
    <button
      type="button"
      id={`tab-${tabKey}`}
      className={isActive ? 'management-tab-button is-active' : 'management-tab-button'}
      role="tab"
      aria-selected={isActive ? 'true' : 'false'}
      aria-controls={panelId}
      onClick={() => setActiveManagementTab(tabKey)}
    >
      {label}
    </button>
  );
}
