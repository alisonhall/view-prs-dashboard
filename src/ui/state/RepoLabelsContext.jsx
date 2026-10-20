import { createContext, useContext } from 'react';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): the current repo's available
 * GitHub labels, shared between the Run & Filter tab's "Apply existing
 * GitHub label" dropdown (ApplyLabelSelect.jsx, via AppRoot) and each PR
 * row's own per-row apply-label <select> (PrActionsCell.jsx) - previously
 * two separate window.* bridges for the same underlying data
 * (window.updateReactApplyLabelOptions, a push into AppRoot's own local
 * state; window.getAvailableRepoLabels, a pull PrActionsCell.jsx read on
 * every render) are consolidated into this one Context, fed by one write
 * point.
 *
 * Cleanup pass (see RepoLabelsProvider.jsx's own comment): `refresh` is
 * now this Context's own real fetch (GET /view-prs/labels via
 * RepoLabelsProvider.jsx), not a vanilla index.page.js function - the "↻
 * Labels" button calls it directly via this hook instead of a window.*
 * bridge.
 *
 * Default value (unwrapped) is a safe empty list and a no-op refresh,
 * matching every other Context in this migration - a consumer rendered
 * without a <RepoLabelsProvider> ancestor still works, it just always
 * sees no labels and refresh does nothing.
 */
export const RepoLabelsContext = createContext({ labels: [], refresh: () => {} });

export function useRepoLabels() {
  return useContext(RepoLabelsContext);
}
