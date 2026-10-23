import { useCallback, useEffect, useRef, useState } from 'react';
import { RepoLabelsContext } from '../state/RepoLabelsContext';
import { usePrData } from '../state/PrDataContext';
import { useFilterState } from '../state/FilterStateContext';
import { resolveRepoForLabelsFetch } from '../helpers/pr-repo-labels.helpers.ts';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): owns the current repo's
 * available GitHub labels, replacing two separate window.* bridges for
 * the same underlying data with one Context fed by one write point - see
 * RepoLabelsContext.jsx's own comment for the full "why".
 *
 * Cleanup pass (prompted by a direct question about why
 * window.refreshAvailableRepoLabels stayed vanilla instead of being fully
 * migrated, see REACT_MIGRATION_PLAN.md): `refresh` below is this
 * Provider's own real fetch (GET /view-prs/labels), reading the current
 * repo from usePrData()/useFilterState() instead of a DOM read. Exposed on
 * `RepoLabelsContext` for the "↻ Labels" button (`RefreshLabelsButtonLive`,
 * react-app.jsx) to call directly.
 *
 * Second cleanup pass (prompted by a direct instruction to reconsider the
 * structure so NO window.* bridge is needed at all, not even for the one
 * remaining ancestor caller): `FilterStateProvider.jsx`'s restore-on-mount
 * effect used to reach `window.refreshAvailableRepoLabels` directly to
 * trigger a refetch once a *saved* repo override was known - a real
 * requirement (`selectedRepo`, from usePrData(), doesn't necessarily
 * reflect it yet), but calling DOWN into a descendant was never the only
 * option. `FilterStateProvider` is a genuine ANCESTOR of this Provider
 * (it wraps `<AppRoot/>` from `mountAppRoot()`; this Provider is a
 * descendant AppRoot renders further down its own JSX) - Context already
 * flows that direction for free. `FilterStateProvider` now just publishes
 * `restoredRepoOverride` (a plain piece of its own Context value, `null`
 * until a restore sets it exactly once), and this Provider reacts to it
 * with its own effect below, the same shape as its existing
 * `selectedRepo`-watching effect. No bridge of any kind is needed any
 * more for any of this Provider's 3 real triggers (the button, the
 * selectedRepo-change effect, the repo-override-restored effect) - all 3
 * call/read straight through real Context.
 */
export function RepoLabelsProvider({ children }) {
  const [labels, setLabels] = useState([]);
  const { selectedRepo } = usePrData();
  const { values, restoredRepoOverride } = useFilterState();
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
    if (!selectedRepo || selectedRepo === lastTriggeredRepoRef.current) {
      return;
    }
    lastTriggeredRepoRef.current = selectedRepo;
    void refresh(selectedRepo);
  }, [selectedRepo, refresh]);

  // Mirrors the effect above, for the one case selectedRepo alone can't
  // cover: a *saved* repo override being restored (FilterStateProvider.jsx)
  // ahead of selectedRepo (PrDataContext) necessarily catching up to it -
  // see this file's own header comment.
  useEffect(() => {
    if (!restoredRepoOverride || restoredRepoOverride === lastTriggeredRepoRef.current) {
      return;
    }
    lastTriggeredRepoRef.current = restoredRepoOverride;
    void refresh(restoredRepoOverride);
  }, [restoredRepoOverride, refresh]);

  return <RepoLabelsContext.Provider value={{ labels, refresh }}>{children}</RepoLabelsContext.Provider>;
}
