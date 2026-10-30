import { createContext, useContext } from 'react';

/**
 * The current repo's available GitHub labels (GET /view-prs/labels), shared
 * by Settings' "Apply existing GitHub label" dropdown (Run & check)
 * (ApplyLabelSelect.jsx) and each PR row's apply-label <select>
 * (PrActionsCell.jsx). `refresh` refetches them - the "↻ Labels" button
 * calls it, and RepoLabelsProvider calls it when the repo changes.
 *
 * Default value (unwrapped) is a safe empty list and a no-op refresh,
 * matching every other Context in this app - a consumer rendered without a
 * <RepoLabelsProvider> ancestor still works, it just always sees no labels
 * and refresh does nothing.
 */
// As `gh label list --json name,color` returns them.
export interface RepoLabel {
  name?: string;
  color?: string;
}

export interface RepoLabelsValue {
  labels: RepoLabel[];
  // Fetches for repoOverride, else the current repo.
  refresh: (repoOverride?: string) => Promise<void> | void;
}

export const RepoLabelsContext = createContext<RepoLabelsValue>({ labels: [], refresh: () => {} });

export function useRepoLabels(): RepoLabelsValue {
  return useContext(RepoLabelsContext);
}
