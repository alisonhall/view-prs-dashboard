import { createContext, useContext } from 'react';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): the current repo's available
 * GitHub labels (fetched by index.page.js's refreshAvailableRepoLabels()
 * via GET /view-prs/labels - still vanilla, this Context only holds the
 * result), shared between the Run & Filter tab's "Apply existing GitHub
 * label" dropdown (ApplyLabelSelect.jsx, via AppRoot) and each PR row's
 * own per-row apply-label <select> (PrActionsCell.jsx) - previously two
 * separate window.* bridges for the same underlying data
 * (window.updateReactApplyLabelOptions, a push into AppRoot's own local
 * state; window.getAvailableRepoLabels, a pull PrActionsCell.jsx read on
 * every render) are consolidated into this one Context, fed by one write
 * point.
 *
 * Default value (unwrapped) is a safe empty list, matching every other
 * Context in this migration - a consumer rendered without a
 * <RepoLabelsProvider> ancestor still works, it just always sees no
 * labels.
 */
export const RepoLabelsContext = createContext({ labels: [] });

export function useRepoLabels() {
  return useContext(RepoLabelsContext);
}
