import { useCallback } from 'react';

/**
 * Phase D.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces window.refreshAvailableRepoLabels as RunScriptActionButton.jsx's
 * "↻ Labels" instance's own call site - but unlike the other 3 D.2 hooks,
 * this one stays a thin pass-through to the existing window.* bridge
 * rather than porting the fetch logic itself into the hook.
 *
 * Why: refreshAvailableRepoLabels's state (availableRepoLabels,
 * isFetchingRepoLabels, labelsFetchedForRepo) is genuinely shared with a
 * second, automatic caller inside index.page.js's renderPrData (it
 * re-triggers this same fetch whenever the selected repo changes, not just
 * on a manual button click). A second, independent copy of this state
 * inside a hook would silently diverge from index.page.js's own copy -
 * duplicate in-flight fetches, or a stale labelsFetchedForRepo dedup -
 * exactly the kind of divergence bug Phase F had to fix for
 * pollForDataChanges's own tracking state. Same "vanilla primitive exposed
 * for React" category as window.applyFreshPrPayload, not a blocker.
 */
export function useRefreshAvailableRepoLabels() {
  return useCallback((repoOverride) => window.refreshAvailableRepoLabels?.(repoOverride), []);
}
