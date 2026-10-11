/**
 * DataTabButton - generic React-owned data-tab button, Context-backed.
 *
 * Phase A, slice 1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * one generic component for all 3 data-tab buttons (PR Data/Review
 * Stats/Author Insights), matching `ContextFilterCheckbox.jsx`'s "no
 * field-specific behavior" shape - id/label/panel-driven, nothing about
 * any one tab hardcoded here.
 *
 * @module components/DataTabButton
 */

import { useTabState } from '../state/TabStateContext';

export function DataTabButton({ tabKey, label, panelId }) {
  const { activeDataTab, setActiveDataTab } = useTabState();
  const isActive = activeDataTab === tabKey;

  return (
    <button
      type="button"
      id={`tab-${tabKey}`}
      className={isActive ? 'data-tab-button is-active' : 'data-tab-button'}
      role="tab"
      aria-selected={isActive ? 'true' : 'false'}
      aria-controls={panelId}
      onClick={() => setActiveDataTab(tabKey)}
    >
      {label}
    </button>
  );
}
