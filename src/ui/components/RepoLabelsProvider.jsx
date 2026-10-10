import { useEffect, useState } from 'react';
import { RepoLabelsContext } from '../state/RepoLabelsContext';

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
 */
export function RepoLabelsProvider({ children }) {
  const [labels, setLabels] = useState([]);

  useEffect(() => {
    window.setAvailableRepoLabels = (nextLabels) => {
      setLabels(Array.isArray(nextLabels) ? nextLabels : []);
      return true;
    };
    return () => {
      delete window.setAvailableRepoLabels;
    };
  }, []);

  return <RepoLabelsContext.Provider value={{ labels }}>{children}</RepoLabelsContext.Provider>;
}
