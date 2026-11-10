import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RepoLabelsContext, type RepoLabel, type RepoLabelsStatus } from '../state/RepoLabelsContext';
import { usePrData } from '../state/PrDataContext';
import { useFilterState } from '../state/FilterStateContext';
import { resolveRepoForLabelsFetch } from '../helpers/pr-repo-labels.helpers.ts';

/**
 * Owns the current repo's available GitHub labels and their fetch
 * (`refresh`, GET /view-prs/labels). The repo comes from usePrData()'s
 * selectedRepo, else Run & check's repo field (its options for Run script).
 *
 * Three things trigger a fetch, all through Context: the "↻ Labels" button
 * (in Tools › Run & check, RunCheckSection) calling `refresh`; selectedRepo
 * changing; and FilterStateProvider restoring a saved repo override, which
 * it publishes as `restoredRepoOverride` (null until a restore sets it,
 * once). The last one is needed because selectedRepo doesn't necessarily
 * reflect a restored override yet. FilterStateProvider is an ancestor of
 * this Provider, so it publishes the value rather than calling down into
 * it.
 */
export function RepoLabelsProvider({ children }: { children?: ReactNode }) {
  const [labels, setLabels] = useState<RepoLabel[]>([]);
  // How the current repo's labels (`labels`) stand, so Settings' dropdown
  // can tell loading and a failed request from a repo with none.
  const [labelsStatus, setLabelsStatus] = useState<RepoLabelsStatus>('idle');
  const refreshCountRef = useRef(0);
  // The repo `labels` are for, and every repo's last fetched labels (as
  // labelsByRepo, but read when the repo changes without a render).
  const labelsRepoRef = useRef('');
  const labelsCacheRef = useRef(new Map<string, RepoLabel[]>());
  const [labelsByRepo, setLabelsByRepo] = useState<Record<string, RepoLabel[]>>({});
  // The repos whose last request failed: their menus offer to try again.
  const [failedRepos, setFailedRepos] = useState<Record<string, true>>({});
  const { selectedRepo } = usePrData();
  const { values, restoredRepoOverride } = useFilterState();
  const lastTriggeredRepoRef = useRef('');
  // Each repo's request while it's in flight, so asking again joins it, and
  // the repos fetched.
  const inFlightRef = useRef(new Map<string, Promise<RepoLabel[] | null>>());
  const fetchedReposRef = useRef(new Set<string>());

  // A repo's labels, or null when the request fails (any cached ones stay).
  const fetchLabels = useCallback((repo: string): Promise<RepoLabel[] | null> => {
    const inFlight = inFlightRef.current.get(repo);
    if (inFlight) return inFlight;
    // Asked again: it's loading, not failed.
    setFailedRepos(({ [repo]: _cleared, ...rest }) => rest);
    const request = (async () => {
      try {
        const response = await fetch(`/view-prs/labels?repo=${encodeURIComponent(repo)}`);
        const result: { ok?: boolean; labels?: unknown } = await response.json();
        if (response.ok && result?.ok !== false) {
          const fetched = Array.isArray(result.labels) ? (result.labels as RepoLabel[]) : [];
          fetchedReposRef.current.add(repo);
          labelsCacheRef.current.set(repo, fetched);
          setLabelsByRepo((previous) => ({ ...previous, [repo]: fetched }));
          return fetched;
        }
      } catch (_error) {
        // Best-effort: leave any previously cached labels in place.
      }
      setFailedRepos((previous) => ({ ...previous, [repo]: true }));
      return null;
    })().finally(() => inFlightRef.current.delete(repo));
    inFlightRef.current.set(repo, request);
    return request;
  }, []);

  const refresh = useCallback(
    async (repoOverride?: string) => {
      const repo = resolveRepoForLabelsFetch({
        repoOverride,
        currentRepo: selectedRepo,
        repoInputValue: values.repo,
      });
      if (!repo) {
        return;
      }
      // The latest refresh's answer is the one shown (a repo change can
      // overtake a slower request).
      refreshCountRef.current += 1;
      const thisRefresh = refreshCountRef.current;
      // Another repo: its own labels from the start (fetched before, or
      // none) - the last repo's would offer labels this one doesn't have,
      // and stay if this request failed. Reloading the same repo keeps them.
      if (repo !== labelsRepoRef.current) {
        labelsRepoRef.current = repo;
        setLabels(labelsCacheRef.current.get(repo) || []);
      }
      setLabelsStatus('loading');
      const fetched = await fetchLabels(repo);
      if (thisRefresh !== refreshCountRef.current) return;
      if (fetched) setLabels(fetched);
      setLabelsStatus(fetched ? 'loaded' : 'failed');
    },
    [selectedRepo, values.repo, fetchLabels],
  );

  useEffect(() => {
    if (!selectedRepo || selectedRepo === lastTriggeredRepoRef.current) {
      return;
    }
    lastTriggeredRepoRef.current = selectedRepo;
    void refresh(selectedRepo);
  }, [selectedRepo, refresh]);

  // Mirrors the effect above, for the one case selectedRepo alone can't
  // cover: a *saved* repo override being restored (FilterStateProvider.tsx)
  // ahead of selectedRepo (PrDataContext) necessarily catching up to it.
  useEffect(() => {
    if (!restoredRepoOverride || restoredRepoOverride === lastTriggeredRepoRef.current) {
      return;
    }
    lastTriggeredRepoRef.current = restoredRepoOverride;
    void refresh(restoredRepoOverride);
  }, [restoredRepoOverride, refresh]);

  // Once per repo: fetched ones aren't asked for again (refresh refetches).
  const ensureLabels = useCallback(
    (repo: string) => {
      const safeRepo = String(repo || '').trim();
      if (!safeRepo || fetchedReposRef.current.has(safeRepo)) return;
      void fetchLabels(safeRepo);
    },
    [fetchLabels],
  );

  const value = useMemo(
    () => ({ labels, labelsStatus, refresh, labelsByRepo, failedRepos, ensureLabels }),
    [labels, labelsStatus, refresh, labelsByRepo, failedRepos, ensureLabels],
  );
  return <RepoLabelsContext.Provider value={value}>{children}</RepoLabelsContext.Provider>;
}
