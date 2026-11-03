import { createContext, useContext, useEffect } from 'react';

/**
 * Repos' available GitHub labels (GET /view-prs/labels).
 *
 * - `labels` is the current repo's (the selected repo, else the Settings
 *   repo field), for Settings' "Apply existing GitHub label" dropdown (Run
 *   & check, ApplyLabelSelect). `refresh` refetches them - the "↻ Labels"
 *   button calls it, and RepoLabelsProvider calls it when the repo changes.
 * - `labelsByRepo` holds every repo's fetched so far, and `ensureLabels`
 *   fetches a repo's once. A PR's own label pickers (each row's,
 *   PrActionsCell, and the detail pane's) read their PR's repo through
 *   useLabelsForRepo: a PR from another repo can't take the current repo's
 *   labels.
 *
 * Default value (unwrapped) is safe empty lists and no-op fetches,
 * matching every other Context in this app - a consumer rendered without a
 * <RepoLabelsProvider> ancestor still works, it just always sees no labels.
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
  labelsByRepo?: Record<string, RepoLabel[]>;
  // Fetches a repo's labels unless they're fetched or being fetched.
  ensureLabels?: (repo: string) => void;
}

export const RepoLabelsContext = createContext<RepoLabelsValue>({ labels: [], refresh: () => {} });

export function useRepoLabels(): RepoLabelsValue {
  return useContext(RepoLabelsContext);
}

const NO_LABELS: RepoLabel[] = [];

// One repo's labels, fetched the first time any component asks for them.
export function useLabelsForRepo(repo: string): RepoLabel[] {
  const { labelsByRepo, ensureLabels } = useRepoLabels();
  const safeRepo = String(repo || '').trim();
  useEffect(() => {
    if (safeRepo) ensureLabels?.(safeRepo);
  }, [safeRepo, ensureLabels]);
  return (safeRepo && labelsByRepo?.[safeRepo]) || NO_LABELS;
}
