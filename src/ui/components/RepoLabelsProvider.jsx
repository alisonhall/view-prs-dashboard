import { useCallback, useEffect, useRef, useState } from 'react';
import { RepoLabelsContext } from '../state/RepoLabelsContext';
import { usePrData } from '../state/PrDataContext';
import { useFilterState } from '../state/FilterStateContext';
import { resolveRepoForLabelsFetch } from '../helpers/pr-repo-labels.helpers.js';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): owns the current repo's
 * available GitHub labels, replacing two separate window.* bridges for
 * the same underlying data with one Context fed by one write point - see
 * RepoLabelsContext.jsx's own comment for the full "why".
 *
 * Cleanup pass (prompted by a direct question about why
 * window.refreshAvailableRepoLabels stayed vanilla instead of being fully
 * migrated, see REACT_MIGRATION_PLAN.md): `refresh` below is now this
 * Provider's own real fetch (GET /view-prs/labels) - index.page.js's old
 * module-scope `availableRepoLabels`/`isFetchingRepoLabels`/
 * `refreshAvailableRepoLabels` are deleted outright, along with the DOM
 * read of `#repo` (replaced by `useFilterState()`'s own `values.repo`,
 * since "repo" is already a real `FilterStateContext` field) and
 * `window.setAvailableRepoLabels` (no longer needed - `setLabels` is an
 * internal closure now, not a cross-boundary write). `refresh` is exposed
 * on `RepoLabelsContext` itself for the 2 real descendants that need it
 * (the "↻ Labels" button, via `RefreshLabelsButtonLive` in react-app.jsx;
 * this Provider's own repo-change effect below, which now just calls its
 * sibling function directly instead of going through `window.*` to reach
 * itself).
 *
 * `window.refreshAvailableRepoLabels` itself is NOT deleted - it still has
 * exactly one real caller, `FilterStateProvider.jsx`'s restore-on-mount
 * effect, which is a genuine ANCESTOR of this Provider in the real
 * component tree (`FilterStateProvider` wraps `<AppRoot/>` from
 * `mountAppRoot()`; this Provider is a descendant AppRoot renders further
 * down its own JSX - see react-app.jsx's own Provider-tree comment). A
 * parent can never consume a Context its own child provides - that's not
 * a leftover vanilla shortcut, it's how React Context works - so this one
 * bridge stays as the deliberate escape hatch for that one cross-tree
 * call, now forwarding to this Provider's real `refresh` instead of a
 * vanilla fetch.
 */
export function RepoLabelsProvider({ children }) {
  const [labels, setLabels] = useState([]);
  const { selectedRepo } = usePrData();
  const { values } = useFilterState();
  const lastTriggeredRepoRef = useRef('');
  const isFetchingRef = useRef(false);

  const refresh = useCallback(
    async (repoOverride) => {
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
        const result = await response.json();
        if (response.ok && result?.ok !== false) {
          setLabels(Array.isArray(result.labels) ? result.labels : []);
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
    window.refreshAvailableRepoLabels = (...args) => refresh(...args);
    return () => {
      delete window.refreshAvailableRepoLabels;
    };
  }, [refresh]);

  useEffect(() => {
    if (!selectedRepo || selectedRepo === lastTriggeredRepoRef.current) {
      return;
    }
    lastTriggeredRepoRef.current = selectedRepo;
    void refresh(selectedRepo);
  }, [selectedRepo, refresh]);

  return <RepoLabelsContext.Provider value={{ labels, refresh }}>{children}</RepoLabelsContext.Provider>;
}
