import { useEffect, useRef, useState } from 'react';
import { RepoLabelsContext } from '../state/RepoLabelsContext';
import { usePrData } from '../state/PrDataContext';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): owns the current repo's
 * available GitHub labels, replacing two separate window.* bridges for
 * the same underlying data with one Context fed by one write point - see
 * RepoLabelsContext.jsx's own comment for the full "why".
 *
 * index.page.js's refreshAvailableRepoLabels() still owns the actual
 * fetch (GET /view-prs/labels) and its own module-scope cache - this
 * Provider doesn't duplicate that, it just mirrors the result into
 * Context via a dedicated bridge (window.setAvailableRepoLabels),
 * matching NotesDirtyProvider.jsx's own "a dedicated, single-purpose
 * bridge rather than FilterStateProvider's generic one" reasoning - this
 * is genuinely new, distinct state, not an existing FILTER_STATE_FIELD_MAP
 * field.
 *
 * Phase G.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): also
 * owns the "refetch labels when the selected repo changes" trigger -
 * previously index.page.js's own applyResolvedRepo() decided this
 * (comparing against its own labelsFetchedForRepo module variable, now
 * deleted). This Provider is a real descendant of <PrDataProvider />
 * (react-app.jsx), so it reads selectedRepo via usePrData() directly and
 * calls window.refreshAvailableRepoLabels itself - that bridge (and the
 * actual fetch/dedup state behind it) stays, since the manual "↻ Labels"
 * button (useRefreshAvailableRepoLabels.jsx, called from AppRoot's own
 * body - an ancestor, not a descendant, of this Provider) still needs
 * it; lastTriggeredRepoRef below is this effect's own, separate
 * bookkeeping, not a fork of that bridge's internal state.
 */
export function RepoLabelsProvider({ children }) {
  const [labels, setLabels] = useState([]);
  const { selectedRepo } = usePrData();
  const lastTriggeredRepoRef = useRef('');

  useEffect(() => {
    window.setAvailableRepoLabels = (nextLabels) => {
      setLabels(Array.isArray(nextLabels) ? nextLabels : []);
      return true;
    };
    return () => {
      delete window.setAvailableRepoLabels;
    };
  }, []);

  useEffect(() => {
    if (!selectedRepo || selectedRepo === lastTriggeredRepoRef.current) {
      return;
    }
    lastTriggeredRepoRef.current = selectedRepo;
    void window.refreshAvailableRepoLabels?.(selectedRepo);
  }, [selectedRepo]);

  return <RepoLabelsContext.Provider value={{ labels }}>{children}</RepoLabelsContext.Provider>;
}
