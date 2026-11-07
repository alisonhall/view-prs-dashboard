import { createContext, useCallback, useContext } from 'react';

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
 *   useLabelsForRepo, fetched when their menu first opens: a PR from
 *   another repo can't take the current repo's labels.
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
  // The repos whose last request failed (until they're asked for again).
  failedRepos?: Record<string, true>;
  // Fetches a repo's labels unless they're fetched or being fetched.
  ensureLabels?: (repo: string) => void;
}

export const RepoLabelsContext = createContext<RepoLabelsValue>({ labels: [], refresh: () => {} });

export function useRepoLabels(): RepoLabelsValue {
  return useContext(RepoLabelsContext);
}

const NO_LABELS: RepoLabel[] = [];

// One repo's labels: what's fetched so far, whether they have been, and
// `load` to fetch them (once per repo) - called when a menu listing them
// opens, so a table of many repos doesn't fetch every repo's on load.
// failed: its last request failed - load() asks again.
export function useLabelsForRepo(repo: string): { labels: RepoLabel[]; loaded: boolean; failed: boolean; load: () => void } {
  const { labelsByRepo, failedRepos, ensureLabels } = useRepoLabels();
  const safeRepo = String(repo || '').trim();
  const load = useCallback(() => {
    if (safeRepo) ensureLabels?.(safeRepo);
  }, [safeRepo, ensureLabels]);
  const fetched = safeRepo ? labelsByRepo?.[safeRepo] : undefined;
  // Without a Provider to fetch them, there's nothing to wait for.
  return {
    labels: fetched || NO_LABELS,
    loaded: Boolean(fetched) || !ensureLabels,
    failed: !fetched && Boolean(safeRepo && failedRepos?.[safeRepo]),
    load,
  };
}
