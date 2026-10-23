import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RepoLabelsContext, type RepoLabel } from '../state/RepoLabelsContext';
import { usePrData } from '../state/PrDataContext';
import { useFilterState } from '../state/FilterStateContext';
import { resolveRepoForLabelsFetch } from '../helpers/pr-repo-labels.helpers.ts';

/**
 * Owns the current repo's available GitHub labels and their fetch
 * (`refresh`, GET /view-prs/labels). The repo comes from usePrData()'s
 * selectedRepo, else the Run & Filter tab's repo field.
 *
 * Three things trigger a fetch, all through Context: the "↻ Labels" button
 * (RefreshLabelsButtonLive in react-app.jsx) calling `refresh`; selectedRepo
 * changing; and FilterStateProvider restoring a saved repo override, which
 * it publishes as `restoredRepoOverride` (null until a restore sets it,
 * once). The last one is needed because selectedRepo doesn't necessarily
 * reflect a restored override yet. FilterStateProvider is an ancestor of
 * this Provider, so it publishes the value rather than calling down into
 * it.
 */
export function RepoLabelsProvider({ children }: { children?: ReactNode }) {
  const [labels, setLabels] = useState<RepoLabel[]>([]);
  const { selectedRepo } = usePrData();
  const { values, restoredRepoOverride } = useFilterState();
  const lastTriggeredRepoRef = useRef('');
  const isFetchingRef = useRef(false);

  const refresh = useCallback(
    async (repoOverride?: string) => {
      const repo = resolveRepoForLabelsFetch({
        repoOverride,
        currentRepo: selectedRepo,
        repoInputValue: values.repo,
      });
      if (!repo || isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      try {
        const response = await fetch(`/view-prs/labels?repo=${encodeURIComponent(repo)}`);
        const result: { ok?: boolean; labels?: unknown } = await response.json();
        if (response.ok && result?.ok !== false) {
          setLabels(Array.isArray(result.labels) ? (result.labels as RepoLabel[]) : []);
        }
      } catch (_error) {
        // Best-effort: leave any previously cached labels in place.
      } finally {
        isFetchingRef.current = false;
      }
    },
    [selectedRepo, values.repo],
  );

  useEffect(() => {
    if (!selectedRepo || selectedRepo === lastTriggeredRepoRef.current) {
      return;
    }
    lastTriggeredRepoRef.current = selectedRepo;
    void refresh(selectedRepo);
  }, [selectedRepo, refresh]);

  // Mirrors the effect above, for the one case selectedRepo alone can't
  // cover: a *saved* repo override being restored (FilterStateProvider.jsx)
  // ahead of selectedRepo (PrDataContext) necessarily catching up to it.
  useEffect(() => {
    if (!restoredRepoOverride || restoredRepoOverride === lastTriggeredRepoRef.current) {
      return;
    }
    lastTriggeredRepoRef.current = restoredRepoOverride;
    void refresh(restoredRepoOverride);
  }, [restoredRepoOverride, refresh]);

  return <RepoLabelsContext.Provider value={{ labels, refresh }}>{children}</RepoLabelsContext.Provider>;
}
